'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Monitor,
  Type,
  BotOff,
  BookOpen,
  CheckCircle2,
  Bell,
  PlayCircle,
  BarChart3,
  ChevronRight,
  Presentation,
  HelpCircle,
  Globe,
  Layers,
  Zap,
  Plus,
  User,
  KeyRound,
  Shield,
  Download,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { AccountMenu } from '@/components/account-menu';
import { MuBrandingHeader } from '@/components/mu-branding-header';
import { useTheme } from '@/lib/hooks/use-theme';
import { useSession, signOut } from 'next-auth/react';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
} from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { BrandLogo } from '@/components/brand-logo';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INVITED_OPEN_STORAGE_KEY = 'invitedClassroomsOpen';
const FONT_SIZE_KEY = 'openmaic-ui-font-size';
const MAX_STUDENT_OWNED_CLASSROOMS = 20;
const INVITED_PER_PAGE = 6;
const OWNED_PER_PAGE = 8;

const FONT_SIZES = [
  { label: 'Small', value: 16 },
  { label: 'Default', value: 18 },
  { label: 'Large', value: 20 },
] as const;

function applyRootFontSize(size: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${size}px`;
  // Drive --spacing via data-font-size so all Tailwind spacing utilities scale
  // in proportion with the chosen text size (globals.css reads this attribute).
  const level = size <= 16 ? 'small' : size >= 20 ? 'large' : 'default';
  document.documentElement.setAttribute('data-font-size', level);
}

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US' | 'th-TH';
  webSearch: boolean;
}

interface InvitedClassroomItem {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  assignedAt: number;
  unread?: boolean;
  instructorName?: string | null;
  sceneCount?: number;
  sceneTypes?: string[];
  completedScenes?: number;
  lastViewedScene?: string | null;
}

interface GradeResult {
  id: string;
  sceneId: string;
  sceneTitle: string;
  score: number;
  maxScore: number;
  answers: unknown[];
  gradedAt: string;
  gradedBy: string;
}

interface ClassroomGrades {
  results: GradeResult[];
  totalScore: number;
  totalMax: number;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'zh-CN',
  webSearch: false,
};

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = session?.user?.role === 'ADMIN';
  const isStudent = session?.user?.role === 'STUDENT';
  const currentUserId = session?.user?.id;
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const [recentOpen, setRecentOpen] = useState(true);
  const [invitedOpen, setInvitedOpen] = useState(true);
  const [studentActiveTab, setStudentActiveTab] = useState<'dashboard' | 'classrooms' | 'progress' | 'profile'>('dashboard');
  const [invitedPage, setInvitedPage] = useState(1);
  const [ownedPage, setOwnedPage] = useState(1);
  const [progressGrades, setProgressGrades] = useState<Record<string, ClassroomGrades | null>>({});
  const [progressGradesLoading, setProgressGradesLoading] = useState(false);
  // Interactive mode toggle: true = student has armed interactive mode, waits for "Enter Classroom"
  const [interactiveModeSelected, setInteractiveModeSelected] = useState(false);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedInvited = localStorage.getItem(INVITED_OPEN_STORAGE_KEY);
      if (savedInvited !== null) setInvitedOpen(savedInvited !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedLanguage === 'zh-CN' || savedLanguage === 'en-US' || savedLanguage === 'th-TH') {
        updates.language = savedLanguage;
      } else {
        const detected = navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
        updates.language = detected;
      }
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft from cache (derived state pattern — no effect needed)
  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);
  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const [themeOpen, setThemeOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(18);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [invitedClassrooms, setInvitedClassrooms] = useState<InvitedClassroomItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [targetClassroomId, setTargetClassroomId] = useState<string | null>(null);
  const [targetClassroomTitle, setTargetClassroomTitle] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!themeOpen && !fontSizeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
        setFontSizeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen, fontSizeOpen]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FONT_SIZE_KEY);
      const parsed = saved ? Number(saved) : 18;
      const next = Number.isFinite(parsed) && [16, 18, 20].includes(parsed) ? parsed : 18;
      setFontSize(next);
      applyRootFontSize(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      applyRootFontSize(fontSize);
      localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  const loadClassrooms = async () => {
    try {
      const list = await listStages();
      const ownedList = list.filter(
        (c) =>
          c.ownershipType !== 'invited' &&
          (!c.ownerUserId || !currentUserId || c.ownerUserId === currentUserId),
      );
      let nextOwnedList = ownedList;

      if (isStudent && ownedList.length > 0) {
        const validated = await Promise.all(
          ownedList.map(async (classroom) => {
            try {
              const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroom.id)}`);
              if (res.ok) {
                return classroom;
              }

              if (res.status === 403 || res.status === 404) {
                await deleteStageData(classroom.id);
                return null;
              }

              return classroom;
            } catch {
              return classroom;
            }
          }),
        );
        nextOwnedList = validated.filter((classroom): classroom is StageListItem => !!classroom);
      }

      setClassrooms(nextOwnedList);
      // Load first slide thumbnails
      if (nextOwnedList.length > 0) {
        const slides = await getFirstSlideByStages(nextOwnedList.map((c) => c.id));
        setThumbnails(slides);
      } else {
        setThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  const loadInvitedClassrooms = async () => {
    if (!isStudent) {
      setInvitedClassrooms([]);
      return;
    }
    try {
      const res = await fetch('/api/user/classrooms');
      if (!res.ok) return;
      const json = await res.json();
      setInvitedClassrooms((json.classrooms || []) as InvitedClassroomItem[]);
    } catch (err) {
      log.error('Failed to load invited classrooms:', err);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Store hydration on mount
    loadClassrooms();
  }, [isStudent, currentUserId]);

  useEffect(() => {
    loadInvitedClassrooms();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetches server data on mount
  }, [isStudent, currentUserId]);

  // Fetch per-classroom grades when the student is on the dashboard or progress tab
  useEffect(() => {
    if ((studentActiveTab !== 'progress' && studentActiveTab !== 'dashboard') || invitedClassrooms.length === 0) return;
    const fetchAllGrades = async () => {
      setProgressGradesLoading(true);
      const entries = await Promise.allSettled(
        invitedClassrooms.map(async (c) => {
          try {
            const res = await fetch(`/api/user/grades?classroomId=${encodeURIComponent(c.id)}`);
            if (!res.ok) return [c.id, null] as const;
            const data = (await res.json()) as ClassroomGrades;
            return [c.id, data] as const;
          } catch {
            return [c.id, null] as const;
          }
        }),
      );
      const map: Record<string, ClassroomGrades | null> = {};
      for (const r of entries) {
        if (r.status === 'fulfilled') {
          const [id, data] = r.value;
          map[id] = data;
        }
      }
      setProgressGrades(map);
      setProgressGradesLoading(false);
    };
    void fetchAllGrades();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches server data on tab change
  }, [studentActiveTab, invitedClassrooms]);

  useEffect(() => {
    const wizardClassroomId = searchParams.get('wizardClassroomId')?.trim() || null;
    if (!wizardClassroomId) return;

    const wizardClassroomTitle = searchParams.get('wizardClassroomTitle')?.trim() || '';
    const prefillRequirement = searchParams.get('prefillRequirement')?.trim() || '';
    const wizardLanguage = searchParams.get('wizardLanguage');

    setTargetClassroomId(wizardClassroomId);
    setTargetClassroomTitle(wizardClassroomTitle || null);

    setForm((prev) => ({
      ...prev,
      requirement: prefillRequirement || prev.requirement,
      language:
        wizardLanguage === 'zh-CN' || wizardLanguage === 'en-US' || wizardLanguage === 'th-TH'
          ? wizardLanguage
          : wizardLanguage === 'en'
            ? 'en-US'
            : prev.language,
    }));

    if (prefillRequirement) {
      updateRequirementCache(prefillRequirement);
    }

    router.replace('/');
  }, [router, searchParams, updateRequirementCache]);

  // Reset interactive mode toggle whenever the student navigates between tabs
  useEffect(() => {
    setInteractiveModeSelected(false);
  }, [studentActiveTab]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      const deleteRes = await fetch(`/api/classroom?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!deleteRes.ok && deleteRes.status !== 404) {
        toast.error('You are not allowed to delete this classroom.');
        return;
      }

      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const markAssignmentRead = async (classroomId: string) => {
    setInvitedClassrooms((prev) =>
      prev.map((c) => (c.id === classroomId ? { ...c, unread: false } : c)),
    );
    try {
      await fetch('/api/user/classrooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId }),
      });
    } catch {
      // non-critical
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="w-[356px] rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 shadow-lg shadow-amber-500/8 dark:shadow-amber-900/20 p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="shrink-0 mt-0.5 size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
              {desc}
            </p>
          </div>
          <div className="shrink-0 mt-1 text-[10px] font-medium text-amber-500 dark:text-amber-500/70 tracking-wide">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleGenerate = async () => {
    // Validate setup before proceeding
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    if (isStudent && classrooms.length >= MAX_STUDENT_OWNED_CLASSROOMS) {
      setError(t('classroom.studentOwnedLimitReached', { max: MAX_STUDENT_OWNED_CLASSROOMS }));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        language: form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        targetClassroomId: targetClassroomId || undefined,
        targetClassroomTitle: targetClassroomTitle || undefined,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim();

  const handleInteractiveMode = async () => {
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    if (isStudent && classrooms.length >= MAX_STUDENT_OWNED_CLASSROOMS) {
      setError(t('classroom.studentOwnedLimitReached', { max: MAX_STUDENT_OWNED_CLASSROOMS }));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        language: form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
      };

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        targetClassroomId: targetClassroomId || undefined,
        targetClassroomTitle: targetClassroomTitle || undefined,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        sceneOutlines: null,
        currentStep: 'generating' as const,
        interactiveMode: true,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing interactive generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  /** Single entry point for "Enter Classroom" — respects the interactive mode toggle */
  const handleSubmit = () => {
    if (interactiveModeSelected) {
      void handleInteractiveMode();
    } else {
      void handleGenerate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleSubmit();
    }
  };

  return (
    <div className={cn(
      'min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center overflow-x-hidden',
      isStudent ? 'p-4 pt-4 md:p-6 md:pt-4' : 'p-4 pt-16 md:p-8 md:pt-16',
    )}>
      <AccountMenu />

      {/* ═══ Top-right pill (unchanged) ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-[9999] flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <LanguageSwitcher
          onOpen={() => {
            setThemeOpen(false);
            setFontSizeOpen(false);
          }}
        />

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
              setFontSizeOpen(false);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-[9999] min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Font Size Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setFontSizeOpen(!fontSizeOpen);
              setThemeOpen(false);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title="Font size"
          >
            <Type className="w-4 h-4" />
          </button>
          {fontSizeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-[9999] min-w-[140px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.value}
                  onClick={() => {
                    setFontSize(size.value);
                    setFontSizeOpen(false);
                  }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                    fontSize === size.value &&
                      'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                  )}
                >
                  <Type className="w-4 h-4" />
                  {size.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

            {/* Settings Button */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
              >
                <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
              </button>
            </div>
          </>
        )}
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* ═══ Hero section: title + input (centered, wider) — hidden for students ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[800px] flex flex-col items-center',
          isStudent ? 'hidden' : classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
        )}
      >
        {/* ── Logo ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="mb-2"
        >
          <BrandLogo size="hero" className="-ml-1 md:-ml-2" />
        </motion.div>

        {/* ── Slogan ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground/60 mb-8"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]">
            {/* ── Greeting + Profile + Agents ── */}
            <div className="relative z-20 flex items-start justify-end">
              <div className="pr-3 pt-3.5 shrink-0">
                <AgentBar />
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[140px] max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
            />

            {/* Toolbar row */}
            <div className="px-3 pb-3 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  language={form.language}
                  onLanguageChange={(lang) => updateForm('language', lang)}
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                />
              </div>

              {/* Voice input */}
              <SpeechButton
                size="md"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Interactive Mode toggle — arms the mode; navigation happens on Enter Classroom */}
              <button
                onClick={() => setInteractiveModeSelected((v) => !v)}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-full flex items-center justify-center gap-1.5 transition-all px-3 text-xs font-semibold border',
                  !canGenerate
                    ? 'text-muted-foreground/40 bg-muted border-transparent cursor-not-allowed'
                    : interactiveModeSelected
                      ? 'text-white bg-cyan-500 dark:bg-cyan-600 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.45)] cursor-pointer'
                      : 'text-cyan-600 dark:text-cyan-300 bg-cyan-50/80 dark:bg-cyan-900/20 border-cyan-400/60 dark:border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)] dark:shadow-[0_0_8px_rgba(6,182,212,0.15)] hover:border-cyan-500 hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer',
                )}
                title={t('stage.interactiveMode')}
              >
                <Zap className={cn('size-3.5', interactiveModeSelected && 'fill-white')} />
                <span>{t('stage.interactiveMode')}</span>
              </button>

              {/* Enter Classroom — submits in whichever mode is armed */}
              <button
                onClick={handleSubmit}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                  !canGenerate
                    ? 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                    : interactiveModeSelected
                      ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90 shadow-sm cursor-pointer'
                      : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer',
                )}
              >
                {interactiveModeSelected && <Zap className="size-3 fill-white" />}
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ Student Dashboard ═══ */}
      {isStudent && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 mt-2 w-full max-w-6xl"
        >
          {/* ── MU-OpenMAIC branding — in normal flow, top-centre ── */}
          <div className="flex justify-center mb-6">
            <div className="px-3 py-1.5 rounded-full bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-gray-100/50 dark:border-gray-700/50 shadow-sm">
              <MuBrandingHeader large />
            </div>
          </div>

          {studentActiveTab === 'classrooms' ? (
            /* ──────────────────────── Classrooms View ──────────────────────── */
            (() => {
              const invitedTotalPages = Math.max(1, Math.ceil(invitedClassrooms.length / INVITED_PER_PAGE));
              const ownedTotalPages = Math.max(1, Math.ceil(classrooms.length / OWNED_PER_PAGE));
              const invitedPageItems = invitedClassrooms.slice(
                (invitedPage - 1) * INVITED_PER_PAGE,
                invitedPage * INVITED_PER_PAGE,
              );
              const ownedPageItems = classrooms.slice(
                (ownedPage - 1) * OWNED_PER_PAGE,
                ownedPage * OWNED_PER_PAGE,
              );

              return (
                <>
                  {/* ── Back button + heading ── */}
                  <div className="flex items-center gap-3 mb-7">
                    <button
                      onClick={() => setStudentActiveTab('dashboard')}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="size-4" />
                      {t('studentDashboard.backToDashboard')}
                    </button>
                    <div className="h-4 w-px bg-border/60" />
                    <h1 className="text-xl font-bold">{t('studentDashboard.classroomsViewTitle')}</h1>
                  </div>

                  {/* ── AI Creation Canvas ── */}
                  <section className="mb-10">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Plus className="size-3.5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold">{t('studentDashboard.createClassroomTitle')}</h2>
                        <p className="text-xs text-muted-foreground">{t('studentDashboard.createClassroomDesc')}</p>
                      </div>
                    </div>

                    <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]">
                      {/* Agent bar */}
                      <div className="relative z-20 flex items-start justify-end">
                        <div className="pr-3 pt-3.5 shrink-0">
                          <AgentBar />
                        </div>
                      </div>
                      {/* Textarea */}
                      <textarea
                        ref={textareaRef}
                        placeholder={t('upload.requirementPlaceholder')}
                        className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[120px] max-h-[260px]"
                        value={form.requirement}
                        onChange={(e) => updateForm('requirement', e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={3}
                      />
                      {/* Toolbar row */}
                      <div className="px-3 pb-3 flex items-end gap-2">
                        <div className="flex-1 min-w-0">
                          <GenerationToolbar
                            language={form.language}
                            onLanguageChange={(lang) => updateForm('language', lang)}
                            webSearch={form.webSearch}
                            onWebSearchChange={(v) => updateForm('webSearch', v)}
                            onSettingsOpen={(section) => {
                              setSettingsSection(section);
                              setSettingsOpen(true);
                            }}
                            pdfFile={form.pdfFile}
                            onPdfFileChange={(f) => updateForm('pdfFile', f)}
                            onPdfError={setError}
                          />
                        </div>
                        <SpeechButton
                          size="md"
                          onTranscription={(text) => {
                            setForm((prev) => {
                              const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                              updateRequirementCache(next);
                              return { ...prev, requirement: next };
                            });
                          }}
                        />
                        {/* Interactive Mode toggle — arms the mode; navigation happens on Enter Classroom */}
                        <button
                          onClick={() => setInteractiveModeSelected((v) => !v)}
                          disabled={!canGenerate}
                          className={cn(
                            'shrink-0 h-8 rounded-full flex items-center justify-center gap-1.5 transition-all px-3 text-xs font-semibold border',
                            !canGenerate
                              ? 'text-muted-foreground/40 bg-muted border-transparent cursor-not-allowed'
                              : interactiveModeSelected
                                ? 'text-white bg-cyan-500 dark:bg-cyan-600 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.45)] cursor-pointer'
                                : 'text-cyan-600 dark:text-cyan-300 bg-cyan-50/80 dark:bg-cyan-900/20 border-cyan-400/60 dark:border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)] dark:shadow-[0_0_8px_rgba(6,182,212,0.15)] hover:border-cyan-500 hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer',
                          )}
                          title={t('stage.interactiveMode')}
                        >
                          <Zap className={cn('size-3.5', interactiveModeSelected && 'fill-white')} />
                          <span>{t('stage.interactiveMode')}</span>
                        </button>
                        {/* Enter Classroom — submits in whichever mode is armed */}
                        <button
                          onClick={handleSubmit}
                          disabled={!canGenerate}
                          className={cn(
                            'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                            !canGenerate
                              ? 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                              : interactiveModeSelected
                                ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90 shadow-sm cursor-pointer'
                                : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer',
                          )}
                        >
                          {interactiveModeSelected && <Zap className="size-3 fill-white" />}
                          <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                          <ArrowUp className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
                        >
                          <p className="text-sm text-destructive">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  {/* ── Invited classrooms ── */}
                  <section className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="size-4 text-blue-500" />
                        {t('studentDashboard.invitedSectionTitle')}
                        <span className="text-[11px] tabular-nums text-muted-foreground opacity-70 font-normal">
                          {invitedClassrooms.length}
                        </span>
                      </h2>
                      {invitedTotalPages > 1 && (
                        <span className="text-[11px] text-muted-foreground">
                          {t('studentDashboard.pageOf', { page: String(invitedPage), total: String(invitedTotalPages) })}
                        </span>
                      )}
                    </div>

                    {invitedClassrooms.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {invitedPageItems.map((classroom, i) => (
                            <motion.div
                              key={classroom.id}
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                            >
                              <InvitedClassroomCard
                                classroom={classroom}
                                formatDate={formatDate}
                                onClick={() => {
                                  if (classroom.unread) markAssignmentRead(classroom.id);
                                  const target = classroom.lastViewedScene
                                    ? `/classroom/${classroom.id}?scene=${classroom.lastViewedScene}`
                                    : `/classroom/${classroom.id}`;
                                  router.push(target);
                                }}
                                onViewGrades={() => router.push(`/classroom/${classroom.id}/grades`)}
                              />
                            </motion.div>
                          ))}
                        </div>
                        {invitedTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-6">
                            <button
                              onClick={() => { setInvitedPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              disabled={invitedPage === 1}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="size-3.5" />
                              {t('common.pagination.previous')}
                            </button>
                            <span className="text-xs text-muted-foreground tabular-nums px-2">
                              {invitedPage} / {invitedTotalPages}
                            </span>
                            <button
                              onClick={() => { setInvitedPage((p) => Math.min(invitedTotalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              disabled={invitedPage === invitedTotalPages}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {t('common.pagination.next')}
                              <ChevronRight className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground/50">
                        <BookOpen className="size-9 mb-3 opacity-30" />
                        <p className="text-sm">{t('classroom.noInvitedClassrooms')}</p>
                      </div>
                    )}
                  </section>

                  {/* ── Student own classrooms ── */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Clock className="size-4 text-amber-500" />
                        {t('studentDashboard.ownedSectionTitle')}
                        <span className="text-[11px] tabular-nums text-muted-foreground opacity-70 font-normal">
                          {classrooms.length}
                        </span>
                      </h2>
                      {ownedTotalPages > 1 && (
                        <span className="text-[11px] text-muted-foreground">
                          {t('studentDashboard.pageOf', { page: String(ownedPage), total: String(ownedTotalPages) })}
                        </span>
                      )}
                    </div>

                    {classrooms.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {ownedPageItems.map((classroom, i) => (
                            <motion.div
                              key={classroom.id}
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                            >
                              <StudentOwnedClassroomCard
                                classroom={classroom}
                                formatDate={formatDate}
                                onDelete={handleDelete}
                                onRename={handleRename}
                                confirmingDelete={pendingDeleteId === classroom.id}
                                onConfirmDelete={() => confirmDelete(classroom.id)}
                                onCancelDelete={() => setPendingDeleteId(null)}
                                onClick={() => router.push(`/classroom/${classroom.id}`)}
                              />
                            </motion.div>
                          ))}
                        </div>
                        {ownedTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-6">
                            <button
                              onClick={() => { setOwnedPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              disabled={ownedPage === 1}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="size-3.5" />
                              {t('common.pagination.previous')}
                            </button>
                            <span className="text-xs text-muted-foreground tabular-nums px-2">
                              {ownedPage} / {ownedTotalPages}
                            </span>
                            <button
                              onClick={() => { setOwnedPage((p) => Math.min(ownedTotalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              disabled={ownedPage === ownedTotalPages}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {t('common.pagination.next')}
                              <ChevronRight className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground/50">
                        <Plus className="size-9 mb-3 opacity-30" />
                        <p className="text-sm">{t('studentDashboard.noOwnedClassrooms')}</p>
                      </div>
                    )}
                  </section>
                </>
              );
            })()
          ) : studentActiveTab === 'progress' ? (
            /* ──────────────────────── Progress View ──────────────────────── */
            (() => {
              // Aggregate totals across all classrooms
              const totalCompleted = invitedClassrooms.reduce((s, c) => s + (c.completedScenes ?? 0), 0);
              const totalScenes = invitedClassrooms.reduce((s, c) => s + (c.sceneCount ?? 0), 0);
              const aggScore = Object.values(progressGrades).reduce((s, g) => s + (g?.totalScore ?? 0), 0);
              const aggMax = Object.values(progressGrades).reduce((s, g) => s + (g?.totalMax ?? 0), 0);
              const overallPct = aggMax > 0 ? Math.round((aggScore / aggMax) * 100) : null;

              return (
                <>
                  {/* ── Back + heading ── */}
                  <div className="flex items-center gap-3 mb-7">
                    <button
                      onClick={() => setStudentActiveTab('dashboard')}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="size-4" />
                      {t('studentDashboard.backToDashboard')}
                    </button>
                    <div className="h-4 w-px bg-border/60" />
                    <h1 className="text-xl font-bold">{t('studentDashboard.progressViewTitle')}</h1>
                  </div>

                  {/* ── Overall summary ── */}
                  <section className="mb-8">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {t('studentDashboard.overallSummary')}
                    </h2>
                    <div className="grid grid-cols-3 gap-4">
                      {/* Enrolled */}
                      <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                          <BookOpen className="size-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums">{invitedClassrooms.length}</p>
                          <p className="text-[11px] text-muted-foreground">{t('classroom.enrolledClassrooms')}</p>
                        </div>
                      </div>
                      {/* Scenes completed */}
                      <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums">
                            {totalCompleted}
                            <span className="text-sm font-normal text-muted-foreground">/{totalScenes}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">{t('classroom.scenesCompleted')}</p>
                        </div>
                      </div>
                      {/* Overall quiz score */}
                      <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                        <div className={cn(
                          'size-9 rounded-xl flex items-center justify-center shrink-0',
                          overallPct === null ? 'bg-slate-100 dark:bg-slate-800'
                            : overallPct >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/40'
                            : overallPct >= 50 ? 'bg-amber-100 dark:bg-amber-900/40'
                            : 'bg-rose-100 dark:bg-rose-900/40',
                        )}>
                          <BarChart3 className={cn(
                            'size-4',
                            overallPct === null ? 'text-slate-400'
                              : overallPct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
                              : overallPct >= 50 ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400',
                          )} />
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums">
                            {progressGradesLoading ? '…' : overallPct !== null ? `${overallPct}%` : '—'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{t('studentDashboard.overallScore')}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ── Per-classroom progress list ── */}
                  {invitedClassrooms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/50">
                      <BookOpen className="size-10 mb-3 opacity-30" />
                      <p className="text-sm">{t('classroom.noInvitedClassrooms')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {invitedClassrooms.map((classroom) => (
                        <ClassroomProgressCard
                          key={classroom.id}
                          classroom={classroom}
                          grades={progressGrades[classroom.id]}
                          gradesLoading={progressGradesLoading}
                          formatDate={formatDate}
                          onEnter={() => {
                            if (classroom.unread) markAssignmentRead(classroom.id);
                            const target = classroom.lastViewedScene
                              ? `/classroom/${classroom.id}?scene=${classroom.lastViewedScene}`
                              : `/classroom/${classroom.id}`;
                            router.push(target);
                          }}
                          onViewGrades={() => router.push(`/classroom/${classroom.id}/grades`)}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()
          ) : studentActiveTab === 'profile' ? (
            /* ──────────────────────── Profile View ──────────────────────── */
            <StudentProfileView onBack={() => setStudentActiveTab('dashboard')} />
          ) : (
            /* ──────────────────────── Dashboard View ──────────────────────── */
            <>
              {/* ── Header ── */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {t('studentDashboard.title')}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('studentDashboard.welcomeBack')} {session?.user?.name ?? session?.user?.email}
                  </p>
                </div>
              </div>

              {/* ── Task Menu ── */}
              {(() => {
                const enrolledCount = invitedClassrooms.length;
                const unreadCount = invitedClassrooms.filter((c) => c.unread).length;
                const totalCompleted = invitedClassrooms.reduce((s, c) => s + (c.completedScenes ?? 0), 0);
                const totalScenes = invitedClassrooms.reduce((s, c) => s + (c.sceneCount ?? 0), 0);
                const progressPct = totalScenes > 0 ? Math.round((totalCompleted / totalScenes) * 100) : 0;

                return (
                  <section className="rounded-xl border border-teal-500/30 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/10 p-4 mb-8">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-200">
                      {t('studentDashboard.taskMenu')}
                    </h2>
                    <p className="mt-1 text-sm text-teal-600/80 dark:text-teal-100/80">
                      {t('studentDashboard.taskMenuDescription')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">

                      {/* Dashboard */}
                      <button
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 px-4 py-4 text-left transition-all hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-amber-400/50 dark:hover:border-amber-500/30 group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="size-8 rounded-lg bg-amber-500/15 dark:bg-amber-500/15 flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          </div>
                        </div>
                        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{enrolledCount}</p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-200 mt-0.5 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t('studentDashboard.taskDashboard')}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">{t('studentDashboard.taskDashboardSub')}</p>
                      </button>

                      {/* My Classrooms */}
                      <button
                        onClick={() => { setStudentActiveTab('classrooms'); setInvitedPage(1); setOwnedPage(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 px-4 py-4 text-left transition-all hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-blue-400/50 dark:hover:border-blue-500/30 group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="size-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          {unreadCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300/60 dark:border-violet-500/30">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{enrolledCount}</p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-200 mt-0.5 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t('studentDashboard.taskMyClassrooms')}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">
                          {unreadCount > 0
                            ? t(unreadCount === 1 ? 'studentDashboard.taskMyClassroomsSubNew' : 'studentDashboard.taskMyClassroomsSubNewPlural', { count: String(unreadCount) })
                            : t('studentDashboard.taskMyClassroomsSubNone')}
                        </p>
                      </button>

                      {/* My Progress */}
                      <button
                        onClick={() => { setStudentActiveTab('progress'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 px-4 py-4 text-left transition-all hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-emerald-400/50 dark:hover:border-emerald-500/30 group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="size-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          {totalScenes > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{progressPct}%</span>
                          )}
                        </div>
                        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{totalCompleted}</p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-200 mt-0.5 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t('studentDashboard.taskMyProgress')}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">
                          {t('studentDashboard.taskMyProgressSub', { total: String(totalScenes) })}
                        </p>
                      </button>

                      {/* Profile */}
                      <button
                        onClick={() => { setStudentActiveTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 px-4 py-4 text-left transition-all hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-violet-400/50 dark:hover:border-violet-500/30 group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="size-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                            <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">
                          {session?.user?.name ?? session?.user?.email ?? '—'}
                        </p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-200 mt-0.5 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t('studentDashboard.taskSettings')}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">{t('studentDashboard.taskSettingsSub')}</p>
                      </button>

                    </div>
                  </section>
                );
              })()}

              {/* ── Summary stat cards ── */}
              {(() => {
                const totalDone   = invitedClassrooms.reduce((s, c) => s + (c.completedScenes ?? 0), 0);
                const totalScenesDash = invitedClassrooms.reduce((s, c) => s + (c.sceneCount ?? 0), 0);
                const scenePctDash = totalScenesDash > 0 ? Math.round((totalDone / totalScenesDash) * 100) : 0;
                const aggScore = Object.values(progressGrades).reduce((s, g) => s + (g?.totalScore ?? 0), 0);
                const aggMax   = Object.values(progressGrades).reduce((s, g) => s + (g?.totalMax   ?? 0), 0);
                const overallQuizPct = aggMax > 0 ? Math.round((aggScore / aggMax) * 100) : null;
                const quizBadgeColor = overallQuizPct === null
                  ? 'text-muted-foreground'
                  : overallQuizPct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
                  : overallQuizPct >= 50 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400';

                return (
                  <div id="student-stats" className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {/* Enrolled */}
                    <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                        <BookOpen className="size-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xl font-bold tabular-nums">{invitedClassrooms.length}</p>
                        <p className="text-[11px] text-muted-foreground">{t('classroom.enrolledClassrooms')}</p>
                      </div>
                    </div>
                    {/* Scenes completed */}
                    <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xl font-bold tabular-nums">{totalDone}<span className="text-sm font-normal text-muted-foreground">/{totalScenesDash}</span></p>
                        <p className="text-[11px] text-muted-foreground">{t('classroom.scenesCompleted')} · {scenePctDash}%</p>
                      </div>
                    </div>
                    {/* Overall quiz score */}
                    <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                        {progressGradesLoading
                          ? <Loader2 className="size-4 text-amber-600 dark:text-amber-400 animate-spin" />
                          : <BarChart3 className="size-4 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <div>
                        <p className={cn('text-xl font-bold tabular-nums', quizBadgeColor)}>
                          {progressGradesLoading ? '…' : overallQuizPct !== null ? `${overallQuizPct}%` : '—'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t('studentDashboard.overallScore')}</p>
                      </div>
                    </div>
                    {/* New assignments */}
                    <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-5 py-4 flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                        <Bell className="size-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xl font-bold tabular-nums">{invitedClassrooms.filter((c) => c.unread).length}</p>
                        <p className="text-[11px] text-muted-foreground">{t('classroom.newAssignments')}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Per-classroom statistics table ── */}
              {invitedClassrooms.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="size-4 text-primary" />
                      {t('studentDashboard.progressViewTitle')}
                    </h2>
                    {progressGradesLoading && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        {t('studentDashboard.loadingGrades')}
                      </span>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden divide-y divide-border/40">
                    {invitedClassrooms.map((c) => {
                      const total = c.sceneCount ?? 0;
                      const done  = c.completedScenes ?? 0;
                      const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
                      const grades = progressGrades[c.id];
                      const quizPct = grades && grades.totalMax > 0
                        ? Math.round((grades.totalScore / grades.totalMax) * 100)
                        : null;
                      const quizBarColor = quizPct === null
                        ? ''
                        : quizPct >= 80 ? 'bg-emerald-500'
                        : quizPct >= 50 ? 'bg-amber-500'
                        : 'bg-rose-500';
                      const quizTextColor = quizPct === null
                        ? 'text-muted-foreground'
                        : quizPct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
                        : quizPct >= 50 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400';

                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-4 px-4 py-3 group hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => {
                            if (c.unread) markAssignmentRead(c.id);
                            const target = c.lastViewedScene
                              ? `/classroom/${c.id}?scene=${c.lastViewedScene}`
                              : `/classroom/${c.id}`;
                            router.push(target);
                          }}
                        >
                          {/* Unread dot */}
                          {c.unread && (
                            <span className="size-1.5 rounded-full bg-violet-500 shrink-0" />
                          )}

                          {/* Classroom info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">{c.name}</p>
                            {c.instructorName && (
                              <p className="text-[11px] text-muted-foreground truncate">{c.instructorName}</p>
                            )}
                          </div>

                          {/* Scene progress bar */}
                          <div className="hidden sm:block w-28 space-y-1 shrink-0">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{t('studentDashboard.sceneProgressLabel')}</span>
                              <span className="tabular-nums">{done}/{total}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Quiz score bar */}
                          <div className="hidden sm:block w-24 space-y-1 shrink-0">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{t('studentDashboard.quizPerformanceLabel')}</span>
                              <span className={cn('tabular-nums font-medium', quizTextColor)}>
                                {progressGradesLoading && quizPct === null ? '…' : quizPct !== null ? `${quizPct}%` : '—'}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all duration-500', quizBarColor)}
                                style={{ width: `${quizPct ?? 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Mobile: compact stats */}
                          <div className="sm:hidden flex items-center gap-2 shrink-0">
                            <span className="text-[11px] tabular-nums text-muted-foreground">{progressPct}%</span>
                            {quizPct !== null && (
                              <span className={cn('text-[11px] tabular-nums font-medium', quizTextColor)}>{quizPct}%</span>
                            )}
                          </div>

                          {/* Enter/Continue button */}
                          <button
                            className={cn(
                              'shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors',
                              done > 0 || c.lastViewedScene
                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c.unread) markAssignmentRead(c.id);
                              const target = c.lastViewedScene
                                ? `/classroom/${c.id}?scene=${c.lastViewedScene}`
                                : `/classroom/${c.id}`;
                              router.push(target);
                            }}
                          >
                            {done > 0 || c.lastViewedScene ? t('classroom.continue') : t('classroom.start')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unread assignment banners */}
              <AnimatePresence>
                {invitedClassrooms.filter((c) => c.unread).map((c) => (
                  <motion.div
                    key={`unread-${c.id}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3"
                  >
                    <div
                      className="flex items-center gap-3 rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/30 px-4 py-3 cursor-pointer group"
                      onClick={() => {
                        markAssignmentRead(c.id);
                        router.push(`/classroom/${c.id}`);
                      }}
                    >
                      <Bell className="size-4 text-violet-500 shrink-0" />
                      <p className="text-sm flex-1">
                        <span className="font-medium">{t('classroom.newAssignmentBanner')}</span>{' '}
                        <span className="text-muted-foreground">{c.name}</span>
                        {c.instructorName && (
                          <span className="text-muted-foreground"> · {c.instructorName}</span>
                        )}
                      </p>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}

      {/* ═══ Recent classrooms — collapsible (instructors only; hidden for students) ═══ */}
      {classrooms.length > 0 && !isStudent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger — divider-line with centered text */}
          <button
            onClick={() => {
              const next = !recentOpen;
              setRecentOpen(next);
              try {
                localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            className="group w-full flex items-center gap-4 py-2 cursor-pointer"
          >
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <span className="shrink-0 flex items-center gap-2 text-[13px] text-muted-foreground/60 group-hover:text-foreground/70 transition-colors select-none">
              <Clock className="size-3.5" />
              {isStudent ? t('classroom.studentOwnedClassrooms') : t('classroom.recentClassrooms')}
              <span className="text-[11px] tabular-nums opacity-60">{classrooms.length}</span>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <ChevronDown className="size-3.5" />
              </motion.div>
            </span>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="pt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                  {classrooms.map((classroom, i) => (
                    <motion.div
                      key={classroom.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.04,
                        duration: 0.35,
                        ease: 'easeOut',
                      }}
                    >
                      <ClassroomCard
                        classroom={classroom}
                        slide={thumbnails[classroom.id]}
                        formatDate={formatDate}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        confirmingDelete={pendingDeleteId === classroom.id}
                        onConfirmDelete={() => confirmDelete(classroom.id)}
                        onCancelDelete={() => setPendingDeleteId(null)}
                        onClick={() => router.push(`/classroom/${classroom.id}`)}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">
        MU-OpenMAIC Open Source Project
      </div>
    </div>
  );
}

// ─── Student Profile View — embedded profile editor (no system settings) ─────
interface DbUserProfile {
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

function StudentProfileView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();

  // DB profile
  const [profile, setProfile] = useState<DbUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Change password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Local display preferences (userProfileStore — localStorage only)
  const avatar = useUserProfileStore((s) => s.avatar);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const [nicknameInput, setNicknameInput] = useState(nickname);
  const [prefSaved, setPrefSaved] = useState(false);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((d: { user: DbUserProfile }) => {
        setProfile(d.user);
        setBio(d.user?.bio ?? '');
      })
      .finally(() => setProfileLoading(false));
  }, []);

  const saveProfile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: bio.trim() }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? t('profilePage.saveSuccess') : t('profilePage.saveFailed'));
  }, [bio, t]);

  const savePreferences = useCallback(() => {
    setNickname(nicknameInput.trim());
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 2000);
  }, [nicknameInput, setNickname]);

  const changePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pwForm.newPassword !== pwForm.confirm) { setPwError(t('profilePage.pwMismatch')); return; }
    if (pwForm.newPassword.length < 10) { setPwError(t('profilePage.pwTooShort')); return; }
    setPwSaving(true);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    });
    const data = await res.json() as { error?: string };
    setPwSaving(false);
    if (!res.ok) setPwError(data.error ?? t('profilePage.pwChangeFailed'));
    else { setPwSuccess(true); setPwForm({ currentPassword: '', newPassword: '', confirm: '' }); }
  }, [pwForm, t]);

  const exportData = useCallback(async () => {
    const res = await fetch('/api/user/data-export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmaic-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteAccount = useCallback(async () => {
    setDeleting(true);
    await fetch('/api/user/delete-account', { method: 'DELETE' });
    await signOut({ callbackUrl: '/auth/signin' });
  }, []);

  const sectionClass = 'rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-4';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';
  const inputClass = 'w-full px-3 py-2 rounded-lg bg-muted/50 border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow';
  const inputReadonlyClass = 'w-full px-3 py-2 rounded-lg bg-muted/30 border border-border/40 text-sm text-muted-foreground cursor-not-allowed';

  return (
    <div className="space-y-6">
      {/* ── Back + heading ── */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          {t('studentDashboard.backToDashboard')}
        </button>
        <div className="h-4 w-px bg-border/60" />
        <h1 className="text-xl font-bold">{t('studentDashboard.profileViewTitle')}</h1>
      </div>

      {profileLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Profile Information ── */}
          <section className={sectionClass}>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <User className="size-4 text-violet-500" />
              {t('profilePage.profileInfo')}
            </h2>

            <form onSubmit={saveProfile} className="space-y-4">
              {/* Name + Student ID row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t('profilePage.fullName')}</label>
                  <input
                    value={profile?.name ?? '—'}
                    readOnly
                    className={inputReadonlyClass}
                    title="Set by your institution. Contact your administrator to change."
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('profilePage.studentId')}</label>
                  <input
                    value={profile?.studentId ?? '—'}
                    readOnly
                    className={inputReadonlyClass}
                    title="Assigned by your institution."
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className={labelClass}>{t('profilePage.email')}</label>
                <input value={profile?.email ?? '—'} readOnly className={inputReadonlyClass} />
              </div>

              {/* Bio */}
              <div>
                <label className={labelClass}>{t('profilePage.bio')}</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className={cn(inputClass, 'resize-none')}
                  placeholder="Tell us a bit about yourself…"
                />
                <p className="text-[11px] text-muted-foreground/60 mt-1 text-right">{bio.length}/500</p>
              </div>

              {/* Meta info */}
              <div className="pt-2 border-t border-border/40 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>{t('profilePage.role')}: <span className="font-medium text-foreground/80">{profile?.role}</span></span>
                <span>{t('profilePage.memberSince')}: <span className="font-medium text-foreground/80">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</span></span>
                <span>{t('profilePage.lastLogin')}: <span className="font-medium text-foreground/80">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'}</span></span>
              </div>

              {/* Save */}
              <div className="flex items-center justify-between pt-1">
                {saveMsg && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    {saveMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  {t('profilePage.saveChanges')}
                </button>
              </div>
            </form>
          </section>

          {/* ── Display Preferences ── */}
          <section className={sectionClass}>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Settings className="size-4 text-blue-500" />
              {t('studentDashboard.displayPreferences')}
            </h2>

            {/* AI Nickname */}
            <div>
              <label className={labelClass}>{t('studentDashboard.aiNickname')}</label>
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                maxLength={40}
                placeholder={profile?.name ?? 'Your nickname…'}
                className={inputClass}
              />
              <p className="text-[11px] text-muted-foreground/60 mt-1">{t('studentDashboard.aiNicknameDesc')}</p>
            </div>

            {/* Avatar picker */}
            <div>
              <label className={labelClass}>{t('studentDashboard.avatarSelect')}</label>
              <div className="flex flex-wrap gap-3 mt-1">
                {AVATAR_OPTIONS.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setAvatar(src)}
                    className={cn(
                      'size-12 rounded-full overflow-hidden border-2 transition-all hover:scale-105',
                      avatar === src
                        ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]'
                        : 'border-border/40 hover:border-border',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Save preferences */}
            <div className="flex items-center justify-between pt-1">
              {prefSaved && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  {t('studentDashboard.preferencesSaved')}
                </p>
              )}
              <button
                type="button"
                onClick={savePreferences}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {t('studentDashboard.savePreferences')}
              </button>
            </div>
          </section>

          {/* ── Change Password ── */}
          <section className={sectionClass}>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-amber-500" />
              {t('profilePage.changePassword')}
            </h2>

            <form onSubmit={changePassword} className="space-y-3">
              {([
                ['currentPassword', t('profilePage.currentPassword')],
                ['newPassword', t('profilePage.newPassword')],
                ['confirm', t('profilePage.confirmPassword')],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className={labelClass}>{label}</label>
                  <input
                    type="password"
                    value={pwForm[field]}
                    onChange={(e) => setPwForm((f) => ({ ...f, [field]: e.target.value }))}
                    className={inputClass}
                    autoComplete={field === 'currentPassword' ? 'current-password' : 'new-password'}
                  />
                </div>
              ))}
              {pwError && <p className="text-sm text-rose-500">{pwError}</p>}
              {pwSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  {t('profilePage.pwChangeSuccess')}
                </p>
              )}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {pwSaving && <Loader2 className="size-3.5 animate-spin" />}
                  {t('profilePage.updatePassword')}
                </button>
              </div>
            </form>
          </section>

          {/* ── Privacy & Data ── */}
          <section className={sectionClass}>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="size-4 text-emerald-500" />
              {t('profilePage.privacyTitle')}
            </h2>

            <div className="text-[12px] text-muted-foreground space-y-1">
              <p>
                {t('profilePage.consentGiven')}:{' '}
                <span className="text-foreground/80 font-medium">
                  {profile?.consentGiven
                    ? `${t('profilePage.consentYes')}${profile.consentAt ? ` — ${new Date(profile.consentAt).toLocaleDateString()}` : ''}`
                    : t('profilePage.consentNo')}
                </span>
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{t('profilePage.pdpaNotice')}</p>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={exportData}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted transition-colors"
              >
                <Download className="size-3.5" />
                {t('profilePage.exportData')}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              >
                <Trash2 className="size-3.5" />
                {t('profilePage.deleteAccount')}
              </button>
            </div>
          </section>
        </>
      )}

      {/* ── Delete account confirmation modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-6 text-rose-400 shrink-0" />
              <h3 className="font-semibold">{t('profilePage.anonymizeTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t('profilePage.anonymizeDesc')}</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg text-sm border border-border/60 hover:bg-muted transition-colors"
              >
                {t('profilePage.cancel')}
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                {t('profilePage.confirmAnonymize')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SCENE_TYPE_ICONS: Record<string, React.ReactNode> = {
  slide: <Presentation className="size-3" />,
  quiz: <HelpCircle className="size-3" />,
  interactive: <Globe className="size-3" />,
  pbl: <Layers className="size-3" />,
};

// ─── Student Owned Classroom Card — mirrors InvitedClassroomCard style ────────
function StudentOwnedClassroomCard({
  classroom,
  formatDate,
  onClick,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  classroom: StageListItem;
  formatDate: (ts: number) => string;
  onClick: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, name: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(classroom.name);

  const commitRename = () => {
    setEditing(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) onRename(classroom.id, trimmed);
    else setNameDraft(classroom.name);
  };

  return (
    <div
      className="group relative flex flex-col rounded-2xl border border-border/60 bg-card transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer overflow-hidden"
      onClick={() => { if (!editing && !confirmingDelete) onClick(); }}
    >
      {/* Amber gradient strip — differentiates from enrolled (blue-violet) */}
      <div className="h-2 bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-400" />

      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Title row */}
        <div>
          {editing ? (
            <input
              autoFocus
              className="w-full rounded-md border border-primary/40 bg-background px-2 py-0.5 text-[14px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary/60"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setEditing(false); setNameDraft(classroom.name); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3 className="font-semibold text-[14px] leading-snug line-clamp-2">{classroom.name}</h3>
          )}
        </div>

        {/* Scene count chip */}
        {classroom.sceneCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
              <Layers className="size-3" />
              {classroom.sceneCount} {t('classroom.scenes')}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatDate(classroom.updatedAt)}
          </span>

          {confirmingDelete ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onConfirmDelete}
                className="text-[11px] font-medium text-destructive hover:underline"
              >
                {t('classroom.delete')}
              </button>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <button
                onClick={onCancelDelete}
                className="text-[11px] text-muted-foreground hover:underline"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Rename */}
              <button
                className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                onClick={(e) => { e.stopPropagation(); setEditing(true); setNameDraft(classroom.name); }}
                title={t('classroom.rename')}
              >
                <Pencil className="size-3" />
              </button>
              {/* Delete */}
              <button
                className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-all"
                onClick={(e) => { e.stopPropagation(); onDelete(classroom.id, e); }}
                title={t('classroom.delete')}
              >
                <Trash2 className="size-3" />
              </button>
              {/* Open badge */}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                <PlayCircle className="size-3" />
                {t('classroom.open')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InvitedClassroomCard({
  classroom,
  formatDate,
  onClick,
  onViewGrades,
}: {
  classroom: InvitedClassroomItem;
  formatDate: (ts: number) => string;
  onClick: () => void;
  onViewGrades?: () => void;
}) {
  const { t } = useI18n();
  const total = classroom.sceneCount ?? 0;
  const done = classroom.completedScenes ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasStarted = done > 0 || !!classroom.lastViewedScene;

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer overflow-hidden',
        classroom.unread
          ? 'border-violet-300 dark:border-violet-700 shadow-sm shadow-violet-100 dark:shadow-violet-900/20'
          : 'border-border/60',
      )}
      onClick={onClick}
    >
      {/* Unread dot */}
      {classroom.unread && (
        <span className="absolute top-3 right-3 size-2 rounded-full bg-violet-500 ring-2 ring-background z-10" />
      )}

      {/* Header gradient */}
      <div className="h-2 bg-gradient-to-r from-blue-500 via-violet-500 to-cyan-500" />

      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Title + instructor */}
        <div>
          <h3 className="font-semibold text-[14px] leading-snug line-clamp-2">{classroom.name}</h3>
          {classroom.instructorName && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{classroom.instructorName}</p>
          )}
        </div>

        {/* Scene type chips */}
        {(classroom.sceneTypes?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {classroom.sceneTypes!.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
              >
                {SCENE_TYPE_ICONS[type] ?? <PlayCircle className="size-3" />}
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('classroom.progress')}</span>
              <span className="tabular-nums font-medium">{done}/{total} · {pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatDate(classroom.assignedAt)}
          </span>
          <div className="flex items-center gap-2">
            {onViewGrades && (
              <button
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => { e.stopPropagation(); onViewGrades(); }}
              >
                <BarChart3 className="size-3" />
                {t('classroom.grades')}
              </button>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors',
                hasStarted
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
              )}
            >
              <PlayCircle className="size-3" />
              {hasStarted ? t('classroom.continue') : t('classroom.start')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Classroom Progress Card — detailed view for progress tab ──────────────
function ClassroomProgressCard({
  classroom,
  grades,
  gradesLoading,
  formatDate,
  onEnter,
  onViewGrades,
}: {
  classroom: InvitedClassroomItem;
  grades: ClassroomGrades | null | undefined;
  gradesLoading: boolean;
  formatDate: (ts: number) => string;
  onEnter: () => void;
  onViewGrades: () => void;
}) {
  const { t } = useI18n();
  const sceneCount = classroom.sceneCount ?? 0;
  const completedScenes = classroom.completedScenes ?? 0;
  const scenePct = sceneCount > 0 ? Math.round((completedScenes / sceneCount) * 100) : 0;

  const quizPct =
    grades && grades.totalMax > 0
      ? Math.round((grades.totalScore / grades.totalMax) * 100)
      : null;
  const quizResultCount = grades?.results.length ?? 0;

  const quizBarColor =
    quizPct === null
      ? 'bg-muted/50'
      : quizPct >= 80
        ? 'bg-emerald-500'
        : quizPct >= 50
          ? 'bg-amber-500'
          : 'bg-rose-500';

  const quizTextColor =
    quizPct === null
      ? 'text-muted-foreground/50'
      : quizPct >= 80
        ? 'text-emerald-500 dark:text-emerald-400'
        : quizPct >= 50
          ? 'text-amber-500 dark:text-amber-400'
          : 'text-rose-500 dark:text-rose-400';

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Color accent */}
      <div className="h-1.5 bg-gradient-to-r from-blue-500 via-violet-500 to-cyan-500" />

      <div className="p-5">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-snug truncate">{classroom.name}</h3>
            {classroom.instructorName && (
              <p className="text-[12px] text-muted-foreground mt-0.5">{classroom.instructorName}</p>
            )}
            {(classroom.sceneTypes?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {classroom.sceneTypes!.map((type) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
                  >
                    {SCENE_TYPE_ICONS[type] ?? <PlayCircle className="size-3" />}
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums">
            {formatDate(classroom.assignedAt)}
          </span>
        </div>

        {/* ── Two-column stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Scene Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-blue-500" />
                {t('studentDashboard.sceneProgressLabel')}
              </span>
              <span className="tabular-nums font-semibold">
                {completedScenes}
                <span className="text-muted-foreground font-normal">/{sceneCount}</span>
                <span className="ml-1 text-muted-foreground">· {scenePct}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700"
                style={{ width: `${scenePct}%` }}
              />
            </div>
          </div>

          {/* Quiz Performance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="size-3.5 text-emerald-500" />
                {t('studentDashboard.quizPerformanceLabel')}
              </span>
              {gradesLoading ? (
                <span className="text-muted-foreground/50 italic">{t('studentDashboard.loadingGrades')}</span>
              ) : quizPct !== null ? (
                <span className={cn('tabular-nums font-semibold', quizTextColor)}>
                  {grades!.totalScore}
                  <span className="text-muted-foreground font-normal">/{grades!.totalMax}</span>
                  <span className="ml-1">· {quizPct}%</span>
                  {quizResultCount > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                      ({t(
                        quizResultCount === 1
                          ? 'studentDashboard.quizResultCount'
                          : 'studentDashboard.quizResultCountPlural',
                        { count: String(quizResultCount) },
                      )})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground/50 italic">{t('studentDashboard.noQuizResults')}</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              {!gradesLoading && (
                <div
                  className={cn('h-full rounded-full transition-all duration-700', quizBarColor)}
                  style={{ width: quizPct !== null ? `${quizPct}%` : '0%' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/40">
          <button
            onClick={onEnter}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <PlayCircle className="size-3.5" />
            {t('toolbar.enterClassroom')}
          </button>
          <button
            onClick={onViewGrades}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-card hover:bg-muted transition-colors"
          >
            <BarChart3 className="size-3.5" />
            {t('classroom.grades')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={100}
              placeholder={t('classroom.renamePlaceholder')}
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
                onDoubleClick={startRename}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success(t('classroom.nameCopied'));
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}
