'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import AmbientBackground from '../components/AmbientBackground';
import StatsTicker from '../components/StatsTicker';

// A stylized crest we draw ourselves so we don't touch FIFA's trademarks.
// Two globes over a soccer ball, the "26" year mark, and the venue name.
function WorldCupCrest() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 shadow-lg shadow-emerald-500/40 flex items-center justify-center animate-shine">
        <span className="text-2xl">🏆</span>
      </div>
      <div className="leading-none">
        <div className="text-xs uppercase tracking-[0.4em] text-emerald-300 font-semibold">
          World Cup
        </div>
        <div className="text-3xl font-black bg-gradient-to-r from-white via-emerald-100 to-sky-300 bg-clip-text text-transparent">
          '26
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
    gradient: 'from-sky-500/25 to-cyan-500/10',
    border: 'border-sky-700 hover:border-sky-400',
    icon: '👥',
  },
  {
    href: '/volunteer',
    title: 'Volunteer',
    desc: 'Verify reports. Complete dispatched tasks. Submit evidence.',
    gradient: 'from-emerald-500/25 to-teal-500/10',
    border: 'border-emerald-700 hover:border-emerald-400',
    icon: '🎽',
  },
  {
    href: '/staff',
    title: 'Staff',
    desc: 'Dispatch. Authorize safety-critical events. Verify + notify fans.',
    gradient: 'from-amber-500/25 to-orange-500/10',
    border: 'border-amber-700 hover:border-amber-400',
    icon: '🛠',
  },
  {
    href: '/organizer',
    title: 'Organizer',
    desc: 'Live venue map. Metrics. Emergent patterns across the match.',
    gradient: 'from-purple-500/25 to-fuchsia-500/10',
    border: 'border-purple-700 hover:border-purple-400',
    icon: '🎯',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <AmbientBackground />

      <div className="relative z-10 px-6 py-10 max-w-5xl mx-auto">
        {/* Nav bar */}
        <nav className="flex items-center justify-between mb-10">
          <WorldCupCrest />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase tracking-widest">Live · MetLife Stadium</span>
          </div>
        </nav>

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="text-xs uppercase tracking-[0.35em] text-emerald-300 mb-2">
            FIFA World Cup 2026 · Real-time crowd intelligence
          </div>
          <h1 className="text-5xl sm:text-7xl font-black bg-gradient-to-r from-white via-emerald-100 to-sky-300 bg-clip-text text-transparent leading-none">
            EchoStand
          </h1>
          <p className="text-slate-300 mt-4 max-w-2xl text-lg leading-relaxed">
            80,000 fans, four hundred volunteers, dozens of staff — one shared nervous system.
            EchoStand fuses tens of thousands of noisy multilingual reports into one trusted live
            picture, then speaks it back to each audience in their own language.
          </p>
        </motion.section>

        {/* Live ticker */}
        <div className="mb-10 rounded-2xl overflow-hidden shadow-lg">
          <StatsTicker />
        </div>

        {/* Roles */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10"
        >
          {roles.map((r) => (
            <motion.div
              key={r.href}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
              }}
              whileHover={{ y: -6, scale: 1.01 }}
            >
              <Link
                href={r.href}
                className={`block p-6 rounded-2xl border-2 ${r.border} bg-gradient-to-br ${r.gradient} backdrop-blur transition shadow-lg relative overflow-hidden group`}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition"
                  style={{
                    background:
                      'radial-gradient(circle at 100% 0%, rgba(255,255,255,0.08), transparent 40%)',
                  }}
                />
                <div className="relative flex items-center gap-3 mb-2">
                  <span className="text-3xl">{r.icon}</span>
                  <div className="text-2xl font-semibold">{r.title}</div>
                </div>
                <div className="relative text-sm text-slate-300">{r.desc}</div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          6 languages fused live · EN · ES · FR · AR · PT · KO
        </div>
      </div>
    </main>
  );
}
