'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StaffLogin from '../../components/StaffLogin';
import PageBackdrop from '../../components/PageBackdrop';
import RoleHeader from '../../components/RoleHeader';
import { ArrowLeftIcon } from '../../components/icons';
import {
  Me,
  listScenarios,
  logout,
  me as fetchMe,
  runScenario,
  simulatorInject,
  simulatorStatus,
  stopScenario,
} from '../../lib/api';

type Scenario = { name: string; description: string | null; steps: number };
type Status = Awaited<ReturnType<typeof simulatorStatus>>;

const KINDS = [
  'fan_report',
  'volunteer_report',
  'volunteer_confirm',
  'volunteer_deny',
  'staff_report',
  'staff_state_set',
  'passive_signal',
];

export default function ControlPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [injectKind, setInjectKind] = useState(KINDS[0]);
  const [injectPayload, setInjectPayload] = useState(
    JSON.stringify(
      { persona: 'demo', language: 'en', category: 'spill', node_id: 'restroom_112', text: 'sample' },
      null,
      2
    )
  );

  const refresh = useCallback(async () => {
    try {
      const s = await simulatorStatus();
      setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'organizer' || u.role === 'staff')) setMe(u);
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    listScenarios().then(setScenarios).catch(() => setScenarios([]));
    refresh();
    const iv = setInterval(refresh, 2000);
    return () => clearInterval(iv);
  }, [me, refresh]);

  async function onRun(name: string) {
    try {
      await runScenario(name);
      setFlash({ kind: 'ok', msg: `Started ${name}` });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }
  async function onStop() {
    try {
      const r = await stopScenario();
      setFlash({ kind: 'ok', msg: (r as any)?.stopped ? 'Stopped.' : 'Nothing was running.' });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }
  async function onInject() {
    try {
      const payload = JSON.parse(injectPayload);
      const r = await simulatorInject(injectKind, payload);
      setFlash({ kind: 'ok', msg: `Injected ${injectKind}: ${JSON.stringify((r as any).result).slice(0, 120)}` });
    } catch (e: any) {
      setFlash({ kind: 'err', msg: `bad payload / call: ${e.message}` });
    }
  }

  if (!me) {
    return (
      <main className="min-h-screen p-6">
        <PageBackdrop accent="cyan" />
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-300 transition">
          <ArrowLeftIcon size={14} /> matchday home
        </Link>
        <StaffLogin onLogin={setMe} role="staff" />
      </main>
    );
  }

  const running = status?.running;

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <PageBackdrop accent="cyan" />
      <RoleHeader
        title="Operations Panel"
        gradient="from-cyan-300 to-emerald-400"
        subtitle={
          <>
            {me.display_name} · training scenarios &amp; live incident injection
          </>
        }
        right={
          <button
            onClick={() => {
              logout();
              setMe(null);
            }}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500 transition cursor-pointer"
          >
            Sign out
          </button>
        }
      />

      {flash && (
        <div
          className={`mb-3 p-2 text-xs rounded ${
            flash.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
          }`}
        >
          {flash.msg}
        </div>
      )}

      <section className="mb-6">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Training scenarios</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scenarios.map((s) => (
            <div key={s.name} className="p-4 rounded border border-slate-800 bg-slate-900/40">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-slate-500 mt-1 mb-3">
                {s.description || `${s.steps} steps`}
              </div>
              <button
                onClick={() => onRun(s.name)}
                disabled={running}
                className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                Run
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Status</div>
            <div className="text-sm mt-1">
              {running ? (
                <span className="text-emerald-300">
                  ▶ {status?.scenario_name} — step {status?.steps_completed} / {status?.steps_total}
                </span>
              ) : (
                <span className="text-slate-500">
                  idle
                  {status?.scenario_name ? ` · last: ${status.scenario_name}` : ''}
                </span>
              )}
            </div>
            {status?.last_error && (
              <div className="text-xs text-red-400 mt-1">last error: {status.last_error}</div>
            )}
          </div>
          <button
            onClick={onStop}
            className="text-xs px-3 py-1.5 rounded bg-red-800/60 hover:bg-red-700/60 text-white"
          >
            Stop
          </button>
        </div>
        {status?.log && status.log.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
              step log (last {status.log.length})
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto text-xs font-mono text-slate-400 space-y-1">
              {status.log.map((entry, i) => (
                <div key={i} className="border-b border-slate-800 pb-1">
                  {JSON.stringify(entry)}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Inject one step
        </div>
        <div className="p-4 rounded border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-3">
            <select
              value={injectKind}
              onChange={(e) => setInjectKind(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              onClick={onInject}
              className="text-sm px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
            >
              Inject →
            </button>
          </div>
          <textarea
            value={injectPayload}
            onChange={(e) => setInjectPayload(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono"
          />
          <div className="mt-2 text-[10px] text-slate-500">
            payload keys depend on kind — e.g. fan_report: &#123;persona, language, category, node_id, text&#125;; passive_signal:
            &#123;kind, node_id, value, metadata&#125;.
          </div>
        </div>
      </section>
    </main>
  );
}
