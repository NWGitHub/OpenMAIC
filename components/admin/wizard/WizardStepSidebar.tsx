'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStepState = 'todo' | 'active' | 'valid' | 'error';

export interface WizardStep {
  id: string;
  title: string;
  href: string;
}

export interface WizardStepSidebarProps {
  steps: WizardStep[];
  currentStepId: string;
  stepState?: Partial<Record<string, WizardStepState>>;
}

function StepIcon({ state }: { state: WizardStepState }) {
  if (state === 'valid') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (state === 'error') return <AlertTriangle className="h-4 w-4 text-red-400" />;
  return <Circle className={cn('h-4 w-4', state === 'active' ? 'text-primary' : 'text-slate-500')} />;
}

export function WizardStepSidebar({ steps, currentStepId, stepState }: WizardStepSidebarProps) {
  return (
    <aside className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Steps</p>
      <nav className="space-y-1">
        {steps.map((step, index) => {
          const inferredState: WizardStepState = step.id === currentStepId ? 'active' : 'todo';
          const state = stepState?.[step.id] ?? inferredState;
          const isCurrent = step.id === currentStepId;

          return (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
                isCurrent
                  ? 'bg-primary/15 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <StepIcon state={state} />
              <span className="w-5 text-xs text-slate-500 dark:text-slate-400">{index + 1}.</span>
              <span className="truncate">{step.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
