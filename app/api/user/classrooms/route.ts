import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/auth/prisma';
import { readClassroom } from '@/lib/server/classroom-storage';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'STUDENT') {
    return NextResponse.json({ classrooms: [] });
  }

  const assignments = await prisma.classroomAccess.findMany({
    where: { userId: session.user.id },
    orderBy: { assignedAt: 'desc' },
  });

  const classrooms = await Promise.all(
    assignments.map(async (assignment) => {
      const persisted = await readClassroom(assignment.classroomId);
      const isOwnedByUser =
        assignment.assignedBy === session.user.id ||
        persisted?.stage?.ownerUserId === session.user.id;
      if (isOwnedByUser) return null;

      // Fetch instructor name
      let instructorName: string | null = null;
      try {
        const instructor = await prisma.user.findUnique({
          where: { id: assignment.assignedBy },
          select: { name: true },
        });
        instructorName = instructor?.name ?? null;
      } catch {
        // non-critical
      }

      // Scene count and types from persisted stage
      const scenes = persisted?.scenes ?? [];
      const sceneTypes = [...new Set(scenes.map((s: { type: string }) => s.type))];

      // Progress for this classroom
      const progressRows = await prisma.sceneProgress.findMany({
        where: { userId: session.user.id, classroomId: assignment.classroomId },
        select: { sceneId: true, completedAt: true, lastViewedAt: true },
        orderBy: { lastViewedAt: 'desc' },
      });

      const completedCount = progressRows.filter((r) => r.completedAt).length;
      const lastViewedScene = progressRows[0]?.sceneId ?? null;

      return {
        id: assignment.classroomId,
        name: persisted?.stage?.name || assignment.classroomId,
        description: persisted?.stage?.description || '',
        createdAt: persisted?.stage?.createdAt || new Date(assignment.assignedAt).getTime(),
        updatedAt: persisted?.stage?.updatedAt || new Date(assignment.assignedAt).getTime(),
        assignedAt: assignment.assignedAt.getTime(),
        unread: assignment.unreadAssignment,
        instructorName,
        sceneCount: scenes.length,
        sceneTypes,
        completedScenes: completedCount,
        lastViewedScene,
      };
    }),
  );

  return NextResponse.json({ classrooms: classrooms.filter(Boolean) });
}

/** PATCH /api/user/classrooms — mark assignment as read */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { classroomId } = await req.json();
  if (!classroomId) return NextResponse.json({ error: 'classroomId required' }, { status: 400 });

  await prisma.classroomAccess.updateMany({
    where: { userId: session.user.id, classroomId },
    data: { unreadAssignment: false },
  });

  return NextResponse.json({ success: true });
}
