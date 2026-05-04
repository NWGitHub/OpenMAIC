'use client';

import Canvas from './Canvas';
import type { StageMode } from '@/lib/types/stage';
import { ScreenCanvas } from './ScreenCanvas';
import { SlideEditToolbar } from './SlideEditToolbar';

/**
 * Slide Editor - wraps Canvas with SceneProvider
 */
export function SlideEditor({ mode }: { readonly mode: StageMode }) {
  const isEditMode = mode === 'autonomous' || mode === 'instructor-edit';

  return (
    <div className="flex flex-col h-full">
      {mode === 'instructor-edit' && <SlideEditToolbar />}
      <div className="flex-1 overflow-hidden">
        {isEditMode ? <Canvas /> : <ScreenCanvas />}
      </div>
    </div>
  );
}
