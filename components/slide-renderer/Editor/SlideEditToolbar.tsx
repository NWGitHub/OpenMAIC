'use client';

import { useCallback, useRef } from 'react';
import { Minus, Plus, Pencil, Check, Baseline, Bold } from 'lucide-react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { useStageStore } from '@/lib/store/stage';
import { cn } from '@/lib/utils';
import type { PPTTextElement } from '@/lib/types/slides';
import type { SlideContent } from '@/lib/types/stage';
import emitter, { EmitterEvents } from '@/lib/utils/emitter';

// ─── Font-size helpers ────────────────────────────────────────────────────────

function parseDominantFontSize(html: string): number | null {
  const sizes: number[] = [];
  for (const m of html.matchAll(/font-size:\s*([\d.]+)px/gi)) {
    const n = parseFloat(m[1]);
    if (n > 0) sizes.push(n);
  }
  if (!sizes.length) return null;
  const freq = new Map<number, number>();
  for (const s of sizes) freq.set(s, (freq.get(s) ?? 0) + 1);
  let best = sizes[0], bestCount = 0;
  for (const [size, count] of freq) if (count > bestCount) { best = size; bestCount = count; }
  return Math.round(best);
}

function scaleFontSizes(html: string, delta: number): string {
  return html.replace(/font-size:\s*([\d.]+)px/gi, (_m, s) =>
    `font-size: ${Math.max(6, Math.round(parseFloat(s) + delta))}px`,
  );
}

// ─── Bold helpers ─────────────────────────────────────────────────────────────

/** Returns true if the HTML content is predominantly bold. */
function parseDominantBold(html: string): boolean {
  return /<strong\b/i.test(html) || /font-weight:\s*(bold|700)/i.test(html);
}

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Convert any CSS color string to a #rrggbb hex string for <input type="color">. */
function cssColorToHex(color: string): string {
  if (!color) return '#000000';
  const s = color.trim();
  // Already 6-digit hex
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  // 3-digit hex
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const [, r, g, b] = s.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  // rgb(r, g, b)
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) {
    return '#' + [rgb[1], rgb[2], rgb[3]]
      .map((n) => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  // Named colors via a throwaway canvas (best-effort)
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = s;
      const computed = ctx.fillStyle; // browser normalises to #rrggbb or rgb(...)
      if (/^#[0-9a-f]{6}$/i.test(computed)) return computed;
    }
  }
  return '#000000';
}

/**
 * Parse the dominant text color from an HTML string (inline `color:` style).
 * Falls back to `defaultColor` on the element if no inline color found.
 */
function parseDominantColor(html: string, fallback = '#000000'): string {
  const colors: string[] = [];
  for (const m of html.matchAll(/(?<![a-z-])color:\s*([^;}"']+)/gi)) {
    const c = m[1].trim();
    if (c && c !== 'inherit' && c !== 'transparent') colors.push(c);
  }
  if (!colors.length) return cssColorToHex(fallback);
  // Return the most common color
  const freq = new Map<string, number>();
  for (const c of colors) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = colors[0], bestCount = 0;
  for (const [c, count] of freq) if (count > bestCount) { best = c; bestCount = count; }
  return cssColorToHex(best);
}

/** Replace every inline `color:` value in the HTML with `newColor`. */
function replaceColors(html: string, newColor: string): string {
  return html.replace(/(?<![a-z-])color:\s*([^;}"']+)/gi, `color: ${newColor}`);
}

// ─── Preset palette ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#000000', '#ffffff', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SlideEditToolbar() {
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const setMode = useStageStore.use.setMode();
  const colorInputRef = useRef<HTMLInputElement>(null);

  const elements = useSceneSelector<SlideContent, SlideContent['canvas']['elements']>(
    (c) => c.canvas.elements,
  );

  const { updateElement } = useCanvasOperations();

  const activeId = activeElementIdList[0];
  const activeEl = elements?.find((el) => el.id === activeId);
  const isTextEl = activeEl?.type === 'text';
  const textEl = isTextEl ? (activeEl as PPTTextElement) : null;

  const fontSize = textEl ? parseDominantFontSize(textEl.content) : null;
  const currentColor = textEl
    ? parseDominantColor(textEl.content, textEl.defaultColor)
    : '#000000';
  const isBold = textEl ? parseDominantBold(textEl.content) : false;

  const adjustFontSize = useCallback(
    (delta: number) => {
      if (!textEl) return;
      updateElement({ id: textEl.id, props: { content: scaleFontSizes(textEl.content, delta) } });
    },
    [textEl, updateElement],
  );

  const toggleBold = useCallback(() => {
    if (!textEl) return;
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'bold' } });
  }, [textEl]);

  const applyColor = useCallback(
    (hex: string) => {
      if (!textEl) return;
      const newContent = replaceColors(textEl.content, hex);
      updateElement({ id: textEl.id, props: { content: newContent, defaultColor: hex } });
    },
    [textEl, updateElement],
  );

  const handleDone = useCallback(() => setMode('playback'), [setMode]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/95 backdrop-blur-sm border-b border-white/10 select-none overflow-x-auto">
      {/* Edit indicator */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 shrink-0">
        <Pencil className="w-3 h-3" />
        <span>Editing</span>
      </div>

      <div className="w-px h-4 bg-white/15 shrink-0" />

      {textEl ? (
        <>
          {/* ── Font size ── */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-slate-400 mr-0.5">Size</span>
            <button
              onClick={() => adjustFontSize(-2)}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              title="Decrease font size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className={cn(
              'w-7 text-center text-xs font-mono font-semibold tabular-nums',
              fontSize ? 'text-white' : 'text-slate-500',
            )}>
              {fontSize ?? '—'}
            </span>
            <button
              onClick={() => adjustFontSize(2)}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              title="Increase font size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="w-px h-4 bg-white/15 shrink-0" />

          {/* ── Bold ── */}
          <button
            onClick={toggleBold}
            title="Bold (Ctrl+B)"
            className={cn(
              'w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0',
              isBold
                ? 'bg-white/20 text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/15 shrink-0" />

          {/* ── Text color ── */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Baseline className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-400">Color</span>

            {/* Preset swatches */}
            <div className="flex gap-0.5">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  onClick={() => applyColor(hex)}
                  title={hex}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    'w-4 h-4 rounded-sm border transition-transform hover:scale-110',
                    currentColor.toLowerCase() === hex.toLowerCase()
                      ? 'border-white scale-110 ring-1 ring-white/60'
                      : 'border-white/20',
                  )}
                />
              ))}
            </div>

            {/* Custom color picker */}
            <div className="relative">
              <button
                onClick={() => colorInputRef.current?.click()}
                title="Custom color"
                className="w-5 h-5 rounded-sm border border-white/30 overflow-hidden hover:border-white/60 transition-colors flex items-center justify-center"
                style={{ backgroundColor: currentColor }}
              >
                {/* checkered bg for transparent detection */}
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={currentColor}
                onChange={(e) => applyColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-0 h-0 pointer-events-none"
                tabIndex={-1}
              />
            </div>
          </div>
        </>
      ) : (
        <span className="text-xs text-slate-500 italic shrink-0">
          {activeEl ? 'Select a text element to edit' : 'Click a text element to select it'}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Hint */}
      <span className="text-xs text-slate-500 hidden md:block shrink-0">
        Drag to move · handles to resize
      </span>

      <div className="w-px h-4 bg-white/15 shrink-0" />

      {/* Done */}
      <button
        onClick={handleDone}
        className="flex items-center gap-1.5 h-6 rounded-full px-3 text-xs font-semibold bg-green-600/80 text-white hover:bg-green-500 transition-colors shrink-0"
      >
        <Check className="w-3 h-3" />
        Done
      </button>
    </div>
  );
}
