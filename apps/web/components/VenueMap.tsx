'use client';

import { useMemo } from 'react';
import { OrganizerLive } from '../lib/api';

// SVG venue map. Projects the (lat, lng) of every node into a normalized
// 800×500 canvas, then colors + sizes active-event nodes by severity and
// distinct-observer count. No map library — the graph is small enough that
// a direct SVG render is faster to demo than Leaflet.

const SEV_FILL: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MED: '#eab308',
  LOW: '#64748b',
};

const TYPE_STROKE: Record<string, string> = {
  gate: '#0891b2',
  restroom: '#0ea5e9',
  medical: '#dc2626',
  section: '#a3a3a3',
  concourse: '#525252',
  vendor: '#f59e0b',
  exit: '#f97316',
  transit: '#6366f1',
  landmark: '#059669',
};

type Props = {
  data: OrganizerLive;
  onSelect?: (eventId: string) => void;
};

export default function VenueMap({ data, onSelect }: Props) {
  const { projected, events } = useMemo(() => {
    if (!data.nodes.length) return { projected: [], events: [] };
    const lats = data.nodes.map((n) => n.lat);
    const lngs = data.nodes.map((n) => n.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const spanLat = Math.max(1e-6, maxLat - minLat);
    const spanLng = Math.max(1e-6, maxLng - minLng);
    const W = 800, H = 500, pad = 40;
    // North (higher lat) at top.
    const projected = data.nodes.map((n) => {
      const x = pad + ((n.lng - minLng) / spanLng) * (W - 2 * pad);
      const y = pad + (1 - (n.lat - minLat) / spanLat) * (H - 2 * pad);
      return { ...n, x, y };
    });
    return { projected, events: data.events };
  }, [data]);

  const eventsByNode = useMemo(() => {
    const m = new Map<string, typeof events[number][]>();
    for (const e of events) {
      const arr = m.get(e.node_id) || [];
      arr.push(e);
      m.set(e.node_id, arr);
    }
    return m;
  }, [events]);

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40">
      <svg viewBox="0 0 800 500" className="w-full min-w-[600px]">
        <rect x="0" y="0" width="800" height="500" fill="transparent" />
        {projected.map((n) => {
          const evs = eventsByNode.get(n.id) || [];
          const worst = evs.reduce<string | null>((cur, e) => {
            const order = { CRITICAL: 3, HIGH: 2, MED: 1, LOW: 0 };
            if (!cur) return e.severity;
            return (order as any)[e.severity] > (order as any)[cur] ? e.severity : cur;
          }, null);
          const observers = evs.reduce((s, e) => s + e.distinct_observers, 0);
          const r = evs.length ? Math.max(6, Math.min(18, 6 + Math.log2(1 + observers) * 3)) : 4;
          const fill = worst ? SEV_FILL[worst] : '#334155';
          const stroke = TYPE_STROKE[n.type] || '#64748b';
          return (
            <g
              key={n.id}
              onClick={() => evs[0] && onSelect?.(evs[0].id)}
              style={{ cursor: evs.length ? 'pointer' : 'default' }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                fillOpacity={worst ? 0.6 : 0.5}
                stroke={stroke}
                strokeWidth={worst ? 2 : 1}
              />
              {evs.length > 0 && (
                <text
                  x={n.x}
                  y={n.y + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fff"
                  fontWeight="600"
                >
                  {evs.length}
                </text>
              )}
              <text
                x={n.x}
                y={n.y + r + 10}
                textAnchor="middle"
                fontSize="9"
                fill="#94a3b8"
              >
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="p-3 text-xs text-slate-500 flex gap-4 flex-wrap border-t border-slate-800">
        {['CRITICAL', 'HIGH', 'MED', 'LOW'].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ background: SEV_FILL[s] }} />
            {s}
          </span>
        ))}
        <span className="ml-auto text-slate-600">
          circle size ∝ log(distinct observers)
        </span>
      </div>
    </div>
  );
}
