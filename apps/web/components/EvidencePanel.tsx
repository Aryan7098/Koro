'use client';

import { useEffect, useState } from 'react';
import { EventLineage, eventLineage } from '../lib/api';

type Props = {
  eventId: string;
  onClose: () => void;
};

// Modal drill-down: the full traceability lineage of an event.
// Design Commitment #4: "Every rendered instruction is traceable."
export default function EvidencePanel({ eventId, onClose }: Props) {
  const [data, setData] = useState<EventLineage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    eventLineage(eventId).then(setData).catch((e) => setErr(e.message));
  }, [eventId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl mt-10 rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Evidence lineage</div>
            <div className="text-sm text-slate-400 mt-0.5">event {eventId.slice(0, 8)}…</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-4 max-h-[75vh] overflow-y-auto">
          {err && <div className="text-sm text-red-400">{err}</div>}
          {!data && !err && <div className="text-sm text-slate-500">Loading…</div>}
          {data && (
            <div className="space-y-6">
              <section>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Event</div>
                <div className="p-3 rounded bg-slate-900/60 border border-slate-800 text-sm space-y-1">
                  <div><span className="text-slate-500">summary:</span> {data.event.canonical_summary || '—'}</div>
                  <div className="flex gap-2 text-xs flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.category}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.severity}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.confidence_band}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.status}</span>
                    <span className="text-slate-500">node: {data.event.node_id}</span>
                  </div>
                </div>
              </section>

              <section>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                  Reports ({data.reports.length})
                </div>
                <div className="space-y-2">
                  {data.reports.map((r) => {
                    const canonical = (r.normalized as any)?.canonical_en as string | undefined;
                    const text = r.raw_text || r.category_hint;
                    const showCanonical =
                      canonical && canonical !== '(no text)' && canonical !== text;
                    return (
                      <div
                        key={r.id}
                        className="p-3 rounded bg-slate-900/60 border border-slate-800 text-sm"
                      >
                        <div className="flex items-baseline gap-2 text-xs text-slate-500 mb-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800">{r.source}</span>
                          {r.raw_language && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 uppercase">
                              {r.raw_language}
                            </span>
                          )}
                          {r.confirm_value && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 uppercase">
                              {r.confirm_value}
                            </span>
                          )}
                          {r.node_hint && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800">
                              📍 {r.node_hint}
                            </span>
                          )}
                          <span className="ml-auto">{r.created_at?.slice(11, 19)}</span>
                        </div>
                        {text ? (
                          <div className="text-slate-100 text-base italic">&ldquo;{text}&rdquo;</div>
                        ) : (
                          <div className="text-slate-500 italic">(user tapped a category without typing)</div>
                        )}
                        {showCanonical && (
                          <div className="text-xs text-slate-500 mt-1">
                            → normalized: {canonical}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <LedgerTimeline ledger={data.ledger} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Ledger — human-readable timeline ----------------

const ACTION_LABEL: Record<string, string> = {
  report_ingested: 'Report received',
  event_created: 'Event created',
  event_updated: 'Re-scored',
  gate_decision: 'Gate decision',
  auth_requested: 'Authorization requested',
  auth_approved: 'Approved by staff',
  auth_denied: 'Denied by staff',
  dispatched: 'Dispatched',
  state_set: 'State set',
  resolved: 'Resolved',
  notified: 'Reporters notified',
  rendered: 'Message rendered',
};

const ACTION_ICON: Record<string, string> = {
  report_ingested: '📨',
  event_created: '✨',
  event_updated: '🔄',
  gate_decision: '⚖️',
  auth_requested: '🔐',
  auth_approved: '✓',
  auth_denied: '✕',
  dispatched: '🚀',
  resolved: '✅',
  notified: '💬',
  rendered: '📝',
};

function summarize(action: string, payload: Record<string, any>): string {
  if (action === 'event_updated') {
    return `${payload.band || '?'} confidence · ${payload.severity || '?'} severity`;
  }
  if (action === 'gate_decision') {
    return `${payload.decision || '?'}${payload.reasoning ? ` — ${payload.reasoning}` : ''}`;
  }
  if (action === 'auth_approved' || action === 'auth_denied') {
    return payload.reason || '';
  }
  if (action === 'notified') {
    return `${payload.notified_fan_count || 0} fans in ${(payload.languages || []).length} languages`;
  }
  if (action === 'rendered') {
    const c = payload.content as any;
    return `${payload.audience || 'audience'}${c?.headline ? ` · "${c.headline}"` : ''}`;
  }
  if (action === 'event_created') {
    return `${payload.category || '?'} at ${payload.node_id || '?'}`;
  }
  if (action === 'dispatched') {
    return payload.via ? String(payload.via).replace(/_/g, ' ') : '';
  }
  return '';
}

function LedgerTimeline({ ledger }: { ledger: EventLineage['ledger'] }) {
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  return (
    <section>
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
        Timeline ({ledger.length})
      </div>
      <div className="space-y-1.5">
        {ledger.map((le) => {
          const raw = showRaw[le.id];
          const summary = summarize(le.action, le.payload || {});
          return (
            <div
              key={le.id}
              className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-sm"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span>{ACTION_ICON[le.action] || '•'}</span>
                <span className="font-medium text-slate-200">
                  {ACTION_LABEL[le.action] || le.action}
                </span>
                {summary && <span className="text-slate-400 text-xs">{summary}</span>}
                <span className="ml-auto text-xs text-slate-500">
                  {le.created_at?.slice(11, 19)}
                </span>
              </div>
              {le.notes && <div className="text-xs text-slate-500 italic mt-1">{le.notes}</div>}
              {Object.keys(le.payload || {}).length > 0 && (
                <button
                  onClick={() => setShowRaw((cur) => ({ ...cur, [le.id]: !cur[le.id] }))}
                  className="text-[10px] text-slate-600 hover:text-slate-400 mt-1"
                >
                  {raw ? 'hide raw' : 'show raw'}
                </button>
              )}
              {raw && (
                <pre className="text-slate-500 mt-1 overflow-x-auto text-[10px] leading-tight">
                  {JSON.stringify(le.payload, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
