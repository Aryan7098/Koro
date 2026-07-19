'use client';

import type { ComponentType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CATEGORIES, CategoryDef, label } from '../lib/categories';
import {
  BurgerIcon,
  CompassIcon,
  DropletIcon,
  FlameIcon,
  FogIcon,
  GateIcon,
  MedicalIcon,
  RestroomIcon,
  ShieldIcon,
  UsersIcon,
  type IconProps,
} from './icons';

// One vector icon per category — a visual anchor for one-tap under time
// pressure. Same stroke family everywhere so the grid reads as one system.
const ICON: Record<string, ComponentType<IconProps>> = {
  spill: DropletIcon,
  restroom: RestroomIcon,
  vendor: BurgerIcon,
  gate: GateIcon,
  wayfinding: CompassIcon,
  smell: FogIcon,
  crowd: UsersIcon,
  medical: MedicalIcon,
  security: ShieldIcon,
  structural: FlameIcon,
};

// Severity bias → border + icon tint, so the safety-critical tiles read
// differently at a glance without dominating the layout when everything's calm.
const BIAS: Record<string, { border: string; icon: string }> = {
  LOW: { border: 'border-slate-700 hover:border-slate-500', icon: 'text-slate-300' },
  MED: { border: 'border-yellow-700/80 hover:border-yellow-500', icon: 'text-yellow-300' },
  HIGH: { border: 'border-orange-700/80 hover:border-orange-500', icon: 'text-orange-300' },
  CRITICAL: { border: 'border-red-700/80 hover:border-red-500', icon: 'text-red-300' },
};

type Props = {
  lang: string;
  disabled?: boolean;
  onPick: (categoryId: string) => void;
};

export default function CategoryGrid({ lang, disabled, onPick }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 gap-3"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
    >
      {CATEGORIES.map((c: CategoryDef) => {
        const Icon = ICON[c.id] || CompassIcon;
        const bias = BIAS[c.severity_bias] || BIAS.LOW;
        return (
          <motion.button
            key={c.id}
            variants={{
              hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
            }}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            onClick={() => onPick(c.id)}
            disabled={disabled}
            className={`p-4 rounded-xl border-2 text-left transition-colors duration-200 disabled:opacity-40 bg-slate-900/30 hover:bg-slate-800/50 cursor-pointer group ${bias.border}`}
          >
            <span
              className={`inline-flex w-10 h-10 items-center justify-center rounded-lg bg-slate-950/60 mb-2 ${bias.icon} transition-transform duration-200 group-hover:scale-110 group-active:scale-95`}
            >
              <Icon size={22} />
            </span>
            <div className="text-sm font-semibold leading-tight text-slate-100">
              {label(c.id, lang)}
            </div>
            {c.safety_critical && (
              <div className="text-[10px] uppercase text-red-400 mt-1 tracking-wider">
                safety-critical
              </div>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
