'use client';

import { useState } from 'react';
import { Me, login } from '../lib/api';

// Seeded operational personas.
const STAFF_USERS = [
  { username: 'staff_ops', display: 'Ops Control', desc: 'spills, gates, restrooms, wayfinding, crowd', role: 'staff' },
  { username: 'staff_medical', display: 'Medical Supervisor', desc: 'medical only', role: 'staff' },
  { username: 'staff_security', display: 'Security Lead', desc: 'security, structural', role: 'staff' },
  { username: 'organizer', display: 'Match Organizer', desc: 'observes all categories', role: 'organizer' },
  { username: 'vol_north', display: 'Priya (Volunteer)', desc: 'zone: north 100', role: 'volunteer' },
  { username: 'vol_south', display: 'Diego (Volunteer)', desc: 'zone: south 100', role: 'volunteer' },
  { username: 'vol_mezz', display: 'Aisha (Volunteer)', desc: 'zone: mezzanine 200', role: 'volunteer' },
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
    <div className="max-w-md mx-auto mt-10 p-6 rounded-lg border border-slate-700 bg-slate-900/40">
      <h2 className="text-lg font-semibold mb-1">Sign in</h2>
      <p className="text-xs text-slate-500 mb-4">
        Hackathon shortcut — no passwords. Pick a seeded user or type a username.
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
