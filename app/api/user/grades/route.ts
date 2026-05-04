import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/auth/prisma';
import type { NextRequest } from 'next/server';

/** GET /api/user/grades?classroomId=... */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const classroomId = req.nextUrl.searchParams.get('classroomId');
  if (!classroomId) return NextResponse.json({ error: 'classroomId required' }, { status: 400 });

  const results = await prisma.quizResult.findMany({
    where: { classroomId, studentDbUserId: session.user.id },
    orderBy: { gradedAt: 'desc' },
    select: {
      id: true,
      sceneId: true,
      sceneTitle: true,
      score: true,
      maxScore: true,
      answers: true,
      gradedAt: true,
      gradedBy: true,
    },
  });

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalMax = results.reduce((sum, r) => sum + r.maxScore, 0);

  return NextResponse.json({ results, totalScore, totalMax });
}
