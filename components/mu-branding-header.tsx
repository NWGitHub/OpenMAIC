'use client';

import { GraduationCap } from 'lucide-react';

interface MuBrandingHeaderProps {
  /** When true, renders at 1.5× the default size (for student pages). */
  large?: boolean;
}

/**
 * MU-OpenMAIC logo bar.
 * The outer element is intentionally unstyled so the caller controls
 * positioning (fixed / absolute / static).
 */
export function MuBrandingHeader({ large = false }: MuBrandingHeaderProps) {
  return (
    <div className={large ? 'flex items-center gap-3' : 'flex items-center gap-2'}>
      <div
        className={
          large
            ? 'w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center shrink-0 shadow shadow-purple-900/30'
            : 'w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center shrink-0 shadow-sm shadow-purple-900/30'
        }
      >
        <GraduationCap className={large ? 'w-6 h-6 text-white' : 'w-4 h-4 text-white'} />
      </div>
      <span
        className={
          large
            ? 'font-bold text-xl tracking-tight leading-none select-none'
            : 'font-bold text-sm tracking-tight leading-none select-none'
        }
      >
        <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
          MU-
        </span>
        <span className="text-gray-900 dark:text-white">OpenMAIC</span>
      </span>
    </div>
  );
}
