/**
 * Classroom media serving route.
 *
 * Handles GET requests for generated images, videos, and TTS audio associated
 * with a classroom.  Authentication and access-control are enforced before any
 * file data is returned.
 *
 * Local storage  → streams the file from disk.
 * S3 storage     → issues a 307 redirect to a pre-signed S3 URL (1-hour TTL),
 *                  OR — if S3_PUBLIC_URL is set — a permanent 301 redirect to
 *                  the CDN/public URL.
 */

import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { CLASSROOMS_DIR, isValidClassroomId } from '@/lib/server/classroom-storage';
import { auth } from '@/lib/auth/auth';
import { userHasClassroomAccess } from '@/lib/auth/helpers';
import { createLogger } from '@/lib/logger';
import { getObjectStore, LocalObjectStore, S3ObjectStore } from '@/lib/storage/object-store';

const log = createLogger('ClassroomMedia');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { classroomId, path: pathSegments } = await params;

  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  const canAccess = await userHasClassroomAccess(session.user.id, session.user.role, classroomId);
  if (!canAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 404 });
  }

  // Object-store key for this media file
  const objectKey = `classrooms/${classroomId}/${joined}`;
  const store = getObjectStore();

  // -------------------------------------------------------------------
  // S3 backend — redirect to pre-signed URL or CDN
  // -------------------------------------------------------------------
  if (store instanceof S3ObjectStore) {
    try {
      const publicUrl = process.env.S3_PUBLIC_URL;
      if (publicUrl) {
        // Public/CDN bucket — permanent redirect (client caches it)
        const target = `${publicUrl.replace(/\/$/, '')}/${objectKey}`;
        return NextResponse.redirect(target, { status: 301 });
      }

      // Private bucket — generate a 1-hour pre-signed URL
      const presigned = await store.presign(objectKey, 3600);
      return NextResponse.redirect(presigned, { status: 307 });
    } catch (err) {
      log.error(`S3 presign failed [key=${objectKey}]:`, err);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------
  // Local filesystem backend — stream the file
  // -------------------------------------------------------------------
  if (!(store instanceof LocalObjectStore)) {
    // Unknown store type — fall back to generic buffer response
    const buf = await store.get(objectKey);
    if (!buf) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const ext = path.extname(pathSegments[pathSegments.length - 1]).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  }

  const filePath = path.join(CLASSROOMS_DIR, classroomId, ...pathSegments);
  const resolvedBase = path.resolve(CLASSROOMS_DIR, classroomId);

  try {
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    log.error(`Classroom media serving failed [classroomId=${classroomId}, path=${joined}]:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
