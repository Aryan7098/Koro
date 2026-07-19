'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const roles = [
  {
    href: '/fan',
    title: 'Fan',
    desc: 'One-tap report + live guidance in your language.',
    gradient: 'from-sky-500/20 to-cyan-500/10',
    border: 'border-sky-700 hover:border-sky-400',
    icon: '👥',
  },
  {
    href: '/volunteer',
    title: 'Volunteer',
    desc: 'Verify queue + do-this-say-this scripts.',
    gradient: 'from-emerald-500/20 to-teal-500/10',
    border: 'border-emerald-700 hover:border-emerald-400',
    icon: '🎽',
  },
  {
    href: '/staff',
    title: 'Staff',
    desc: 'Dispatch queue + Authorize queue for safety-critical events.',
    gradient: 'from-amber-500/20 to-orange-500/10',
    border: 'border-amber-700 hover:border-amber-400',
    icon: '🛠',
  },
  {
    href: '/organizer',
    title: 'Organizer',
    desc: 'Live venue map, metrics, and emergent patterns.',
    gradient: 'from-purple-500/20 to-fuchsia-500/10',
    border: 'border-purple-700 hover:border-purple-400',
    icon: '🎯',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl -z-0 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-0 animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="relative z-10 px-6 py-12 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-2">FIFA World Cup 2026 · MetLife</div>
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-white via-emerald-100 to-sky-300 bg-clip-text text-transparent leading-tight">
            EchoStand
          </h1>
          <p className="text-slate-300 mt-3 max-w-2xl text-lg">
            Fans, volunteers, staff, and organizers all report what they see. GenAI fuses tens of
            thousands of noisy multilingual reports into one trusted live picture — and speaks it
            back to each audience in their own language.
          </p>
          <p className="text-slate-500 text-sm mt-3">
            Pick a role to try, or head to the{' '}
            <Link href="/control" className="text-emerald-400 hover:text-emerald-300 underline">
              control panel
            </Link>{' '}
            to run the demo narrative.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {roles.map((r, i) => (
            <motion.div
              key={r.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              whileHover={{ y: -4 }}
            >
              <Link
                href={r.href}
                className={`block p-6 rounded-2xl border-2 ${r.border} bg-gradient-to-br ${r.gradient} backdrop-blur transition shadow-lg`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{r.icon}</span>
                  <div className="text-2xl font-semibold">{r.title}</div>
                </div>
                <div className="text-sm text-slate-300">{r.desc}</div>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur mb-8"
        >
          <div className="text-sm font-semibold mb-2 text-emerald-300">Fastest way to see the loop</div>
          <ol className="list-decimal ml-5 text-sm text-slate-300 space-y-1.5">
            <li>Open <Link href="/fan" className="text-emerald-400 underline">/fan</Link> in one tab, pick a language flag top-right.</li>
            <li>Open <Link href="/staff" className="text-emerald-400 underline">/staff</Link> in another tab as <code className="text-slate-100 bg-slate-800 px-1 rounded">Ops Control</code>.</li>
            <li>Open <Link href="/control" className="text-emerald-400 underline">/control</Link> as <code className="text-slate-100 bg-slate-800 px-1 rounded">Match Organizer</code> and run <code className="text-slate-100 bg-slate-800 px-1 rounded">demo_full_narrative</code>.</li>
            <li>Watch the rumor → probable → confirmed progression, the multilingual nudges, the wheelchair-safe reroute, and the safety-critical event landing in the Authorize queue.</li>
          </ol>
        </motion.section>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live · Languages: EN · ES · FR · AR · PT · KO ·{' '}
          <span className="text-slate-600">v1 · all 13 milestones landed</span>
        </div>
      </div>
    </main>
  );
}
