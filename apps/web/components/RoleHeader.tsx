'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeftIcon } from './icons';

// Shared header for role pages: back link, scoreboard-style title with the
// role's accent gradient, a subtitle line, and a right-hand slot for
// actions (sign out, language picker, …).

type Props = {
  title: string;
  gradient: string; // e.g. 'from-sky-300 to-cyan-400'
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
};

export default function RoleHeader({ title, gradient, subtitle, right }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <header className="flex items-start justify-between gap-3 mb-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-300 transition group"
        >
          <ArrowLeftIcon size={14} className="transition-transform group-hover:-translate-x-0.5" />
          matchday home
        </Link>
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={`font-scoreboard text-5xl leading-none mt-1 bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
        >
          {title}
        </motion.h1>
        {subtitle && <div className="text-xs text-slate-500 mt-1.5">{subtitle}</div>}
      </div>
      {right && <div className="flex items-center gap-2 pt-5">{right}</div>}
    </header>
  );
}
