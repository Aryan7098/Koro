'use client';

import PitchLines from './PitchLines';

// Fixed ambient backdrop for role pages: the night gradient, one soft
// accent-colored floodlight blob, and a faint pitch-diagram watermark.
// Sits at -z-10 so page content needs no z-index gymnastics.

const ACCENTS = {
  sky: '#0284c7',
  emerald: '#0d9488',
  amber: '#b45309',
  purple: '#7c3aed',
  cyan: '#0891b2',
} as const;

export type Accent = keyof typeof ACCENTS;

export default function PageBackdrop({ accent = 'emerald' }: { accent?: Accent }) {
  const color = ACCENTS[accent];
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-night-950 via-slate-900 to-night-950" />
      <div
        className="absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full blur-3xl opacity-25 animate-blob"
        style={{ background: `radial-gradient(circle at 40% 40%, ${color}, transparent 62%)` }}
      />
      <PitchLines
        animate={false}
        strokeWidth={2}
        className="absolute -left-44 -bottom-40 w-[820px] rotate-[10deg] text-slate-400 opacity-[0.05]"
      />
    </div>
  );
}
