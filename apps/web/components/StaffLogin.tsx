'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Me, login } from '../lib/api';
import { ArrowRightIcon, WhistleIcon } from './icons';
import SoccerBall from './SoccerBall';

const STAFF_USERS = [
  { username: 'staff_ops', display: 'Operations Control', desc: 'Spills · gates · restrooms · wayfinding · crowd', role: 'staff' },
  { username: 'staff_medical', display: 'Medical Supervisor', desc: 'Medical dispatch and coordination', role: 'staff' },
  { username: 'staff_security', display: 'Security Lead', desc: 'Security · structural · evacuation', role: 'staff' },
  { username: 'organizer', display: 'Match Organizer', desc: 'Cross-category oversight and analytics', role: 'organizer' },
  { username: 'vol_north', display: 'Priya · North 100 volunteer', desc: 'Zone North · sections 100s', role: 'volunteer' },
  { username: 'vol_south', display: 'Diego · South 100 volunteer', desc: 'Zone South · sections 100s', role: 'volunteer' },
  { username: 'vol_mezz', display: 'Aisha · Mezzanine volunteer', desc: 'Zone Mezzanine · sections 200s', role: 'volunteer' },
];

type Props = {
  onLogin: (me: Me) => void;
  role?: 'staff' | 'organizer' | 'volunteer' | 'any';
};

export default function StaffLogin({ onLogin, role = 'staff' }: Props) {
  const reduceMotion = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [username, setUsername] = useState('');

  const shown =
    role === 'organizer'
      ? STAFF_USERS.filter((u) => u.role === 'organizer')
      : role === 'staff'
        ? STAFF_USERS.filter((u) => u.role === 'staff' || u.role === 'organizer')
        : role === 'volunteer'
          ? STAFF_USERS.filter((u) => u.role === 'volunteer' || u.role === 'staff')
          : STAFF_USERS;

  async function pick(u: string) {
    setBusy(u);
    setErr(null);
    try {
      const r = await login(u);
      onLogin(r.user);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!username) return;
    await pick(username.trim());
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-md mx-auto mt-10 p-6 rounded-2xl card-glass shadow-2xl relative overflow-hidden"
    >
      {/* Faint match ball watermark */}
      <div className="absolute -right-10 -top-10 opacity-[0.06] pointer-events-none">
        <SoccerBall size={160} surface="#e2e8f0" panel="#334155" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
            <WhistleIcon size={20} />
          </span>
          <h2 className="font-scoreboard text-3xl leading-none text-slate-50">Operator sign-in</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4 mt-2">
          Pick your role for this match — or type a specific username.
        </p>
        <div className="space-y-2 mb-4">
          {shown.map((u, i) => (
            <motion.button
              key={u.username}
              initial={reduceMotion ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => pick(u.username)}
              disabled={busy === u.username}
              className="w-full text-left p-3 rounded-xl border border-slate-700 hover:border-emerald-500/70 hover:bg-slate-800/40 transition disabled:opacity-50 group cursor-pointer flex items-center gap-3"
            >
              <div className="flex-1">
                <div className="font-medium text-slate-100">{u.display}</div>
                <div className="text-xs text-slate-500">{u.desc}</div>
              </div>
              <ArrowRightIcon
                size={16}
                className="text-slate-600 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-emerald-300"
              />
            </motion.button>
          ))}
        </div>
        <form onSubmit={submitCustom} className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="or type a username"
            aria-label="Username"
            className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            type="submit"
            disabled={!!busy}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm text-white font-medium transition disabled:opacity-50 cursor-pointer"
          >
            Sign in
          </button>
        </form>
        {err && (
          <div role="alert" className="mt-3 text-xs text-red-400">
            {err}
          </div>
        )}
      </div>
    </motion.div>
  );
}
