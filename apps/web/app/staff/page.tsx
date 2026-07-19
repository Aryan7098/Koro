'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import StaffLogin from '../../components/StaffLogin';
import EvidencePanel from '../../components/EvidencePanel';
import {
  EventLineage,
  Me,
  PendingAuth,
  StaffEvent,
  VenueNode,
  approveAuth,
  denyAuth,
  dismissEvent,
  dispatchEvent,
  eventLineage,
  logout,
  me as fetchMe,
  resolveEvent,
  staffAuthorizeQueue,
  staffEventSource,
  staffQueue,
  staffResolveQueue,
  venueGraph,
} from '../../lib/api';

type Tab = 'queue' | 'authorize' | 'resolve';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-700/50 text-red-100 border-red-500',
  HIGH: 'bg-orange-700/50 text-orange-100 border-orange-500',
  MED: 'bg-yellow-700/40 text-yellow-100 border-yellow-600',
  LOW: 'bg-slate-700/40 text-slate-300 border-slate-600',
};

const BAND_COLOR: Record<string, string> = {
  CONFIRMED: 'bg-emerald-700/40 text-emerald-200',
  PROBABLE: 'bg-amber-700/40 text-amber-200',
  RUMOR: 'bg-slate-700/40 text-slate-300',
};

// Small in-memory cache of lineage results per event, so we can show a
// "reporters" line without the drill-down modal.
async function fetchReporters(eventId: string): Promise<EventLineage | null> {
  try {
    return await eventLineage(eventId);
  } catch {
    return null;
  }
}

export default function StaffPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<StaffEvent[]>([]);
  const [auths, setAuths] = useState<PendingAuth[]>([]);
  const [resolveable, setResolveable] = useState<StaffEvent[]>([]);
  const [drilling, setDrilling] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [nodes, setNodes] = useState<VenueNode[]>([]);
  const [lineageCache, setLineageCache] = useState<Record<string, EventLineage>>({});

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const refresh = useCallback(async () => {
    try {
      const [q, a, r] = await Promise.all([staffQueue(), staffAuthorizeQueue(), staffResolveQueue()]);
      setQueue(q);
      setAuths(a);
      setResolveable(r);
      // Warm the lineage cache for all visible events so the reporter names show
      const ids = new Set<string>();
      q.forEach((e) => ids.add(e.id));
      a.forEach((x) => ids.add(x.event.id));
      r.forEach((e) => ids.add(e.id));
      const missing = [...ids].filter((id) => !lineageCache[id]);
      if (missing.length) {
        const results = await Promise.all(missing.map(fetchReporters));
        setLineageCache((cur) => {
          const next = { ...cur };
          missing.forEach((id, i) => { if (results[i]) next[id] = results[i]!; });
          return next;
        });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'staff' || u.role === 'organizer')) setMe(u);
    });
    venueGraph().then((g) => setNodes(g.nodes)).catch(() => {});
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
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onDeny(authId: string) {
    const reason = window.prompt('Why are you denying? (required)', '');
    if (!reason) return;
    try {
      await denyAuth(authId, reason);
      setFlash({ kind: 'ok', msg: 'Denied and dismissed.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onResolve(eventId: string) {
    const reason = window.prompt('Resolution note (optional):', 'complete');
    try {
      await resolveEvent(eventId, reason || undefined);
      setFlash({ kind: 'ok', msg: 'Resolved — reporters notified in their languages.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onDispatch(eventId: string) {
    const reason = window.prompt('Dispatch note (optional):', '');
    try {
      await dispatchEvent(eventId, reason || undefined);
      setFlash({ kind: 'ok', msg: 'Dispatched — volunteers + fan nudges fired.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onDismiss(eventId: string) {
    const reason = window.prompt('Why dismiss? (required)', '');
    if (!reason) return;
    try {
      await dismissEvent(eventId, reason);
      setFlash({ kind: 'ok', msg: 'Dismissed.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400">← back</Link>
        <StaffLogin onLogin={setMe} role="staff" />
      </main>
    );
  }

  const authCount = auths.length;
  const criticalCount = auths.filter((a) => a.event.severity === 'CRITICAL').length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400 transition">← back</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-300 to-red-400 bg-clip-text text-transparent">
            Staff
          </h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · owns{' '}
            {me.category_ownership?.length ? me.category_ownership.join(', ') : 'all categories'}
          </div>
        </div>
        <button
          onClick={() => { logout(); setMe(null); }}
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
                active ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
              {badge > 0 && (
                <motion.span
                  layout
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                    t === 'authorize' && criticalCount > 0
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {badge}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-3 p-2 text-xs rounded ${
              flash.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
            }`}
          >
            {flash.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {tab === 'queue' && (
        <QueueList
          events={queue}
          onDrill={setDrilling}
          nodesById={nodesById}
          lineage={lineageCache}
          onDispatch={onDispatch}
          onDismiss={onDismiss}
          onResolve={onResolve}
        />
      )}
      {tab === 'authorize' && (
        <AuthorizeList
          auths={auths}
          onApprove={onApprove}
          onDeny={onDeny}
          onDrill={setDrilling}
          nodesById={nodesById}
          lineage={lineageCache}
        />
      )}
      {tab === 'resolve' && (
        <ResolveList events={resolveable} onResolve={onResolve} onDrill={setDrilling} nodesById={nodesById} lineage={lineageCache} />
      )}

      {drilling && <EvidencePanel eventId={drilling} onClose={() => setDrilling(null)} />}
    </main>
  );
}

// ---------- sub-components ------------------------------------------------

function Reporters({ lineage }: { lineage: EventLineage | undefined }) {
  if (!lineage) return null;
  const reports = lineage.reports || [];
  if (!reports.length) return null;

  // Attribution summary
  const anonCount = reports.filter((r) => r.source === 'fan' && !r.source_user_id).length;
  const knownFans = reports.filter((r) => r.source === 'fan' && r.source_user_id).length;
  const volunteers = reports.filter((r) => r.source === 'volunteer').length;
  const staffCount = reports.filter((r) => r.source === 'staff').length;
  const parts: string[] = [];
  if (anonCount) parts.push(`${anonCount} anonymous fan${anonCount > 1 ? 's' : ''}`);
  if (knownFans) parts.push(`${knownFans} known fan${knownFans > 1 ? 's' : ''}`);
  if (volunteers) parts.push(`${volunteers} volunteer${volunteers > 1 ? 's' : ''}`);
  if (staffCount) parts.push(`${staffCount} staff`);
  const langs = Array.from(new Set(reports.map((r) => r.raw_language).filter(Boolean))) as string[];

  // Show up to 3 distinct raw texts as prominent quotes
  const texts: { text: string; lang: string | null }[] = [];
  for (const r of reports) {
    const t = r.raw_text || r.category_hint;
    if (!t) continue;
    if (texts.some((x) => x.text.toLowerCase() === t.toLowerCase())) continue;
    texts.push({ text: t, lang: r.raw_language });
    if (texts.length >= 3) break;
  }

  return (
    <div className="mt-3 space-y-2">
      {texts.length > 0 && (
        <div className="space-y-1.5">
          {texts.map((t, i) => (
            <div
              key={i}
              className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-sm text-slate-100"
            >
              {t.lang && (
                <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase align-middle">
                  {t.lang}
                </span>
              )}
              <span className="italic">&ldquo;{t.text}&rdquo;</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>👥 {parts.join(', ')}</span>
        {langs.length > 0 && <span>🌐 {langs.join(', ').toUpperCase()}</span>}
      </div>
    </div>
  );
}

function LocationLine({ nodeId, nodesById }: { nodeId: string; nodesById: Map<string, VenueNode> }) {
  const node = nodesById.get(nodeId);
  if (!node) return <span>{nodeId}</span>;
  return (
    <span>
      📍 <span className="text-slate-200 font-medium">{node.name}</span>
      <span className="text-slate-500"> · {node.type} · level {node.level}</span>
    </span>
  );
}

function EventRow({
  event, children, onDrill, nodesById, lineage,
}: {
  event: StaffEvent;
  children?: React.ReactNode;
  onDrill: (id: string) => void;
  nodesById: Map<string, VenueNode>;
  lineage: Record<string, EventLineage>;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 transition"
    >
      <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
        <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[event.severity] || ''}`}>{event.severity}</span>
        <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[event.confidence_band] || ''}`}>{event.confidence_band}</span>
        <span className="text-slate-400 uppercase tracking-wider">{event.category}</span>
        <span className="ml-auto text-slate-500">
          {event.distinct_observers.toLocaleString()} observer(s) · score {event.confidence_score.toFixed(1)}
        </span>
      </div>
      <div className="text-sm text-slate-400 mb-2">
        <LocationLine nodeId={event.node_id} nodesById={nodesById} />
      </div>
      <div className="text-sm">{event.canonical_summary || <i className="text-slate-500">no summary yet</i>}</div>
      <Reporters lineage={lineage[event.id]} />
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          onClick={() => onDrill(event.id)}
          className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-emerald-500 hover:text-emerald-300 transition"
        >
          view full evidence
        </button>
        {children}
      </div>
    </motion.div>
  );
}

function QueueList({
  events, onDrill, nodesById, lineage, onDispatch, onDismiss, onResolve,
}: {
  events: StaffEvent[]; onDrill: (id: string) => void;
  nodesById: Map<string, VenueNode>; lineage: Record<string, EventLineage>;
  onDispatch: (id: string) => void;
  onDismiss: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  if (!events.length) return <div className="text-sm text-slate-500 mt-6">Nothing in the queue.</div>;
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <EventRow key={e.id} event={e} onDrill={onDrill} nodesById={nodesById} lineage={lineage}>
            {e.status !== 'dispatched' && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onDispatch(e.id)}
                className="text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium"
              >
                🚀 Dispatch
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onResolve(e.id)}
              className="text-xs px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-medium"
            >
              ✓ Resolve
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onDismiss(e.id)}
              className="text-xs px-2.5 py-1 rounded bg-red-900/70 hover:bg-red-800/80 text-white"
            >
              ✕ Dismiss
            </motion.button>
          </EventRow>
        ))}
      </AnimatePresence>
    </div>
  );
}

function AuthorizeList({
  auths, onApprove, onDeny, onDrill, nodesById, lineage,
}: {
  auths: PendingAuth[]; onApprove: (id: string) => void; onDeny: (id: string) => void;
  onDrill: (id: string) => void; nodesById: Map<string, VenueNode>;
  lineage: Record<string, EventLineage>;
}) {
  if (!auths.length) {
    return (
      <div className="text-sm text-slate-500 mt-6 italic">
        No pending authorizations. Safety-critical events auto-surface here even at Rumor confidence.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {auths.map((a) => (
          <motion.div
            key={a.auth_id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl border-2 ${
              a.event.severity === 'CRITICAL'
                ? 'border-red-600 bg-red-950/20 shadow-lg shadow-red-900/30'
                : a.event.severity === 'HIGH'
                  ? 'border-orange-600 bg-orange-950/20'
                  : 'border-slate-700 bg-slate-900/40'
            } p-4 relative overflow-hidden`}
          >
            {a.event.severity === 'CRITICAL' && (
              <motion.div
                className="absolute inset-0 bg-red-500/10 pointer-events-none"
                animate={{ opacity: [0.05, 0.2, 0.05] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            )}
            <div className="relative">
              <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
                <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[a.event.severity] || ''}`}>
                  {a.event.severity}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[a.event.confidence_band] || ''}`}>
                  {a.event.confidence_band}
                </span>
                <span className="text-slate-400 uppercase tracking-wider">{a.event.category}</span>
                <span className="ml-auto text-slate-500">
                  proposed: {String((a.proposed_action as any)?.kind || 'action')}
                </span>
              </div>
              <div className="text-sm text-slate-400 mb-2">
                <LocationLine nodeId={a.event.node_id} nodesById={nodesById} />
              </div>
              <div className="text-sm mb-2">
                {a.event.canonical_summary || <i className="text-slate-500">no summary</i>}
              </div>
              {a.event.severity_reason && (
                <div className="text-xs text-slate-400 italic mb-3">
                  💭 severity reasoning: {a.event.severity_reason}
                </div>
              )}
              <Reporters lineage={lineage[a.event.id]} />
              <div className="text-xs text-slate-500 mt-3">
                Source mix: {JSON.stringify(a.event.source_mix)}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onApprove(a.auth_id)}
                  className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                >
                  ✓ Approve → dispatch
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onDeny(a.auth_id)}
                  className="text-sm px-3 py-1.5 rounded bg-red-800/60 hover:bg-red-700/60 text-white"
                >
                  ✕ Deny / dismiss
                </motion.button>
                <button
                  onClick={() => onDrill(a.event.id)}
                  className="text-sm px-3 py-1.5 rounded border border-slate-700 hover:border-emerald-500 hover:text-emerald-300"
                >
                  View evidence
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ResolveList({
  events, onResolve, onDrill, nodesById, lineage,
}: {
  events: StaffEvent[]; onResolve: (id: string) => void; onDrill: (id: string) => void;
  nodesById: Map<string, VenueNode>; lineage: Record<string, EventLineage>;
}) {
  if (!events.length) return <div className="text-sm text-slate-500 mt-6">Nothing awaiting resolution.</div>;
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          // A completion Report is a volunteer/staff report with confirm_value='complete'
          const completions = (lineage[e.id]?.reports || []).filter(
            (r) => r.confirm_value === 'complete'
          );
          const hasEvidence = completions.length > 0;
          return (
            <EventRow key={e.id} event={e} onDrill={onDrill} nodesById={nodesById} lineage={lineage}>
              {hasEvidence ? (
                <div className="w-full mt-2">
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/60 space-y-1">
                    <div className="text-xs text-emerald-300 font-medium">
                      ✓ Volunteer submitted completion evidence ({completions.length})
                    </div>
                    {completions.slice(0, 2).map((c) => (
                      <div key={c.id} className="text-sm text-slate-100 italic">
                        &ldquo;{c.raw_text}&rdquo;
                        <span className="text-xs text-slate-500 not-italic ml-2">
                          · {c.created_at?.slice(11, 19)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onResolve(e.id)}
                      className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium"
                    >
                      ✓ Verify &amp; notify fans
                    </motion.button>
                    <span className="text-xs text-slate-500 self-center">
                      → sends per-language "fixed, thanks" to every reporter
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full mt-2">
                  <div className="p-2.5 rounded-lg bg-slate-950/40 border border-amber-800/40 text-xs text-amber-300">
                    ⏳ Waiting for volunteer to submit completion evidence before you can notify fans.
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onResolve(e.id)}
                      className="text-xs px-2.5 py-1.5 rounded border border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
                      title="Skip volunteer evidence and resolve manually (staff override)"
                    >
                      resolve without evidence
                    </motion.button>
                  </div>
                </div>
              )}
            </EventRow>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
