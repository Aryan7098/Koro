'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StaffLogin from '../../components/StaffLogin';
import EvidencePanel from '../../components/EvidencePanel';
import {
  Me,
  VolunteerScript,
  VolunteerTask,
  logout,
  me as fetchMe,
  volunteerConfirm,
  volunteerDeny,
  volunteerEventSource,
  volunteerScripts,
  volunteerTasks,
} from '../../lib/api';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-700/40 text-red-200 border-red-500',
  HIGH: 'bg-orange-700/40 text-orange-200 border-orange-500',
  MED: 'bg-yellow-700/40 text-yellow-200 border-yellow-600',
  LOW: 'bg-slate-700/40 text-slate-300 border-slate-600',
};

const BAND_COLOR: Record<string, string> = {
  CONFIRMED: 'bg-emerald-700/40 text-emerald-200',
  PROBABLE: 'bg-amber-700/40 text-amber-200',
  RUMOR: 'bg-slate-700/40 text-slate-300',
};

export default function VolunteerPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [scripts, setScripts] = useState<VolunteerScript[]>([]);
  const [drilling, setDrilling] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([volunteerTasks(), volunteerScripts()]);
      setTasks(t);
      setScripts(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'volunteer' || u.role === 'staff')) setMe(u);
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const iv = setInterval(refresh, 6000);
    const es = volunteerEventSource(me.id);
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.type === 'volunteer.script' && parsed.data) {
          setScripts((cur) => [parsed.data as VolunteerScript, ...cur].slice(0, 30));
        }
      } catch {}
      refresh();
    });
    return () => {
      clearInterval(iv);
      es.close();
    };
  }, [me, refresh]);

  async function onConfirm(eventId: string) {
    const note = window.prompt('Optional note (what did you see?):', '');
    try {
      await volunteerConfirm(eventId, note || undefined);
      setFlash({ kind: 'ok', msg: 'Confirmed. Confidence will re-score on the next fusion tick.' });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }
  async function onDeny(eventId: string) {
    const note = window.prompt('Why deny? (required)', '');
    if (!note) return;
    try {
      await volunteerDeny(eventId, note);
      setFlash({ kind: 'ok', msg: 'Denied. Confidence will drop.' });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }

  if (!me) {
    return (
      <main className="min-h-screen p-6">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← back
        </Link>
        <StaffLogin onLogin={setMe} role="volunteer" />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back
          </Link>
          <h1 className="text-2xl font-bold">Volunteer</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · {me.zone ? `zone: ${me.zone}` : 'all zones'}
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            setMe(null);
          }}
          className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500"
        >
          Sign out
        </button>
      </header>

      {flash && (
        <div
          className={`mb-3 p-2 text-xs rounded ${
            flash.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
          }`}
        >
          {flash.msg}
        </div>
      )}

      <section className="mb-8">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Verify queue ({tasks.length})
        </div>
        {!tasks.length && (
          <div className="text-sm text-slate-500 mt-2">
            Nothing to verify. When a rumor or probable event lands in your zone, it will show up
            here so you can walk over and confirm.
          </div>
        )}
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="p-4 rounded border border-slate-800 bg-slate-900/40">
              <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
                <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[t.severity] || ''}`}>
                  {t.severity}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded ${BAND_COLOR[t.confidence_band] || ''}`}
                >
                  {t.confidence_band}
                </span>
                <span className="text-slate-400">{t.category}</span>
                <span className="text-slate-500">· {t.node_id}</span>
                <span className="ml-auto text-slate-500">
                  {t.distinct_observers.toLocaleString()} observer(s)
                </span>
              </div>
              <div className="text-sm mb-3">
                {t.canonical_summary || <i className="text-slate-500">no summary yet</i>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onConfirm(t.id)}
                  className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                >
                  ✓ Confirm
                </button>
                <button
                  onClick={() => onDeny(t.id)}
                  className="text-sm px-3 py-1.5 rounded bg-red-800/60 hover:bg-red-700/60 text-white"
                >
                  ✗ Deny
                </button>
                <button
                  onClick={() => setDrilling(t.id)}
                  className="text-sm px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500"
                >
                  view raw reports
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Live scripts</div>
        {!scripts.length && (
          <div className="text-sm text-slate-500 mt-2">
            No scripts yet. Do-this-say-this scripts arrive here when the fusion pipeline dispatches
            events in your zone.
          </div>
        )}
        <div className="space-y-3">
          {scripts.map((s, i) => (
            <div
              key={`${s.event_id}-${i}`}
              className="p-4 rounded border border-slate-800 bg-slate-900/40"
            >
              <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
                <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[s.severity] || ''}`}>
                  {s.severity}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[s.band] || ''}`}>{s.band}</span>
                <span className="text-slate-400">{s.category}</span>
                <span className="text-slate-500">· {s.node_id}</span>
                {s.needs_verification && (
                  <span className="ml-auto text-amber-400">verify request</span>
                )}
              </div>
              {s.verify_prompt && (
                <div className="text-sm text-amber-300 mb-2">
                  <strong>Verify:</strong> {s.verify_prompt}
                </div>
              )}
              <div className="text-sm font-medium mb-1">Do</div>
              <ol className="list-decimal ml-5 text-sm text-slate-300 mb-3 space-y-0.5">
                {(s.do || []).map((d, j) => (
                  <li key={j}>{d}</li>
                ))}
              </ol>
              {s.say && (
                <div className="p-3 rounded bg-slate-950/60 border border-slate-800 text-sm italic">
                  “{s.say}”
                </div>
              )}
              <button
                onClick={() => setDrilling(s.event_id)}
                className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline"
              >
                view evidence
              </button>
            </div>
          ))}
        </div>
      </section>

      {drilling && <EvidencePanel eventId={drilling} onClose={() => setDrilling(null)} />}
    </main>
  );
}
