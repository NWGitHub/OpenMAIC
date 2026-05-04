/**
 * Classroom persistence layer.
 *
 * All reads and writes go through the ObjectStore abstraction so the app runs
 * identically on the local filesystem and on S3 / S3-compatible object storage
 * (Cloudflare R2, MinIO, …).  Set STORAGE_BACKEND=s3 and the S3_* variables to
 * switch backends — no other code change is required.
 *
 * Key layout:
 *   classrooms/{id}.json
 *   classrooms-deleted/{id}.json
 *   classrooms-deleted/index.json
 */

import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { getObjectStore, toJsonBuffer, fromJsonBuffer } from '@/lib/storage/object-store';

// ---------------------------------------------------------------------------
// Legacy local-path constants (kept for the local filesystem serving route)
// ---------------------------------------------------------------------------

/** Absolute path to the local classrooms directory.
 *  Only meaningful when STORAGE_BACKEND=local (the default). */
export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');
export const DELETED_CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms-deleted');

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const classroomKey = (id: string) => `classrooms/${id}.json`;
const deletedKey = (id: string) => `classrooms-deleted/${id}.json`;
const DELETED_INDEX_KEY = 'classrooms-deleted/index.json';

// ---------------------------------------------------------------------------
// In-process mutex for the deleted-classroom index.
//
// For single-instance deployments (local + S3) this prevents interleaved
// read-modify-write sequences.  Multi-instance deployments behind a load
// balancer should use sticky sessions or a distributed lock for the index;
// as classroom deletion is a rare admin operation this is acceptable for now.
// ---------------------------------------------------------------------------

let _indexLock: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Compatibility shim: writeJsonFileAtomic
//
// Used by classroom-job-store.ts which still imports this helper directly.
// Routes all writes through the ObjectStore so they work on both backends.
// ---------------------------------------------------------------------------

export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  // Convert the absolute local path back to an object-store key.
  // e.g. /…/data/classrooms/abc.json  →  classrooms/abc.json
  const dataRoot = path.join(process.cwd(), 'data');
  const rel = path.relative(dataRoot, filePath);
  // Normalize OS separators to forward-slashes
  const key = rel.split(path.sep).join('/');
  await getObjectStore().put(key, toJsonBuffer(data), 'application/json');
}

// Kept for backward-compat (callers that import ensureClassroomsDir / ensureClassroomJobsDir)
export async function ensureClassroomsDir(): Promise<void> { /* no-op with ObjectStore */ }
export async function ensureClassroomJobsDir(): Promise<void> { /* no-op with ObjectStore */ }

// ---------------------------------------------------------------------------
// Request-origin helper
// ---------------------------------------------------------------------------

/**
 * Build the base URL for server-generated classroom links.
 *
 * x-forwarded-host is only trusted when TRUST_PROXY=true is set in the
 * environment (the server sits behind a trusted reverse proxy that controls
 * those headers).
 */
export function buildRequestOrigin(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    const host = req.headers.get('x-forwarded-host');
    if (host) {
      const proto = req.headers.get('x-forwarded-proto') || 'https';
      return `${proto}://${host}`;
    }
  }
  return req.nextUrl.origin;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export interface DeletedClassroomRecord {
  id: string;
  ownerUserId: string;
  deletedBy: string;
  deletedAt: string;
  purgeAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

// ---------------------------------------------------------------------------
// Classroom CRUD
// ---------------------------------------------------------------------------

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const buf = await getObjectStore().get(classroomKey(id));
  if (!buf) return null;
  return fromJsonBuffer<PersistedClassroomData>(buf);
}

export async function persistClassroom(
  data: { id: string; stage: Stage; scenes: Scene[] },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  await getObjectStore().put(classroomKey(data.id), toJsonBuffer(classroomData), 'application/json');

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}

// ---------------------------------------------------------------------------
// Soft-delete / restore / purge
// ---------------------------------------------------------------------------

const DELETED_RETENTION_DAYS = 180;
const DELETED_RETENTION_MS = DELETED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

async function readDeletedIndex(): Promise<DeletedClassroomRecord[]> {
  const buf = await getObjectStore().get(DELETED_INDEX_KEY);
  if (!buf) return [];
  const parsed = fromJsonBuffer<DeletedClassroomRecord[]>(buf);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeDeletedIndex(records: DeletedClassroomRecord[]): Promise<void> {
  await getObjectStore().put(DELETED_INDEX_KEY, toJsonBuffer(records), 'application/json');
}

export async function purgeExpiredDeletedClassrooms(): Promise<{ purgedCount: number }> {
  let purgedCount = 0;

  const work = async () => {
    const now = Date.now();
    const records = await readDeletedIndex();
    const keep: DeletedClassroomRecord[] = [];
    const purge: DeletedClassroomRecord[] = [];

    for (const record of records) {
      if (new Date(record.purgeAt).getTime() <= now) purge.push(record);
      else keep.push(record);
    }

    await Promise.all(purge.map((r) => getObjectStore().delete(deletedKey(r.id))));

    if (purge.length > 0) {
      await writeDeletedIndex(keep);
    }

    purgedCount = purge.length;
  };

  _indexLock = _indexLock.then(work);
  await _indexLock;
  return { purgedCount };
}

export async function softDeleteClassroom(params: {
  id: string;
  ownerUserId: string;
  deletedBy: string;
}) {
  const store = getObjectStore();

  // Check the classroom exists
  const buf = await store.get(classroomKey(params.id));
  if (!buf) return { deleted: false as const };

  // Move active → deleted
  await store.move(classroomKey(params.id), deletedKey(params.id));

  const deletedAt = new Date();
  const purgeAt = new Date(deletedAt.getTime() + DELETED_RETENTION_MS);
  const record: DeletedClassroomRecord = {
    id: params.id,
    ownerUserId: params.ownerUserId,
    deletedBy: params.deletedBy,
    deletedAt: deletedAt.toISOString(),
    purgeAt: purgeAt.toISOString(),
  };

  const work = async () => {
    const records = await readDeletedIndex();
    const next = [...records.filter((r) => r.id !== params.id), record];
    await writeDeletedIndex(next);
  };

  _indexLock = _indexLock.then(work);
  await _indexLock;

  return { deleted: true as const, record };
}

export async function listDeletedClassrooms(): Promise<DeletedClassroomRecord[]> {
  await purgeExpiredDeletedClassrooms();
  const records = await readDeletedIndex();
  return records.sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
  );
}

export async function readDeletedClassroom(id: string): Promise<PersistedClassroomData | null> {
  const buf = await getObjectStore().get(deletedKey(id));
  if (!buf) return null;
  return fromJsonBuffer<PersistedClassroomData>(buf);
}

export async function purgeDeletedClassroom(id: string): Promise<boolean> {
  let purged = false;

  const work = async () => {
    const records = await readDeletedIndex();
    const target = records.find((r) => r.id === id);
    if (!target) return;

    await getObjectStore().delete(deletedKey(id));
    await writeDeletedIndex(records.filter((r) => r.id !== id));
    purged = true;
  };

  _indexLock = _indexLock.then(work);
  await _indexLock;
  return purged;
}

export async function restoreDeletedClassroom(id: string): Promise<DeletedClassroomRecord | null> {
  let restored: DeletedClassroomRecord | null = null;

  const work = async () => {
    const records = await readDeletedIndex();
    const target = records.find((r) => r.id === id);
    if (!target) return;

    const exists = await getObjectStore().exists(deletedKey(id));
    if (!exists) return;

    await getObjectStore().move(deletedKey(id), classroomKey(id));
    await writeDeletedIndex(records.filter((r) => r.id !== id));
    restored = target;
  };

  _indexLock = _indexLock.then(work);
  await _indexLock;
  return restored;
}
