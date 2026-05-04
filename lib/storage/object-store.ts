/**
 * Object Store abstraction
 *
 * Provides a uniform interface for reading and writing blobs (binary or JSON)
 * backed by either the local filesystem or Amazon S3 (and S3-compatible
 * services such as Cloudflare R2 and MinIO).
 *
 * Keys follow a virtual path convention — forward-slash separated strings that
 * map to file paths on local disk and to S3 object keys in the cloud:
 *
 *   classrooms/{id}.json
 *   classrooms-deleted/{id}.json
 *   classrooms-deleted/index.json
 *   classroom-jobs/{id}.json
 *   classrooms/{id}/media/{filename}
 *   classrooms/{id}/audio/{filename}
 *
 * Select the backend by setting STORAGE_BACKEND=s3 in your environment and
 * providing S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 * See .env.example for all available options.
 */

import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ObjectStore {
  /** Read an object. Returns null if not found. */
  get(key: string): Promise<Buffer | null>;

  /** Write an object. Creates intermediate "directories" as needed. */
  put(key: string, data: Buffer, contentType?: string): Promise<void>;

  /** Delete an object. Silently succeeds if the key does not exist. */
  delete(key: string): Promise<void>;

  /**
   * Atomically move an object from srcKey to destKey.
   * On local storage this is an `fs.rename`; on S3 it is copy + delete.
   */
  move(srcKey: string, destKey: string): Promise<void>;

  /** Returns true if the key exists. */
  exists(key: string): Promise<boolean>;

  /**
   * List keys that begin with the given prefix.
   * The prefix should end with '/' to list a "directory".
   */
  list(prefix: string): Promise<string[]>;

  /**
   * Return the serving URL for a media/audio key.
   * - Local: always '/api/classroom-media/...'
   * - S3 (private bucket): '/api/classroom-media/...' (the route issues a pre-signed redirect)
   * - S3 (public bucket / CDN via S3_PUBLIC_URL): direct CDN URL
   */
  mediaUrl(key: string, appBaseUrl: string): string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a raw object as a pretty-printed JSON buffer. */
export function toJsonBuffer(data: unknown): Buffer {
  return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
}

/** Decode a buffer as JSON. Returns null on empty buffer. */
export function fromJsonBuffer<T>(buf: Buffer): T {
  return JSON.parse(buf.toString('utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Local filesystem implementation
// ---------------------------------------------------------------------------

export class LocalObjectStore implements ObjectStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private keyToPath(key: string): string {
    // Forward-slash keys → OS-specific path under root
    return path.join(this.root, ...key.split('/'));
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.keyToPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.keyToPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    // Atomic write: write to temp file then rename
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, p);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.keyToPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async move(srcKey: string, destKey: string): Promise<void> {
    const src = this.keyToPath(srcKey);
    const dest = this.keyToPath(destKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.stat(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = this.keyToPath(prefix.replace(/\/$/, ''));
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const trimmedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      return entries
        .filter((e) => e.isFile())
        .map((e) => `${trimmedPrefix}${e.name}`);
    } catch {
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mediaUrl(key: string, appBaseUrl: string): string {
    // key is like  classrooms/{id}/media/{filename}
    //              classrooms/{id}/audio/{filename}
    // Strip leading "classrooms/{id}/" → "{type}/{filename}"
    const parts = key.split('/');
    // parts: ['classrooms', id, 'media'|'audio', filename]
    const classroomId = parts[1];
    const rest = parts.slice(2).join('/');
    return `${appBaseUrl}/api/classroom-media/${classroomId}/${rest}`;
  }

  /** Resolve the real filesystem path for a media key (used by the serving route). */
  resolveMediaPath(key: string): string {
    return this.keyToPath(key);
  }
}

// ---------------------------------------------------------------------------
// S3 implementation
// ---------------------------------------------------------------------------

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicUrl?: string;
}

export class S3ObjectStore implements ObjectStore {
  private readonly bucket: string;
  private readonly publicUrl: string | undefined;
  private _client: import('@aws-sdk/client-s3').S3Client | null = null;

  constructor(private readonly config: S3Config) {
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
  }

  private async client(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (!this._client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this._client = new S3Client({
        region: this.config.region,
        ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        // Path-style required for MinIO and some R2 setups
        forcePathStyle: !!this.config.endpoint,
      });
    }
    return this._client;
  }

  async get(key: string): Promise<Buffer | null> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const client = await this.client();
      const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      throw err;
    }
  }

  async put(key: string, data: Buffer, contentType = 'application/octet-stream'): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    // S3 DeleteObject is idempotent — silently succeeds for missing keys
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async move(srcKey: string, destKey: string): Promise<void> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: encodeURIComponent(`${this.bucket}/${srcKey}`),
        Key: destKey,
      }),
    );
    await this.delete(srcKey);
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const client = await this.client();
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    const result = await client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    return (result.Contents ?? []).map((obj) => obj.Key ?? '').filter(Boolean);
  }

  mediaUrl(key: string, appBaseUrl: string): string {
    // key: classrooms/{id}/media/{filename}  or  classrooms/{id}/audio/{filename}
    if (this.publicUrl) {
      // Direct CDN/public URL — no server round-trip
      return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    // Private bucket — the serving route will issue a pre-signed redirect
    const parts = key.split('/');
    const classroomId = parts[1];
    const rest = parts.slice(2).join('/');
    return `${appBaseUrl}/api/classroom-media/${classroomId}/${rest}`;
  }

  /**
   * Generate a pre-signed GET URL for the given key.
   * Valid for `expiresIn` seconds (default 3600 = 1 hour).
   */
  async presign(key: string, expiresIn = 3600): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.client();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _store: ObjectStore | null = null;

/**
 * Return the configured object store singleton.
 *
 * When STORAGE_BACKEND=s3 the S3ObjectStore is returned; otherwise the local
 * filesystem store rooted at `<cwd>/data` is returned.
 */
export function getObjectStore(): ObjectStore {
  if (!_store) {
    if (process.env.STORAGE_BACKEND === 's3') {
      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION || 'us-east-1';
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

      if (!bucket) throw new Error('S3 storage requires S3_BUCKET to be set');
      if (!accessKeyId) throw new Error('S3 storage requires S3_ACCESS_KEY_ID to be set');
      if (!secretAccessKey) throw new Error('S3 storage requires S3_SECRET_ACCESS_KEY to be set');

      _store = new S3ObjectStore({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: process.env.S3_ENDPOINT || undefined,
        publicUrl: process.env.S3_PUBLIC_URL || undefined,
      });
    } else {
      _store = new LocalObjectStore(path.join(process.cwd(), 'data'));
    }
  }
  return _store;
}

/** Clear the singleton (useful in tests). */
export function resetObjectStore(): void {
  _store = null;
}
