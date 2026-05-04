/**
 * Admin — permanently purge a soft-deleted classroom.
 *
 * DELETE /api/admin/classrooms/purge
 * Body: { id: string }
 *
 * This removes the classroom JSON from /data/classrooms-deleted/ and
 * drops its entry from the deleted index. The action is irreversible.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole, writeAuditLog } from '@/lib/auth/helpers';
import { purgeDeletedClassroom } from '@/lib/server/classroom-storage';
import { prisma } from '@/lib/auth/prisma';

export async function DELETE(req: NextRequest) {
  let session;
  try {
    session = await requireRole('ADMIN');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const classroomId = body.id?.trim();
  if (!classroomId) {
    return NextResponse.json({ error: 'Missing classroom id' }, { status: 400 });
  }

  const purged = await purgeDeletedClassroom(classroomId);
  if (!purged) {
    return NextResponse.json(
      { error: 'Classroom not found in deleted records' },
      { status: 404 },
    );
  }

  // Also clean up any lingering ClassroomAccess rows in the DB.
  await prisma.classroomAccess.deleteMany({ where: { classroomId } });

  void writeAuditLog({
    actorId: session.user.id,
    action: 'classroom.purge',
    resource: 'Classroom',
    resourceId: classroomId,
    details: { permanent: true },
    req,
  });

  return NextResponse.json({ success: true, id: classroomId });
}
