'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import StaffLogin from '../../components/StaffLogin';
import StadiumMap from '../../components/StadiumMap';
import EvidencePanel from '../../components/EvidencePanel';
import {
  Me,
  OrganizerLive,
  OrganizerMetrics,
  Pattern,
  logout,
  me as fetchMe,
  organizerEventSource,
  organizerLive,
  organizerMetrics,
  organizerPatterns,
} from '../../lib/api';

export default function OrganizerPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [metrics, setMetrics] = useState<OrganizerMetrics | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [live, setLive] = useState<OrganizerLive | null>(null);
  const [drilling, setDrilling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, p, l] = await Promise.all([
        organizerMetrics(),
        organizerPatterns(),
        organizerLive(),
      ]);
      setMetrics(m);
      setPatterns(p);
      setLive(l);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'organizer' || u.role === 'staff')) setMe(u);
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const iv = setInterval(refresh, 6000);
    const es = organizerEventSource();
    es.addEventListener('message', () => refresh());
    return () => {
      clearInterval(iv);
      es.close();
    };
  }, [me, refresh]);

  if (!me) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400">← back</Link>
        <StaffLogin onLogin={setMe} role="organizer" />
      </main>
    );
  }

  const nodesById = new Map((live?.nodes || []).map((n) => [n.id, n]));

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400 transition">
            ← back
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-fuchsia-400 bg-clip-text text-transparent">
            Organizer
          </h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · MetLife Stadium · live
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/control"
            className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-emerald-500 transition"
          >
            control panel
          </Link>
          <button
            onClick={() => { logout(); setMe(null); }}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mb-6">
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile label="Events (6h)" value={metrics.events_seen} icon="📊" />
            <MetricTile label="Open now" value={metrics.events_open} tone="warn" icon="⚡" />
            <MetricTile
              label="Pending auth"
              value={metrics.pending_authorizations}
              tone={metrics.pending_authorizations > 0 ? 'critical' : 'default'}
              icon="🔐"
              pulse={metrics.pending_authorizations > 0}
            />
            <MetricTile label="Resolved" value={metrics.events_resolved} tone="ok" icon="✓" />
            <MetricTile
              label="Avg. time-to-confirmed"
              value={
                metrics.avg_time_to_confirmed_seconds != null
                  ? `${Math.round(metrics.avg_time_to_confirmed_seconds)}s`
                  : '—'
              }
              icon="⏱"
            />
            <MetricTile
              label="Loop closures sent"
              value={metrics.loop_closure_notifications}
              icon="💬"
            />
            <MetricTile
              label="Manipulation suppressed"
              value={metrics.manipulation_suppressed}
              tone="ok"
              icon="🛡"
            />
            <MetricTile label="Dismissed" value={metrics.events_dismissed} icon="✕" />
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span>Live venue map</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        {live && <StadiumMap data={live} onSelect={setDrilling} />}
        {!live && <div className="text-sm text-slate-500">Loading…</div>}

        {/* Below the map: readable event list */}
        {live && live.events.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence initial={false}>
              {live.events.slice(0, 8).map((e) => (
                <motion.button
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDrilling(e.id)}
                  className="text-left p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:border-emerald-500 hover:bg-slate-900/70 transition"
                >
                  <div className="flex items-baseline gap-2 text-xs text-slate-400 mb-1">
                    <SeverityChip severity={e.severity} />
                    <BandChip band={e.confidence_band} />
                    <span>{e.category}</span>
                    <span className="ml-auto text-slate-500">
                      {e.distinct_observers.toLocaleString()} reporter(s)
                    </span>
                  </div>
                  <div className="text-sm text-slate-200">
                    📍 {nodesById.get(e.node_id)?.name || e.node_id}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {e.canonical_summary || <i>no summary yet</i>}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
          Patterns (last 6h)
        </div>
        {patterns.length === 0 && (
          <div className="text-sm text-slate-500 italic">
            No emergent patterns yet. Once events start clustering by (category × node), they show up here.
          </div>
        )}
        {patterns.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80">
                <tr className="text-xs text-slate-400 text-left">
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Node</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2 text-right">Confirmed</th>
                  <th className="px-3 py-2 text-right">Resolved</th>
                  <th className="px-3 py-2 text-right">Avg. sev</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map((p, i) => (
                  <tr key={`${p.category}-${p.node_id}-${i}`} className="border-t border-slate-800 hover:bg-slate-900/60">
                    <td className="px-3 py-2">{p.category}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {nodesById.get(p.node_id)?.name || p.node_id}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.count}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">{p.confirmed}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{p.resolved}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.avg_severity_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drilling && <EvidencePanel eventId={drilling} onClose={() => setDrilling(null)} />}
    </main>
  );
}

function MetricTile({
  label,
  value,
  tone = 'default',
  icon,
  pulse,
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'ok' | 'warn' | 'critical';
  icon?: string;
  pulse?: boolean;
}) {
  const border =
    tone === 'critical'
      ? 'border-red-500/50 shadow-red-500/20'
      : tone === 'warn'
        ? 'border-amber-500/50'
        : tone === 'ok'
          ? 'border-emerald-500/50'
          : 'border-slate-800';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`p-3 rounded-xl border ${border} bg-slate-900/60 shadow-lg relative overflow-hidden`}
    >
      {pulse && (
        <motion.div
          className="absolute inset-0 bg-red-500/10"
          animate={{ opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
      <div className="relative flex items-center gap-2 text-xs text-slate-400">
        {icon && <span className="text-base">{icon}</span>}
        {label}
      </div>
      <div className="relative text-2xl font-semibold mt-1 text-slate-100">{value}</div>
    </motion.div>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    CRITICAL: 'bg-red-700/50 text-red-100 border-red-500',
    HIGH: 'bg-orange-700/50 text-orange-100 border-orange-500',
    MED: 'bg-yellow-700/40 text-yellow-100 border-yellow-600',
    LOW: 'bg-slate-700/40 text-slate-300 border-slate-600',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${cls[severity] || cls.LOW}`}>
      {severity}
    </span>
  );
}

function BandChip({ band }: { band: string }) {
  const cls: Record<string, string> = {
    CONFIRMED: 'bg-emerald-700/40 text-emerald-200',
    PROBABLE: 'bg-amber-700/40 text-amber-200',
    RUMOR: 'bg-slate-700/40 text-slate-300',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls[band] || cls.RUMOR}`}>
      {band}
    </span>
  );
}
