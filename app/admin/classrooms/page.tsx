'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/admin/common/EmptyState';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/* ── Types ────────────────────────────────────────────────────────────── */

interface ClassroomRow {
  classroomId: string;
  title: string;
  ownerUserId: string;
  studentCount: number;
  updatedAt: string;
  status: 'active' | 'missing';
  recoverable: boolean;
}

interface DeletedClassroomRow {
  id: string;
  name: string | null;
  ownerUserId: string;
  deletedBy: string;
  deletedAt: string;
  purgeAt: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/* ── Main page ────────────────────────────────────────────────────────── */

export default function AdminClassroomsPage() {
  const { t } = useI18n();

  /* active classrooms */
  const [rows, setRows] = useState<ClassroomRow[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);

  /* deleted classrooms */
  const [deleted, setDeleted] = useState<DeletedClassroomRow[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(true);

  /* action states */
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  /* ── Fetch active classrooms ── */
  const fetchActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const res = await fetch('/api/admin/classrooms');
      const data = (await res.json()) as { classrooms?: ClassroomRow[] };
      setRows(data.classrooms ?? []);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  /* ── Fetch deleted classrooms ── */
  const fetchDeleted = useCallback(async () => {
    setLoadingDeleted(true);
    try {
      const res = await fetch('/api/admin/classrooms/recover');
      const data = (await res.json()) as { classrooms?: DeletedClassroomRow[] };
      setDeleted(data.classrooms ?? []);
    } finally {
      setLoadingDeleted(false);
    }
  }, []);

  useEffect(() => {
    void fetchActive();
    void fetchDeleted();
  }, [fetchActive, fetchDeleted]);

  /* ── Recover ── */
  const handleRecover = useCallback(
    async (classroomId: string) => {
      setRecoveringId(classroomId);
      try {
        const res = await fetch('/api/admin/classrooms/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: classroomId }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(payload.error ?? t('adminClassrooms.recoverFailed'));
          return;
        }
        toast.success(t('adminClassrooms.recoverSuccess'));
        await Promise.all([fetchActive(), fetchDeleted()]);
      } finally {
        setRecoveringId(null);
      }
    },
    [fetchActive, fetchDeleted, t],
  );

  /* ── Purge (permanent delete) ── */
  const handlePurge = useCallback(
    async (classroomId: string) => {
      setPurgingId(classroomId);
      setConfirmPurgeId(null);
      try {
        const res = await fetch('/api/admin/classrooms/purge', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: classroomId }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(payload.error ?? 'Failed to purge classroom');
          return;
        }
        toast.success('Classroom permanently deleted');
        await fetchDeleted();
      } finally {
        setPurgingId(null);
      }
    },
    [fetchDeleted],
  );

  /* ── Active rows split ── */
  const activeRows = rows.filter((r) => r.status === 'active');

  /* ─────────────────────────── Render ──────────────────────────────── */
  return (
    <div className="space-y-10">

      {/* ═══ Active Classrooms ═══════════════════════════════════════════ */}
      <section>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('adminClassrooms.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All classrooms that are currently active in the system.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
          {loadingActive ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : activeRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t('adminClassrooms.noClassrooms')}
                description={t('adminClassrooms.noClassroomsDesc')}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10">
                  {[
                    t('adminClassrooms.columns.classroom'),
                    t('adminClassrooms.columns.title'),
                    t('adminClassrooms.columns.owner'),
                    t('adminClassrooms.columns.students'),
                    t('adminClassrooms.columns.updated'),
                    '',
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {activeRows.map((row) => (
                  <tr key={row.classroomId} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">
                      {row.classroomId}
                    </td>
                    <td className="px-4 py-3 text-slate-900 dark:text-white">{row.title}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {row.ownerUserId}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {row.studentCount}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {fmt(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/classrooms/${row.classroomId}`}
                        className="text-primary hover:text-primary/80 text-sm font-medium"
                      >
                        {t('adminClassrooms.manage')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ═══ Deleted Classrooms ══════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-500" />
              Deleted Classrooms
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Soft-deleted classrooms are kept for up to 180 days before being
              automatically purged. You can recover them or permanently delete them early.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-rose-200/60 dark:border-rose-500/20 bg-white dark:bg-rose-500/5">
          {loadingDeleted ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-rose-500" />
            </div>
          ) : deleted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-slate-500">
              <ShieldAlert className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">No deleted classrooms</p>
              <p className="text-xs mt-1 opacity-70">
                Soft-deleted classrooms will appear here until they are recovered or purged.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rose-200/60 dark:border-rose-500/20">
                  {['ID', 'Name', 'Owner', 'Deleted By', 'Deleted On', 'Auto-Purge', 'Days Left', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-xs uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100/60 dark:divide-rose-500/10">
                {deleted.map((row) => {
                  const days = daysUntil(row.purgeAt);
                  const urgent = days <= 14;
                  const isConfirming = confirmPurgeId === row.id;
                  const isPurging = purgingId === row.id;
                  const isRecovering = recoveringId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'hover:bg-rose-50/50 dark:hover:bg-rose-500/5',
                        isConfirming && 'bg-rose-50 dark:bg-rose-500/10',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {row.id}
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">
                        {row.name ?? <span className="italic text-slate-400">Unknown</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {row.ownerUserId}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {row.deletedBy === row.ownerUserId ? (
                          <span className="italic opacity-60">owner</span>
                        ) : (
                          row.deletedBy
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {fmt(row.deletedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {fmt(row.purgeAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            urgent
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {urgent && <AlertTriangle className="h-3 w-3" />}
                          {days}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isConfirming ? (
                          /* Inline purge confirmation */
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                              Permanently delete?
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1"
                              disabled={isPurging}
                              onClick={() => void handlePurge(row.id)}
                            >
                              {isPurging ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Purge
                            </Button>
                            <button
                              onClick={() => setConfirmPurgeId(null)}
                              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {/* Recover */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                              disabled={isRecovering || isPurging}
                              onClick={() => void handleRecover(row.id)}
                            >
                              {isRecovering ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Recover
                            </Button>

                            {/* Purge */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1 border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
                              disabled={isRecovering || isPurging}
                              onClick={() => setConfirmPurgeId(row.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Purge
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer: total count + storage note */}
              <tfoot>
                <tr className="border-t border-rose-200/60 dark:border-rose-500/20">
                  <td
                    colSpan={8}
                    className="px-4 py-2.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {deleted.length} deleted classroom{deleted.length !== 1 ? 's' : ''} — files are
                    automatically purged 180 days after deletion.
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
