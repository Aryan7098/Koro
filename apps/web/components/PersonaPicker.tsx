'use client';

import { useState } from 'react';
import { Me, login, logout } from '../lib/api';

// Seeded demo personas — kept in sync with app/api/app/seed/load_all.py.
// Order matters: each language appears once so the demo shows the multi-lingual
// beat by rotating through personas.
const PERSONAS: {
  username: string;
  display: string;
  lang: string;
  accessibility: string;
  home: string;
}[] = [
  { username: 'fan_maria', display: 'María', lang: 'es', accessibility: '—', home: 'Section 112' },
  { username: 'fan_wei', display: 'Wei', lang: 'ko', accessibility: '—', home: 'Section 119' },
  { username: 'fan_jamil', display: 'Jamil', lang: 'ar', accessibility: 'mobility', home: 'Section 112' },
  { username: 'fan_ana', display: 'Ana', lang: 'pt', accessibility: 'sensory', home: 'Section 212' },
  { username: 'fan_luc', display: 'Luc', lang: 'fr', accessibility: '—', home: 'Section 324' },
];

type Props = {
  me: Me | null;
  onChange: (me: Me | null) => void;
};

export default function PersonaPicker({ me, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(username: string) {
    setBusy(username);
    setErr(null);
    try {
      const r = await login(username);
      onChange(r.user);
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  function goAnon() {
    logout();
    onChange(null);
    setOpen(false);
  }

  const currentLabel = me
    ? `${me.display_name || me.username} · ${me.language}${
        me.accessibility_profile?.mobility ? ' · ♿' : ''
      }${me.accessibility_profile?.sensory ? ' · 🎧' : ''}`
    : 'Anonymous';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500 bg-slate-800/50"
      >
        {currentLabel}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-30 p-2">
          <div className="text-xs text-slate-500 px-2 pt-1 pb-2">
            Log in as a seeded demo fan, or stay anonymous. Choosing a persona also
            enables receiving personalized nudges — anonymous fans can report but
            don't receive per-user nudges in v1.
          </div>
          <button
            onClick={goAnon}
            className={`w-full text-left px-3 py-2 rounded hover:bg-slate-800 ${
              !me ? 'bg-slate-800' : ''
            }`}
          >
            <div className="font-medium">Anonymous</div>
            <div className="text-xs text-slate-500">device-fingerprint session</div>
          </button>
          {PERSONAS.map((p) => (
            <button
              key={p.username}
              onClick={() => pick(p.username)}
              disabled={busy === p.username}
              className={`w-full text-left px-3 py-2 rounded hover:bg-slate-800 ${
                me?.username === p.username ? 'bg-slate-800' : ''
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{p.display}</div>
                <div className="text-xs text-slate-500">{p.lang}</div>
              </div>
              <div className="text-xs text-slate-500">
                {p.home} · {p.accessibility}
              </div>
            </button>
          ))}
          {err && (
            <div className="text-xs text-red-400 mt-2 px-2">{err}</div>
          )}
        </div>
      )}
    </div>
  );
}
