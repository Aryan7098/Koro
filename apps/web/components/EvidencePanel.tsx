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
                  <div className="flex gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.category}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.severity}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.confidence_band}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800">{data.event.status}</span>
                    <span className="text-slate-500">node: {data.event.node_id}</span>
                  </div>
                  {data.event.severity_reason && (
                    <div className="text-xs text-slate-500 italic mt-2">
                      severity reasoning: {data.event.severity_reason}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                  Reports ({data.reports.length})
                </div>
                <div className="space-y-2">
                  {data.reports.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded bg-slate-900/60 border border-slate-800 text-sm"
                    >
                      <div className="flex items-baseline gap-2 text-xs text-slate-500 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800">{r.source}</span>
                        {r.raw_language && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800">{r.raw_language}</span>
                        )}
                        {r.confirm_value && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 uppercase">
                            {r.confirm_value}
                          </span>
                        )}
                        <span className="ml-auto">
                          {r.created_at?.slice(11, 19)}
                        </span>
                      </div>
                      {r.raw_text && <div className="text-slate-300">{r.raw_text}</div>}
                      {r.normalized && (r.normalized as any).canonical_en && (
                        <div className="text-xs text-slate-500 italic mt-1">
                          → {(r.normalized as any).canonical_en}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                  Ledger ({data.ledger.length})
                </div>
                <div className="space-y-1">
                  {data.ledger.map((le) => (
                    <div
                      key={le.id}
                      className="p-2 rounded bg-slate-900/60 border border-slate-800 text-xs"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-slate-400">{le.action}</span>
                        <span className="ml-auto text-slate-500">
                          {le.created_at?.slice(11, 19)}
                        </span>
                      </div>
                      {le.notes && <div className="text-slate-500 italic mt-1">{le.notes}</div>}
                      {Object.keys(le.payload || {}).length > 0 && (
                        <pre className="text-slate-500 mt-1 overflow-x-auto text-[10px] leading-tight">
                          {JSON.stringify(le.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
