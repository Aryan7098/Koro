'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StaffLogin from '../../components/StaffLogin';
import EvidencePanel from '../../components/EvidencePanel';
import {
  Me,
  PendingAuth,
  StaffEvent,
  approveAuth,
  denyAuth,
  logout,
  me as fetchMe,
  resolveEvent,
  staffAuthorizeQueue,
  staffEventSource,
  staffQueue,
  staffResolveQueue,
} from '../../lib/api';

type Tab = 'queue' | 'authorize' | 'resolve';

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

export default function StaffPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<StaffEvent[]>([]);
  const [auths, setAuths] = useState<PendingAuth[]>([]);
  const [resolveable, setResolveable] = useState<StaffEvent[]>([]);
  const [drilling, setDrilling] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [q, a, r] = await Promise.all([staffQueue(), staffAuthorizeQueue(), staffResolveQueue()]);
      setQueue(q);
      setAuths(a);
      setResolveable(r);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'staff' || u.role === 'organizer')) {
        setMe(u);
      }
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const iv = setInterval(refresh, 6000);
    const es = staffEventSource(me.id);
    es.addEventListener('message', () => refresh());
    return () => {
      clearInterval(iv);
      es.close();
    };
  }, [me, refresh]);

  async function onApprove(authId: string) {
    const reason = window.prompt('Optional note for the ledger:', '');
    try {
      await approveAuth(authId, reason || undefined);
      setFlash({ kind: 'ok', msg: 'Approved — dispatch fired.' });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }
  async function onDeny(authId: string) {
    const reason = window.prompt('Why are you denying? (required)', '');
    if (!reason) return;
    try {
      await denyAuth(authId, reason);
      setFlash({ kind: 'ok', msg: 'Denied and dismissed.' });
      refresh();
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message });
    }
  }
  async function onResolve(eventId: string) {
    const reason = window.prompt('Resolution note (optional):', 'complete');
    try {
      await resolveEvent(eventId, reason || undefined);
      setFlash({ kind: 'ok', msg: 'Resolved.' });
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
        <StaffLogin onLogin={setMe} role="staff" />
      </main>
    );
  }

  const authCount = auths.length;
  const criticalCount = auths.filter((a) => a.event.severity === 'CRITICAL').length;

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back
          </Link>
          <h1 className="text-2xl font-bold">Staff</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · owns{' '}
            {me.category_ownership?.length ? me.category_ownership.join(', ') : 'all categories'}
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

      <nav className="flex gap-1 mb-4 border-b border-slate-800">
        {(['queue', 'authorize', 'resolve'] as Tab[]).map((t) => {
          const active = t === tab;
          const badge = t === 'authorize' ? authCount : t === 'queue' ? queue.length : resolveable.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition ${
                active
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
              {badge > 0 && (
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                    t === 'authorize' && criticalCount > 0
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {flash && (
        <div
          className={`mb-3 p-2 text-xs rounded ${
            flash.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
          }`}
        >
          {flash.msg}
        </div>
      )}

      {tab === 'queue' && (
        <QueueList events={queue} onDrill={setDrilling} />
      )}
      {tab === 'authorize' && (
        <AuthorizeList
          auths={auths}
          onApprove={onApprove}
          onDeny={onDeny}
          onDrill={setDrilling}
        />
      )}
      {tab === 'resolve' && (
        <ResolveList events={resolveable} onResolve={onResolve} onDrill={setDrilling} />
      )}

      {drilling && <EvidencePanel eventId={drilling} onClose={() => setDrilling(null)} />}
    </main>
  );
}

// ---------- sub-components -----------------------------------------------

function EventRow({
  event,
  children,
  onDrill,
}: {
  event: StaffEvent;
  children?: React.ReactNode;
  onDrill: (id: string) => void;
}) {
  return (
    <div className="p-4 rounded border border-slate-800 bg-slate-900/40">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
        <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[event.severity] || ''}`}>
          {event.severity}
        </span>
        <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[event.confidence_band] || ''}`}>
          {event.confidence_band}
        </span>
        <span className="text-slate-400">{event.category}</span>
        <span className="text-slate-500">· {event.node_id}</span>
        <span className="ml-auto text-slate-500">
          {event.distinct_observers.toLocaleString()} observer(s) ·
          score {event.confidence_score.toFixed(1)}
        </span>
      </div>
      <div className="text-sm">{event.canonical_summary || <i className="text-slate-500">no summary yet</i>}</div>
      <div className="mt-2 flex gap-2 flex-wrap">
        <button
          onClick={() => onDrill(event.id)}
          className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
        >
          view evidence
        </button>
        {children}
      </div>
    </div>
  );
}

function QueueList({
  events,
  onDrill,
}: {
  events: StaffEvent[];
  onDrill: (id: string) => void;
}) {
  if (!events.length) {
    return <div className="text-sm text-slate-500 mt-6">Nothing in the queue.</div>;
  }
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <EventRow key={e.id} event={e} onDrill={onDrill} />
      ))}
    </div>
  );
}

function AuthorizeList({
  auths,
  onApprove,
  onDeny,
  onDrill,
}: {
  auths: PendingAuth[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onDrill: (id: string) => void;
}) {
  if (!auths.length) {
    return (
      <div className="text-sm text-slate-500 mt-6">
        No pending authorizations. Safety-critical events auto-surface here even at Rumor
        confidence.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {auths.map((a) => (
        <div
          key={a.auth_id}
          className={`rounded border-2 ${
            a.event.severity === 'CRITICAL'
              ? 'border-red-600 bg-red-950/20'
              : a.event.severity === 'HIGH'
                ? 'border-orange-600 bg-orange-950/20'
                : 'border-slate-700 bg-slate-900/40'
          } p-4`}
        >
          <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
            <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[a.event.severity] || ''}`}>
              {a.event.severity}
            </span>
            <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[a.event.confidence_band] || ''}`}>
              {a.event.confidence_band}
            </span>
            <span className="text-slate-400">{a.event.category}</span>
            <span className="text-slate-500">· {a.event.node_id}</span>
            <span className="ml-auto text-slate-500">
              proposed: {String((a.proposed_action as any)?.kind || 'action')}
            </span>
          </div>
          <div className="text-sm mb-2">
            {a.event.canonical_summary || <i className="text-slate-500">no summary</i>}
          </div>
          {a.event.severity_reason && (
            <div className="text-xs text-slate-400 italic mb-3">
              severity reasoning: {a.event.severity_reason}
            </div>
          )}
          <div className="text-xs text-slate-500 mb-3">
            {a.event.distinct_observers.toLocaleString()} observer(s) ·
            source mix: {JSON.stringify(a.event.source_mix)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onApprove(a.auth_id)}
              className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
            >
              Approve → dispatch
            </button>
            <button
              onClick={() => onDeny(a.auth_id)}
              className="text-sm px-3 py-1.5 rounded bg-red-800/60 hover:bg-red-700/60 text-white"
            >
              Deny / dismiss
            </button>
            <button
              onClick={() => onDrill(a.event.id)}
              className="text-sm px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500"
            >
              View evidence
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResolveList({
  events,
  onResolve,
  onDrill,
}: {
  events: StaffEvent[];
  onResolve: (id: string) => void;
  onDrill: (id: string) => void;
}) {
  if (!events.length) {
    return <div className="text-sm text-slate-500 mt-6">Nothing awaiting resolution.</div>;
  }
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <EventRow key={e.id} event={e} onDrill={onDrill}>
          <button
            onClick={() => onResolve(e.id)}
            className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            Mark resolved
          </button>
        </EventRow>
      ))}
    </div>
  );
}
