'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, GraduationCap, Loader2, Sun, Moon, Monitor, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useTheme } from '@/lib/hooks/use-theme';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const FONT_SIZES = [
  { key: 'quickPreferences.small', value: 16 },
  { key: 'quickPreferences.default', value: 18 },
  { key: 'quickPreferences.large', value: 20 },
] as const;

const FONT_SIZE_KEY = 'openmaic-ui-font-size';

function applyRootFontSize(size: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${size}px`;
  const level = size <= 16 ? 'small' : size >= 20 ? 'large' : 'default';
  document.documentElement.setAttribute('data-font-size', level);
}

export default function SignInPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [callbackUrl, setCallbackUrl] = useState('/');

  // Toolbar state — mirrors the student dashboard toolbar
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(18);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
      setThemeOpen(false);
      setFontSizeOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!themeOpen && !fontSizeOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen, fontSizeOpen, handleClickOutside]);

  useEffect(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    const parsed = saved ? Number(saved) : 18;
    const next = Number.isFinite(parsed) && [16, 18, 20].includes(parsed) ? parsed : 18;
    setFontSize(next);
    applyRootFontSize(next);
  }, []);

  useEffect(() => {
    applyRootFontSize(fontSize);
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  // Sign-in form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextCallbackUrl = params.get('callbackUrl') ?? '/';
    const errorCode = params.get('error');
    setCallbackUrl(nextCallbackUrl);
    if (errorCode) {
      const key = `signIn.errors.${errorCode}`;
      const msg = t(key);
      setError(msg === key ? t('signIn.errors.Default') : msg);
    }
  }, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      const key = `signIn.errors.${res.error}`;
      const msg = t(key);
      setError(msg === key ? t('signIn.errors.Default') : msg);
    } else {
      const session = await getSession();
      const role = session?.user?.role;
      const dest =
        role === 'ADMIN'
          ? '/admin'
          : role === 'INSTRUCTOR'
            ? '/instructor'
            : callbackUrl;
      router.push(dest);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4
      bg-gradient-to-br from-slate-100 via-purple-50 to-slate-200
      dark:bg-gradient-to-br dark:from-slate-900 dark:via-purple-950 dark:to-slate-900">

      {/* ── Preference toolbar — top-right (identical to student dashboard) ── */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-[9999] flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        <LanguageSwitcher
          onOpen={() => { setThemeOpen(false); setFontSizeOpen(false); }}
        />

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setThemeOpen(!themeOpen); setFontSizeOpen(false); }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('quickPreferences.theme')}
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-[9999] min-w-[140px]">
              {(['light', 'dark', 'system'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => { setTheme(th); setThemeOpen(false); }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                    theme === th && 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                  )}
                >
                  {th === 'light' && <Sun className="w-4 h-4" />}
                  {th === 'dark' && <Moon className="w-4 h-4" />}
                  {th === 'system' && <Monitor className="w-4 h-4" />}
                  {t(`quickPreferences.${th}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Font Size Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setFontSizeOpen(!fontSizeOpen); setThemeOpen(false); }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('quickPreferences.fontSize')}
          >
            <Type className="w-4 h-4" />
          </button>
          {fontSizeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-[9999] min-w-[140px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  onClick={() => { setFontSize(size.value); setFontSizeOpen(false); }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                    fontSize === size.value && 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                  )}
                >
                  <Type className="w-4 h-4" /> {t(size.key)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600 mb-4 shadow-lg shadow-purple-900/40">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            MU-OpenMAIC
          </h1>
          <p className="text-sm mt-1 text-slate-500 dark:text-slate-400">AI Interactive Classroom</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-8 shadow-xl dark:backdrop-blur-sm">
          <h2 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">
            {t('signIn.title')}
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-slate-300">
                {t('signIn.emailLabel')}
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm
                  bg-gray-50 dark:bg-white/5
                  border border-gray-300 dark:border-white/10
                  text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-slate-500
                  focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="admin@school.ac.th"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-slate-300">
                {t('signIn.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm pr-10
                    bg-gray-50 dark:bg-white/5
                    border border-gray-300 dark:border-white/10
                    text-gray-900 dark:text-white
                    placeholder:text-gray-400 dark:placeholder:text-slate-500
                    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? t('signIn.hidePassword') : t('signIn.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('signIn.signingIn')}
                </span>
              ) : (
                t('signIn.submit')
              )}
            </Button>
          </form>

          {/* OAuth providers */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-gray-400 dark:text-slate-500">
                <span className="bg-white dark:bg-transparent px-2">
                  {t('signIn.orContinueWith')}
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => signIn('google', { callbackUrl })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors
                  border border-gray-200 dark:border-white/10
                  bg-gray-50 dark:bg-white/5
                  hover:bg-gray-100 dark:hover:bg-white/10
                  text-gray-700 dark:text-white"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => signIn('github', { callbackUrl })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors
                  border border-gray-200 dark:border-white/10
                  bg-gray-50 dark:bg-white/5
                  hover:bg-gray-100 dark:hover:bg-white/10
                  text-gray-700 dark:text-white"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-6 text-gray-400 dark:text-slate-500">
          {t('signIn.pdpaNotice')}
        </p>

        <p className="text-center text-xs mt-3 text-gray-400 dark:text-slate-600">
          <a
            href="https://openmaic.chat"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            OpenMAIC
          </a>
          {' '}&mdash; developed by{' '}
          <a
            href="https://www.tsinghua.edu.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Tsinghua University
          </a>
        </p>
      </div>
    </div>
  );
}
