'use client';

import { useState } from 'react';
import { Me, login } from '../lib/api';

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
    <div className="max-w-md mx-auto mt-10 p-6 rounded-2xl border border-slate-700 bg-slate-900/60 backdrop-blur shadow-2xl">
      <h2 className="text-xl font-semibold mb-1">Operator sign-in</h2>
      <p className="text-xs text-slate-400 mb-4">
        Pick your role for this match — or type a specific username.
      </p>
      <div className="space-y-2 mb-4">
        {shown.map((u) => (
          <button
            key={u.username}
            onClick={() => pick(u.username)}
            disabled={busy === u.username}
            className="w-full text-left p-3 rounded border border-slate-700 hover:border-slate-500 transition disabled:opacity-50"
          >
            <div className="font-medium">{u.display}</div>
            <div className="text-xs text-slate-500">{u.desc}</div>
          </button>
        ))}
      </div>
      <form onSubmit={submitCustom} className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="or type a username"
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!!busy}
          className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm"
        >
          Sign in
        </button>
      </form>
      {err && <div className="mt-3 text-xs text-red-400">{err}</div>}
    </div>
  );
}
