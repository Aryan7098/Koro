'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PublicStats, publicStats } from '../lib/api';
import { RadioIcon } from './icons';

// Stadium-scoreboard ticker under the landing hero. Bebas Neue numerals,
// a faint LED scanline drifting over the strip, numbers counting up on
// change, and the whole band scrolling like a perimeter advertising board.
// Hovering pauses the scroll (CSS) so values can actually be read.

function useAnimatedNumber(target: number, durationMs = 800): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const start = value;
    const t0 = performance.now();
    let frame: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const n = useAnimatedNumber(value);
  return (
    <span className="inline-flex items-baseline gap-2 mx-6 whitespace-nowrap">
      <span className="font-scoreboard text-emerald-300 tabular-nums text-2xl leading-none animate-led-flicker">
        {n.toLocaleString()}
        {suffix}
      </span>
      <span className="text-slate-400 text-xs uppercase tracking-widest">{label}</span>
    </span>
  );
}

export default function StatsTicker() {
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const s = await publicStats();
        if (!stopped) setStats(s);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 15000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);

  // A default "ambient" value while stats load, so the ticker isn't empty
  const s = stats || {
    reports_seen_24h: 0,
    events_seen_24h: 0,
    events_resolved_24h: 0,
    events_open_now: 0,
    languages_seen_24h: 6,
  };

  const strip = (
    <>
      <Stat label="reports fused (24h)" value={s.reports_seen_24h} />
      <span className="text-emerald-900">●</span>
      <Stat label="canonical events" value={s.events_seen_24h} />
      <span className="text-emerald-900">●</span>
      <Stat label="resolved" value={s.events_resolved_24h} />
      <span className="text-emerald-900">●</span>
      <Stat label="open right now" value={s.events_open_now} />
      <span className="text-emerald-900">●</span>
      <Stat label="languages seen" value={s.languages_seen_24h} />
      <span className="text-emerald-900">●</span>
      <span className="inline-flex items-center gap-2 mx-6 whitespace-nowrap text-emerald-300">
        <RadioIcon size={15} className="text-emerald-400" />
        <span className="text-xs uppercase tracking-widest">live</span>
      </span>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="relative overflow-hidden py-3.5 border-y border-emerald-500/20 bg-night-900/70 backdrop-blur"
    >
      {/* LED grid texture */}
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(52, 211, 153, 0.5) 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }}
      />
      {/* Drifting scanline */}
      <div
        className="absolute left-0 right-0 h-8 animate-scanline pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(52, 211, 153, 0.08), transparent)',
        }}
      />
      <div className="relative flex animate-marquee w-max">
        {strip}
        {/* Second copy makes the loop seamless — hidden from screen readers */}
        <div className="contents" aria-hidden="true">
          {strip}
        </div>
      </div>
    </motion.div>
  );
}
