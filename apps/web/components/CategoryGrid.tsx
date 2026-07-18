'use client';

import { CATEGORIES, CategoryDef, label } from '../lib/categories';

// Emoji-per-category — visual anchor for one-tap under time pressure.
const ICON: Record<string, string> = {
  spill: '💧',
  restroom: '🚻',
  vendor: '🍔',
  gate: '🚪',
  wayfinding: '🧭',
  smell: '🌫️',
  crowd: '👥',
  medical: '⛑️',
  security: '🛡️',
  structural: '🔥',
};

// Severity bias → border color, so the safety-critical tiles read differently
// at a glance without dominating the layout when everything's calm.
const BIAS_BORDER: Record<string, string> = {
  LOW: 'border-slate-700',
  MED: 'border-yellow-700',
  HIGH: 'border-orange-700',
  CRITICAL: 'border-red-700',
};

type Props = {
  lang: string;
  disabled?: boolean;
  onPick: (categoryId: string) => void;
};

export default function CategoryGrid({ lang, disabled, onPick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {CATEGORIES.map((c: CategoryDef) => (
        <button
          key={c.id}
          onClick={() => onPick(c.id)}
          disabled={disabled}
          className={`p-4 rounded-lg border-2 text-left transition disabled:opacity-40 hover:bg-slate-800/40 ${
            BIAS_BORDER[c.severity_bias] || 'border-slate-700'
          }`}
        >
          <div className="text-3xl leading-none mb-2">{ICON[c.id] || '📌'}</div>
          <div className="text-sm font-semibold leading-tight">{label(c.id, lang)}</div>
          {c.safety_critical && (
            <div className="text-[10px] uppercase text-red-400 mt-1 tracking-wider">
              safety-critical
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
