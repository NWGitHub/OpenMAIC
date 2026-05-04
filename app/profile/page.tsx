'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  User,
  Shield,
  Download,
  Trash2,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';
import { MuBrandingHeader } from '@/components/mu-branding-header';

interface EnrolledClassroom {
  id: string;
  name: string;
  completedScenes: number;
  sceneCount: number;
  instructorName: string | null;
}

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  studentId: string | null;
  bio: string | null;
  image: string | null;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  consentGiven: boolean;
  consentAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ bio: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [classrooms, setClassrooms] = useState<EnrolledClassroom[]>([]);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.user);
        setForm({ bio: d.user?.bio ?? '' });
        if (d.user?.role === 'STUDENT') {
          fetch('/api/user/classrooms')
            .then((r) => r.json())
            .then((cl) => setClassrooms(cl.classrooms ?? []))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: form.bio.trim() }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? t('profilePage.saveSuccess') : t('profilePage.saveFailed'));
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError(t('profilePage.pwMismatch'));
      return;
    }
    if (pwForm.newPassword.length < 10) {
      setPwError(t('profilePage.pwTooShort'));
      return;
    }
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    });
    const data = await res.json();
    if (!res.ok) setPwError(data.error ?? t('profilePage.pwChangeFailed'));
    else { setPwSuccess(true); setPwForm({ currentPassword: '', newPassword: '', confirm: '' }); }
  }

  async function exportData() {
    const res = await fetch('/api/user/data-export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmaic-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    await fetch('/api/user/delete-account', { method: 'DELETE' });
    await signOut({ callbackUrl: '/auth/signin' });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* MU-OpenMAIC branding — top centre */}
        <div className="flex justify-center pt-2 pb-2">
          <MuBrandingHeader large />
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('profilePage.title')}</h1>
          <Link href="/" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">{t('profilePage.back')}</Link>
        </div>

        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
          <h2 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500 dark:text-slate-400" /> {t('profilePage.profileInfo')}
          </h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">{t('profilePage.fullName')}</label>
              <input value={profile?.name ?? '—'} readOnly
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">{t('profilePage.bio')}</label>
              <textarea value={form.bio} onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))} rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
            </div>
            <div className="flex items-center justify-between">
              {saveMsg && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> {saveMsg}
                </p>
              )}
              <Button type="submit" disabled={saving} className="ml-auto bg-purple-600 hover:bg-purple-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profilePage.saveChanges')}
              </Button>
            </div>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-1">
            {profile?.role === 'STUDENT' && profile.studentId && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">{t('profilePage.studentId')}:</span>
                <span className="font-mono text-sm font-bold text-purple-800 dark:text-purple-200">{profile.studentId}</span>
              </div>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-500 space-y-1">
              <p>{t('profilePage.email')}: <span className="text-slate-700 dark:text-slate-300">{profile?.email}</span></p>
              {(profile?.role !== 'STUDENT' || !profile.studentId) && (
                <p>{t('profilePage.studentId')}: <span className="text-slate-700 dark:text-slate-300">{profile?.studentId ?? '—'}</span></p>
              )}
              <p>{t('profilePage.role')}: <span className="text-slate-700 dark:text-slate-300">{profile?.role}</span></p>
              <p>{t('profilePage.memberSince')}: <span className="text-slate-700 dark:text-slate-300">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</span></p>
              <p>{t('profilePage.lastLogin')}: <span className="text-slate-700 dark:text-slate-300">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'}</span></p>
            </div>
          </div>
        </section>

        {/* Student learning stats */}
        {profile?.role === 'STUDENT' && (
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
            <h2 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" /> {t('classroom.enrolledClassrooms')}
            </h2>
            {classrooms.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('classroom.noInvitedClassrooms')}</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 px-4 py-3">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{classrooms.length}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('classroom.enrolledClassrooms')}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 px-4 py-3">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {classrooms.reduce((s, c) => s + c.completedScenes, 0)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('classroom.scenesCompleted')}</p>
                  </div>
                </div>
                {classrooms.map((c) => (
                  <Link
                    key={c.id}
                    href={`/classroom/${c.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors group"
                  >
                    <BookOpen className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300">{c.name}</p>
                      {c.instructorName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.instructorName}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{c.completedScenes}/{c.sceneCount}</p>
                      {c.sceneCount > 0 && (
                        <div className="w-16 h-1 mt-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: `${Math.round((c.completedScenes / c.sceneCount) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {session?.user && (
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
            <h2 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500 dark:text-slate-400" /> {t('profilePage.changePassword')}
            </h2>
            <form onSubmit={changePassword} className="space-y-4">
              {['currentPassword', 'newPassword', 'confirm'].map((field) => (
                <div key={field}>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">
                    {field === 'currentPassword' ? t('profilePage.currentPassword') : field === 'newPassword' ? t('profilePage.newPassword') : t('profilePage.confirmPassword')}
                  </label>
                  <input type="password" value={pwForm[field as keyof typeof pwForm]}
                    onChange={(e) => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              ))}
              {pwError && <p className="text-red-500 dark:text-red-400 text-sm">{pwError}</p>}
              {pwSuccess && <p className="text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {t('profilePage.pwChangeSuccess')}</p>}
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">{t('profilePage.updatePassword')}</Button>
            </form>
          </section>
        )}

        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
          <h2 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500 dark:text-purple-400" /> {t('profilePage.privacyTitle')}
          </h2>
          <div className="space-y-4">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              <p>{t('profilePage.consentGiven')}: <span className="text-slate-800 dark:text-white">{profile?.consentGiven ? `${t('profilePage.consentYes')} — ${profile.consentAt ? new Date(profile.consentAt).toLocaleDateString() : ''}` : t('profilePage.consentNo')}</span></p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={exportData} variant="outline" className="flex items-center gap-2 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <Download className="w-4 h-4" /> {t('profilePage.exportData')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:border-red-400"
              >
                <Trash2 className="w-4 h-4" /> {t('profilePage.deleteAccount')}
              </Button>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t('profilePage.pdpaNotice')}
            </p>
          </div>
        </section>

        {/* Delete account confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 dark:bg-slate-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <h3 className="text-white font-semibold">{t('profilePage.anonymizeTitle')}</h3>
              </div>
              <p className="text-slate-400 text-sm mb-6">
                {t('profilePage.anonymizeDesc')}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1 border-white/10 text-slate-300">
                  {t('profilePage.cancel')}
                </Button>
                <Button onClick={deleteAccount} disabled={deletingAccount} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                  {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profilePage.confirmAnonymize')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
