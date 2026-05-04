'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, Download, BookOpen, CheckCircle2, XCircle, Minus } from 'lucide-react';

interface AnswerRow {
  questionId: string;
  answer: string;
  score: number;
  comment?: string;
  overrideScore?: number;
  overrideComment?: string;
}

interface GradeResult {
  id: string;
  sceneId: string;
  sceneTitle: string;
  score: number;
  maxScore: number;
  answers: AnswerRow[];
  gradedAt: string;
  gradedBy: string;
}

interface GradesResponse {
  results: GradeResult[];
  totalScore: number;
  totalMax: number;
}

export default function StudentGradesPage() {
  const params = useParams();
  const router = useRouter();
  const classroomId = params?.id as string;
  const { data: session } = useSession();
  const { t } = useI18n();

  const [data, setData] = useState<GradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/grades?classroomId=${encodeURIComponent(classroomId)}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    if (session?.user) load();
  }, [session, load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePrint = () => window.print();

  const pct = data && data.totalMax > 0 ? Math.round((data.totalScore / data.totalMax) * 100) : null;

  const scoreColor = (score: number, max: number) => {
    if (max === 0) return 'text-slate-400';
    const p = score / max;
    if (p >= 0.8) return 'text-emerald-400';
    if (p >= 0.5) return 'text-amber-400';
    return 'text-rose-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <span className="animate-pulse">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/classroom/${classroomId}`)}
            className="gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <Download className="w-4 h-4" />
            {t('classroom.grades')} PDF
          </Button>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">{t('classroom.grades')}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{classroomId}</p>
        </div>

        {/* Summary card */}
        {data && (
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 flex items-center gap-6">
            <div className="flex-1 space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Score</p>
              <p className="text-3xl font-bold">
                {data.totalScore}
                <span className="text-slate-400 dark:text-slate-500 font-normal text-lg">/{data.totalMax}</span>
              </p>
            </div>
            {pct !== null && (
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-full h-full">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14"
                    fill="none"
                    stroke={pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171'}
                    strokeWidth="3"
                    strokeDasharray={`${(pct / 100) * 87.96} 87.96`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                  {pct}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {data?.results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <BookOpen className="w-10 h-10 opacity-40" />
            <p>No quiz results yet.</p>
          </div>
        )}

        {/* Results list */}
        <div className="space-y-3">
          {data?.results.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden"
            >
              {/* Row header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => r.answers?.length > 0 && toggleExpand(r.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.sceneTitle}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.gradedAt).toLocaleDateString()} · {r.answers?.length ?? 0} questions
                  </p>
                </div>
                <span className={cn('text-xl font-bold tabular-nums', scoreColor(r.score, r.maxScore))}>
                  {r.score}/{r.maxScore}
                </span>
              </button>

              {/* Expanded answers */}
              {expanded.has(r.id) && r.answers?.length > 0 && (
                <div className="border-t border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                  {r.answers.map((a, i) => {
                    const effectiveScore = a.overrideScore ?? a.score;
                    return (
                      <div key={a.questionId ?? i} className="px-4 py-3 flex gap-3">
                        <div className="mt-0.5">
                          {effectiveScore > 0 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : effectiveScore === 0 && a.score === 0 ? (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          ) : (
                            <Minus className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm text-slate-600 dark:text-slate-300 break-words">{a.answer || <em className="text-slate-400 dark:text-slate-500">No answer</em>}</p>
                          {(a.overrideComment || a.comment) && (
                            <p className="text-xs text-slate-500 italic">{a.overrideComment ?? a.comment}</p>
                          )}
                        </div>
                        <span className="text-sm font-medium tabular-nums text-slate-400 shrink-0">
                          {effectiveScore} pt{effectiveScore !== 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
