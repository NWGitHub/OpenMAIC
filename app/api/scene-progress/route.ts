import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/auth/prisma';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const upsertSchema = z.object({
  classroomId: z.string().min(1),
  sceneId: z.string().min(1),
  completed: z.boolean().optional(),
});

/** GET /api/scene-progress?classroomId=... — fetch all progress for a classroom */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const classroomId = req.nextUrl.searchParams.get('classroomId');
  if (!classroomId) return NextResponse.json({ error: 'classroomId required' }, { status: 400 });

  const rows = await prisma.sceneProgress.findMany({
    where: { userId: session.user.id, classroomId },
    select: { sceneId: true, completedAt: true, lastViewedAt: true },
  });

  return NextResponse.json({ progress: rows });
}

/** POST /api/scene-progress — upsert viewed/completed state for one scene */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { classroomId, sceneId, completed } = parsed.data;
  const now = new Date();

  const progress = await prisma.sceneProgress.upsert({
    where: { userId_classroomId_sceneId: { userId: session.user.id, classroomId, sceneId } },
    create: {
      userId: session.user.id,
      classroomId,
      sceneId,
      lastViewedAt: now,
      completedAt: completed ? now : null,
    },
    update: {
      lastViewedAt: now,
      ...(completed ? { completedAt: now } : {}),
    },
    select: { sceneId: true, completedAt: true, lastViewedAt: true },
  });

  return NextResponse.json({ progress });
}
