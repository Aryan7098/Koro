'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StaffLogin from '../../components/StaffLogin';
import VenueMap from '../../components/VenueMap';
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
      <main className="min-h-screen p-6">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← back
        </Link>
        <StaffLogin onLogin={setMe} role="organizer" />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back
          </Link>
          <h1 className="text-2xl font-bold">Organizer</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · MetLife Stadium
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/control"
            className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500"
          >
            control panel
          </Link>
          <button
            onClick={() => {
              logout();
              setMe(null);
            }}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mb-6">
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile label="Events (6h)" value={metrics.events_seen} />
            <MetricTile label="Open now" value={metrics.events_open} tone="warn" />
            <MetricTile
              label="Pending auth"
              value={metrics.pending_authorizations}
              tone={metrics.pending_authorizations > 0 ? 'critical' : 'default'}
            />
            <MetricTile label="Resolved" value={metrics.events_resolved} tone="ok" />
            <MetricTile
              label="Avg. time-to-confirmed"
              value={
                metrics.avg_time_to_confirmed_seconds != null
                  ? `${Math.round(metrics.avg_time_to_confirmed_seconds)}s`
                  : '—'
              }
            />
            <MetricTile
              label="Loop-closure notifications"
              value={metrics.loop_closure_notifications}
            />
            <MetricTile
              label="Manipulation suppressed"
              value={metrics.manipulation_suppressed}
              tone="ok"
            />
            <MetricTile label="Dismissed" value={metrics.events_dismissed} />
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Live venue map
        </div>
        {live && <VenueMap data={live} onSelect={setDrilling} />}
        {!live && <div className="text-sm text-slate-500">Loading…</div>}
      </section>

      <section>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Patterns (last 6h)
        </div>
        {patterns.length === 0 && (
          <div className="text-sm text-slate-500">
            No emergent patterns yet. Once events start clustering by (category × node), they'll
            show up here.
          </div>
        )}
        {patterns.length > 0 && (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60">
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
                  <tr key={`${p.category}-${p.node_id}-${i}`} className="border-t border-slate-800">
                    <td className="px-3 py-2">{p.category}</td>
                    <td className="px-3 py-2 text-slate-400">{p.node_id}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.count}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {p.confirmed}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {p.resolved}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {p.avg_severity_score.toFixed(1)}
                    </td>
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
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'ok' | 'warn' | 'critical';
}) {
  const border =
    tone === 'critical'
      ? 'border-red-500/50'
      : tone === 'warn'
        ? 'border-amber-500/50'
        : tone === 'ok'
          ? 'border-emerald-500/50'
          : 'border-slate-800';
  return (
    <div className={`p-3 rounded border ${border} bg-slate-900/40`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
