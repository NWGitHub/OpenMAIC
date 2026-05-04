import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/auth/prisma';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const messageSchema = z.object({
  role: z.enum(['user', 'agent', 'system']),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  content: z.string(),
  timestamp: z.number(),
});

const appendSchema = z.object({
  classroomId: z.string().min(1),
  sceneId: z.string().min(1),
  message: messageSchema,
});

/** GET /api/pbl-session?classroomId=...&sceneId=... */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const classroomId = req.nextUrl.searchParams.get('classroomId');
  const sceneId = req.nextUrl.searchParams.get('sceneId');
  if (!classroomId || !sceneId) return NextResponse.json({ error: 'classroomId and sceneId required' }, { status: 400 });

  const record = await prisma.pBLSession.findUnique({
    where: { userId_classroomId_sceneId: { userId: session.user.id, classroomId, sceneId } },
    select: { messages: true, updatedAt: true },
  });

  return NextResponse.json({ messages: record?.messages ?? [], updatedAt: record?.updatedAt ?? null });
}

/** POST /api/pbl-session — append a message to the session transcript */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = appendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { classroomId, sceneId, message } = parsed.data;

  const existing = await prisma.pBLSession.findUnique({
    where: { userId_classroomId_sceneId: { userId: session.user.id, classroomId, sceneId } },
    select: { messages: true },
  });

  const messages = Array.isArray(existing?.messages) ? [...(existing.messages as object[]), message] : [message];

  const record = await prisma.pBLSession.upsert({
    where: { userId_classroomId_sceneId: { userId: session.user.id, classroomId, sceneId } },
    create: { userId: session.user.id, classroomId, sceneId, messages },
    update: { messages },
    select: { messages: true, updatedAt: true },
  });

  return NextResponse.json({ messages: record.messages, updatedAt: record.updatedAt });
}

/** DELETE /api/pbl-session?classroomId=...&sceneId=... — clear transcript */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const classroomId = req.nextUrl.searchParams.get('classroomId');
  const sceneId = req.nextUrl.searchParams.get('sceneId');
  if (!classroomId || !sceneId) return NextResponse.json({ error: 'classroomId and sceneId required' }, { status: 400 });

  await prisma.pBLSession.deleteMany({
    where: { userId: session.user.id, classroomId, sceneId },
  });

  return NextResponse.json({ success: true });
}
