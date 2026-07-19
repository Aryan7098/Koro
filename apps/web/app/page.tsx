'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import AmbientBackground from '../components/AmbientBackground';
import StatsTicker from '../components/StatsTicker';
import SoccerBall from '../components/SoccerBall';
import {
  ArrowRightIcon,
  HeadsetIcon,
  RadarIcon,
  RadioIcon,
  UsersIcon,
  VestIcon,
} from '../components/icons';

// A stylized crest we draw ourselves so we don't touch FIFA's trademarks.
// A spinning match ball in a floodlit ring, the "26" year mark in gold.
function WorldCupCrest() {
  return (
    <div className="flex items-center gap-3 animate-kickoff-pop">
      <div className="relative w-14 h-14 rounded-full flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 opacity-90 animate-shine shadow-glow" />
        <div className="absolute inset-[3px] rounded-full bg-night-950/80" />
        <SoccerBall size={38} spinning className="relative" />
      </div>
      <div className="leading-none">
        <div className="text-xs uppercase tracking-[0.4em] text-emerald-300 font-semibold">
          World Cup
        </div>
        <div className="font-scoreboard text-4xl text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-amber-500">
          ’26
        </div>
      </div>
    </div>
  );
}

const roles = [
  {
    href: '/fan',
    title: 'Fan',
    desc: 'Report what you see. Get guidance in your language.',
    Icon: UsersIcon,
    gradient: 'from-sky-500/25 to-cyan-500/10',
    border: 'border-sky-700 hover:border-sky-400',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    glow: 'group-hover:shadow-glow-sky',
  },
  {
    href: '/volunteer',
    title: 'Volunteer',
    desc: 'Verify reports. Complete dispatched tasks. Submit evidence.',
    Icon: VestIcon,
    gradient: 'from-emerald-500/25 to-teal-500/10',
    border: 'border-emerald-700 hover:border-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    glow: 'group-hover:shadow-glow',
  },
  {
    href: '/staff',
    title: 'Staff',
    desc: 'Dispatch. Authorize safety-critical events. Verify + notify fans.',
    Icon: HeadsetIcon,
    gradient: 'from-amber-500/25 to-orange-500/10',
    border: 'border-amber-700 hover:border-amber-400',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glow: 'group-hover:shadow-glow-gold',
  },
  {
    href: '/organizer',
    title: 'Organizer',
    desc: 'Live venue map. Metrics. Emergent patterns across the match.',
    Icon: RadarIcon,
    gradient: 'from-purple-500/25 to-fuchsia-500/10',
    border: 'border-purple-700 hover:border-purple-400',
    chip: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    glow: 'group-hover:shadow-[0_0_24px_-4px_rgba(168,85,247,0.45)]',
  },
];

const LANGS = ['EN', 'ES', 'FR', 'AR', 'PT', 'KO'];

export default function Home() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-night-950 via-slate-900 to-night-950">
      <AmbientBackground />

      <div className="relative z-10 px-6 py-10 max-w-5xl mx-auto">
        {/* Nav bar */}
        <nav className="flex items-center justify-between mb-12">
          <WorldCupCrest />
          <div className="flex items-center gap-2.5 text-xs text-slate-300 card-glass px-3.5 py-2 rounded-full">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping-ring" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="uppercase tracking-widest">Live · MetLife Stadium</span>
          </div>
        </nav>

        {/* Hero — broadcast lower-third reveal */}
        <section className="mb-10">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-emerald-300 mb-3"
          >
            <RadioIcon size={16} className="text-emerald-400" />
            FIFA World Cup 2026 · Real-time crowd intelligence
          </motion.div>

          <h1 className="overflow-hidden leading-none pb-1">
            <motion.span
              className="block headline-display text-7xl sm:text-9xl"
              initial={reduceMotion ? false : { y: '105%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            >
              EchoStand
            </motion.span>
          </h1>

          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.45 }}
            className="text-slate-300 mt-5 max-w-2xl text-lg leading-relaxed"
          >
            80,000 fans, four hundred volunteers, dozens of staff — one shared nervous system.
            EchoStand fuses tens of thousands of noisy multilingual reports into one trusted live
            picture, then speaks it back to each audience in their own language.
          </motion.p>
        </section>

        {/* Live ticker */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="mb-12 rounded-2xl overflow-hidden shadow-lg"
        >
          <StatsTicker />
        </motion.div>

        {/* Roles — pick your side of the stadium */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.09, delayChildren: 0.65 } },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12"
        >
          {roles.map((r) => (
            <motion.div
              key={r.href}
              variants={{
                hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
                },
              }}
              whileHover={reduceMotion ? undefined : { y: -6 }}
              whileTap={{ scale: 0.985 }}
            >
              <Link
                href={r.href}
                className={`block p-6 rounded-2xl border-2 ${r.border} bg-gradient-to-br ${r.gradient} backdrop-blur transition-all duration-300 shadow-lg ${r.glow} relative overflow-hidden group cursor-pointer`}
              >
                {/* Floodlight sheen on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300"
                  style={{
                    background:
                      'radial-gradient(circle at 100% 0%, rgba(255,255,255,0.09), transparent 45%)',
                  }}
                />
                {/* A ball rolls across the touchline on hover */}
                <div className="absolute bottom-2 left-0 right-0 h-6 overflow-hidden">
                  <div className="absolute -left-8 bottom-0 transition-transform duration-[900ms] ease-out group-hover:translate-x-[560px] motion-reduce:transition-none">
                    <SoccerBall size={18} className="animate-ball-spin opacity-70" surface="#e2e8f0" panel="#1e293b" />
                  </div>
                </div>

                <div className="relative flex items-center gap-3 mb-2.5">
                  <span
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center ${r.chip} transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110`}
                  >
                    <r.Icon size={22} />
                  </span>
                  <span className="font-scoreboard text-3xl tracking-wide text-slate-50">
                    {r.title}
                  </span>
                  <ArrowRightIcon
                    size={20}
                    className="ml-auto text-slate-500 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-slate-200"
                  />
                </div>
                <div className="relative text-sm text-slate-300 pb-3">{r.desc}</div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer strip */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
          className="flex items-center gap-3 text-xs text-slate-500 flex-wrap"
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping-ring" />
            <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
          </span>
          <span>6 languages fused live</span>
          <span className="flex gap-1.5">
            {LANGS.map((l) => (
              <span
                key={l}
                className="px-2 py-0.5 rounded-md border border-slate-800 bg-slate-900/50 text-slate-400 tracking-widest"
              >
                {l}
              </span>
            ))}
          </span>
        </motion.div>
      </div>
    </main>
  );
}
