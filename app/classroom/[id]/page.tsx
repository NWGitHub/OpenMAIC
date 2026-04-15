'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { useSession } from 'next-auth/react';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const classroomId = params?.id as string;
  const targetSceneId = searchParams.get('scene')?.trim() || null;
  const { data: session } = useSession();
  const canManageStudentsFromHeader =
    session?.user?.role === 'INSTRUCTOR' || session?.user?.role === 'ADMIN';
  const hasPersistAttemptedRef = useRef(false);

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resumeInFlightRef = useRef(false);
  const mediaResumeTriggeredRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              const stageWithOwnership =
                session?.user?.role === 'STUDENT'
                  ? { ...stage, ownershipType: 'invited' as const }
                  : stage;
              useStageStore.getState().setStage(stageWithOwnership);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('Loaded from server-side storage:', classroomId);

              // Hydrate server-generated agents into IndexedDB + registry
              if (stage.generatedAgentConfigs?.length) {
                const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
                const { useSettingsStore } = await import('@/lib/store/settings');
                const agentIds = await saveGeneratedAgents(stage.id, stage.generatedAgentConfigs);
                useSettingsStore.getState().setSelectedAgentIds(agentIds);
                log.info('Hydrated server-generated agents:', agentIds);
              }
            }
          }
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
        }
      }

      // Ensure classrooms managed by instructors/admins are persisted server-side
      // so assigned students can load the same classroom from /api/classroom.
      if (canManageStudentsFromHeader && !hasPersistAttemptedRef.current) {
        hasPersistAttemptedRef.current = true;
        try {
          const checkRes = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (checkRes.status === 404) {
            const state = useStageStore.getState();
            if (state.stage && state.scenes.length > 0) {
              const persistRes = await fetch('/api/classroom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  stage: { ...state.stage, id: classroomId },
                  scenes: state.scenes,
                }),
              });
              if (!persistRes.ok) {
                log.warn('Failed to persist classroom server-side:', classroomId);
              } else {
                log.info('Persisted classroom server-side:', classroomId);
              }
            }
          }
        } catch (persistErr) {
          log.warn('Server-side classroom persist check failed:', persistErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage, canManageStudentsFromHeader, session?.user?.role]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    resumeInFlightRef.current = false;
    mediaResumeTriggeredRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines until completion.
  useEffect(() => {
    if (loading || error) return;

    const tick = () => {
      if (resumeInFlightRef.current) return;

      const state = useStageStore.getState();
      const { outlines, scenes, stage, failedOutlines } = state;
      if (!stage || outlines.length === 0) return;

      const completedOrders = new Set(scenes.map((s) => s.order));
      const hasPending = outlines.some((o) => !completedOrders.has(o.order));

      if (hasPending) {
        // If there are explicit failed outlines, keep paused for manual retry.
        if (failedOutlines.length > 0) return;

        resumeInFlightRef.current = true;

        const genParamsStr = sessionStorage.getItem('generationParams');
        const params = genParamsStr ? JSON.parse(genParamsStr) : {};

        const storageIds = (params.pdfImages || [])
          .map((img: { storageId?: string }) => img.storageId)
          .filter(Boolean);

        loadImageMapping(storageIds)
          .then((imageMapping) =>
            generateRemaining({
              pdfImages: params.pdfImages,
              imageMapping,
              stageInfo: {
                name: stage.name || '',
                description: stage.description,
                language: stage.language,
                style: stage.style,
              },
              agents: params.agents,
              userProfile: params.userProfile,
            }),
          )
          .catch((err) => {
            log.warn('[Classroom] Resume generation error:', err);
          })
          .finally(() => {
            resumeInFlightRef.current = false;
          });
        return;
      }

      // All scenes are done; ensure media catch-up runs once.
      if (!mediaResumeTriggeredRef.current) {
        mediaResumeTriggeredRef.current = true;
        generateMediaForOutlines(outlines, stage.id).catch((err) => {
          log.warn('[Classroom] Media generation resume error:', err);
        });
      }
    };

    tick();
    const interval = window.setInterval(tick, 2500);
    return () => window.clearInterval(interval);
  }, [loading, error, generateRemaining]);

  // If navigated with ?scene=<id>, open that scene in AI Canvas after load.
  useEffect(() => {
    if (loading || error || !targetSceneId) return;

    let cancelled = false;

    const openTargetScene = async () => {
      let { scenes, currentSceneId, setCurrentSceneId } = useStageStore.getState();

      // Freshly created scenes may exist server-side but not yet in IndexedDB cache.
      if (!scenes.some((scene) => scene.id === targetSceneId)) {
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = (await res.json()) as {
              success?: boolean;
              classroom?: {
                stage: Record<string, unknown>;
                scenes: Array<{ id: string }>;
              };
            };
            if (!cancelled && json.success && json.classroom) {
              const stageWithOwnership =
                session?.user?.role === 'STUDENT'
                  ? { ...json.classroom.stage, ownershipType: 'invited' as const }
                  : json.classroom.stage;
              useStageStore.getState().setStage(stageWithOwnership as never);
              useStageStore.setState({
                scenes: json.classroom.scenes,
                currentSceneId: json.classroom.scenes[0]?.id ?? null,
              });
              ({ scenes, currentSceneId, setCurrentSceneId } = useStageStore.getState());
            }
          }
        } catch (fetchErr) {
          log.warn('Failed to refresh classroom for target scene:', fetchErr);
        }
      }

      if (cancelled) return;
      if (!scenes.some((scene) => scene.id === targetSceneId)) return;
      if (currentSceneId === targetSceneId) return;

      setCurrentSceneId(targetSceneId);
    };

    void openTargetScene();

    return () => {
      cancelled = true;
    };
  }, [loading, error, targetSceneId, classroomId, session?.user?.role]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
