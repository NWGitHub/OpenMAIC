'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Settings, Loader2, Zap } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { SpeechButton } from '@/components/audio/speech-button';
import { SettingsDialog } from '@/components/settings';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { storePdfBlob } from '@/lib/utils/image-storage';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import type { UserRequirements } from '@/lib/types/generation';

type Language = 'zh-CN' | 'en-US' | 'th-TH';

interface ClassroomInfo {
  name: string;
  description?: string;
  language?: string;
}

export default function GenerateScenesPage() {
  const params = useParams();
  const classroomId = params?.id as string;
  const router = useRouter();
  const { t } = useI18n();

  const currentModelId = useSettingsStore((s) => s.modelId);

  const [classroom, setClassroom] = useState<ClassroomInfo | null>(null);
  const [loadingClassroom, setLoadingClassroom] = useState(true);

  const [requirement, setRequirement] = useState('');
  const [language, setLanguage] = useState<Language>('en-US');
  const [webSearch, setWebSearch] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { cachedValue: cachedDraft, updateCache: updateDraftCache } = useDraftCache<string>({
    key: `generateScenesDraft_${classroomId}`,
  });

  // Load classroom info
  useEffect(() => {
    if (!classroomId) return;
    fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`)
      .then((r) => r.json())
      .then((json: { success?: boolean; classroom?: { stage: ClassroomInfo } }) => {
        if (json.success && json.classroom) {
          const stage = json.classroom.stage;
          setClassroom(stage);

          // Normalise legacy 'en' value saved by older wizard versions → 'en-US'
          const lang = stage.language === 'en' ? 'en-US' : stage.language;
          if (lang === 'zh-CN' || lang === 'en-US' || lang === 'th-TH') {
            setLanguage(lang);
          }

          // Pre-fill requirement from classroom description or cached draft
          const prefill = cachedDraft || stage.description?.trim() || stage.name?.trim() || '';
          setRequirement(prefill);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingClassroom(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  const handleRequirementChange = useCallback(
    (value: string) => {
      setRequirement(value);
      updateDraftCache(value);
    },
    [updateDraftCache],
  );

  const canGenerate = requirement.trim().length > 0 && !generating;

  const startGeneration = async () => {
    if (!canGenerate) return;

    if (!currentModelId) {
      setSettingsSection('providers');
      setSettingsOpen(true);
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: requirement.trim(),
        language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: webSearch || undefined,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (pdfFile) {
        pdfStorageKey = await storePdfBlob(pdfFile);
        pdfFileName = pdfFile.name;

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
        targetClassroomId: classroomId,
        targetClassroomTitle: classroom?.name || '',
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        sceneOutlines: null,
        currentStep: 'generating' as const,
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        interactiveMode: interactiveMode || undefined,
      };


      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));
      updateDraftCache(''); // clear draft after submitting
      router.push('/generation-preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setGenerating(false);
    }
  };

  const handleGenerate = () => startGeneration();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) void startGeneration();
    }
  };

  if (loadingClassroom) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />

      <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
        {/* Back */}
        <button
          onClick={() => router.push(`/instructor/classrooms/${classroomId}/overview`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('classroomWizard.review.backToClassroom')}
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('generateScenes.title')}
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            {t('generateScenes.subtitle', { name: classroom?.name ?? classroomId })}
          </p>
        </div>

        {/* Config card */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 overflow-hidden">
          {/* Classroom badge */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-2 bg-indigo-500/10">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              {t('generateScenes.forClassroom')}
            </span>
            <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{classroom?.name}</span>
          </div>

          <div className="p-5 space-y-4">
            {/* Prompt */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('generateScenes.promptLabel')}
              </label>
              <p className="text-xs text-slate-500">
                {t('generateScenes.promptHint')}
              </p>
              <textarea
                value={requirement}
                onChange={(e) => handleRequirementChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('generateScenes.promptPlaceholder')}
                rows={5}
                className="w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Toolbar + action row */}
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  language={language}
                  onLanguageChange={setLanguage}
                  webSearch={webSearch}
                  onWebSearchChange={setWebSearch}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={pdfFile}
                  onPdfFileChange={setPdfFile}
                  onPdfError={setPdfError}
                />
              </div>

              <SpeechButton
                size="md"
                disabled={generating}
                onTranscription={(text) => {
                  handleRequirementChange(requirement + (requirement ? ' ' : '') + text);
                }}
              />

              <button
                onClick={() => setInteractiveMode((v) => !v)}
                disabled={generating}
                title={t('stage.interactiveMode')}
                className={cn(
                  'shrink-0 h-9 rounded-full flex items-center justify-center gap-1.5 px-3 text-xs font-semibold transition-all border',
                  interactiveMode
                    ? 'text-cyan-300 bg-cyan-900/30 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.35)] cursor-pointer'
                    : generating
                      ? 'text-slate-600 bg-white/5 border-transparent cursor-not-allowed'
                      : 'text-slate-400 bg-white/5 border-white/10 hover:text-cyan-300 hover:border-cyan-500/40 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-pointer',
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t('stage.interactiveMode')}</span>
              </button>

              <button
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-9 rounded-xl flex items-center justify-center gap-2 px-5 text-sm font-semibold transition-all',
                  canGenerate
                    ? interactiveMode
                      ? 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm cursor-pointer'
                    : 'bg-white/5 text-slate-600 cursor-not-allowed',
                )}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('generateScenes.generating')}
                  </>
                ) : (
                  <>
                    {interactiveMode ? <Zap className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                    {t('generateScenes.generateBtn')}
                  </>
                )}
              </button>
            </div>

            {pdfError && (
              <p className="text-xs text-amber-400">{pdfError}</p>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        </div>

        {/* Model setup nudge */}
        {!currentModelId && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <Settings className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">{t('settings.modelNotConfigured')}</p>
              <p className="text-xs text-amber-400/70 mt-0.5">{t('settings.setupNeeded')}</p>
              <button
                onClick={() => { setSettingsSection('providers'); setSettingsOpen(true); }}
                className="mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
              >
                {t('generateScenes.setupModel')}
              </button>
            </div>
          </div>
        )}

        {/* Tip */}
        <p className="text-xs text-slate-600 text-center">
          {t('generateScenes.tip')}
        </p>
      </div>
    </>
  );
}
