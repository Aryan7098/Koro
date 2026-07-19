'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { OrganizerLive } from '../lib/api';

// A stylized bird's-eye MetLife-ish rendering. Not a satellite photo — but
// visually reads as a stadium at a glance: green field, concentric bowl
// (levels 100/200/300), gate ring around it, and node dots overlaid at
// their projected lat/lng positions.

const SEV_FILL: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MED: '#eab308',
  LOW: '#64748b',
};

const NODE_STROKE: Record<string, string> = {
  gate:      '#38bdf8',
  restroom:  '#0ea5e9',
  medical:   '#ef4444',
  section:   '#94a3b8',
  concourse: '#475569',
  vendor:    '#f59e0b',
  exit:      '#fb923c',
  transit:   '#818cf8',
  landmark:  '#10b981',
};

const NODE_ICON: Record<string, string> = {
  gate: '🚪',
  restroom: '🚻',
  medical: '⛑️',
  section: '💺',
  concourse: '🏛️',
  vendor: '🍔',
  exit: '🚨',
  transit: '🚌',
  landmark: '🏳️',
};

type Props = {
  data: OrganizerLive;
  onSelect?: (eventId: string) => void;
};

export default function StadiumMap({ data, onSelect }: Props) {
  const { projected, events } = useMemo(() => {
    if (!data.nodes.length) return { projected: [], events: [] };
    const lats = data.nodes.map((n) => n.lat);
    const lngs = data.nodes.map((n) => n.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const spanLat = Math.max(1e-6, maxLat - minLat);
    const spanLng = Math.max(1e-6, maxLng - minLng);
    const W = 900, H = 620, pad = 80;
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
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl">
      <svg viewBox="0 0 900 620" className="w-full min-w-[600px]">
        <defs>
          <radialGradient id="field" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="70%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#052e16" />
          </radialGradient>
          <radialGradient id="bowl" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0" />
            <stop offset="60%" stopColor="#1e293b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Concentric bowl — level 300 outer, 100 inner */}
        <ellipse cx="450" cy="310" rx="410" ry="270" fill="#1e293b" opacity="0.35" />
        <ellipse cx="450" cy="310" rx="340" ry="220" fill="#334155" opacity="0.4" />
        <ellipse cx="450" cy="310" rx="270" ry="170" fill="#475569" opacity="0.45" />

        {/* Field */}
        <ellipse cx="450" cy="310" rx="190" ry="115" fill="url(#field)" />
        <ellipse
          cx="450"
          cy="310"
          rx="190"
          ry="115"
          fill="none"
          stroke="#22c55e"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        {/* Field centre line + circle */}
        <line x1="450" y1="195" x2="450" y2="425" stroke="#22c55e" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="450" cy="310" r="30" fill="none" stroke="#22c55e" strokeOpacity="0.5" strokeWidth="1.2" />

        {/* Bowl inner glow */}
        <ellipse cx="450" cy="310" rx="410" ry="270" fill="url(#bowl)" pointerEvents="none" />

        {/* Compass */}
        <g transform="translate(60,60)" opacity="0.6">
          <circle cx="0" cy="0" r="22" fill="#0f172a" stroke="#334155" />
          <text x="0" y="-9" textAnchor="middle" fontSize="10" fill="#94a3b8">N</text>
          <text x="0" y="17" textAnchor="middle" fontSize="10" fill="#64748b">S</text>
          <text x="-13" y="4" textAnchor="middle" fontSize="10" fill="#64748b">W</text>
          <text x="13" y="4" textAnchor="middle" fontSize="10" fill="#64748b">E</text>
          <polygon points="0,-6 -3,4 0,1 3,4" fill="#f43f5e" />
        </g>

        {/* Nodes */}
        {projected.map((n) => {
          const evs = eventsByNode.get(n.id) || [];
          const worst = evs.reduce<string | null>((cur, e) => {
            const order = { CRITICAL: 3, HIGH: 2, MED: 1, LOW: 0 };
            if (!cur) return e.severity;
            return (order as any)[e.severity] > (order as any)[cur] ? e.severity : cur;
          }, null);
          const observers = evs.reduce((s, e) => s + e.distinct_observers, 0);
          const r = evs.length ? Math.max(9, Math.min(22, 9 + Math.log2(1 + observers) * 3)) : 5;
          const fill = worst ? SEV_FILL[worst] : '#0f172a';
          const stroke = NODE_STROKE[n.type] || '#64748b';
          const pulsing = worst === 'CRITICAL' || worst === 'HIGH';

          return (
            <g
              key={n.id}
              onClick={() => evs[0] && onSelect?.(evs[0].id)}
              style={{ cursor: evs.length ? 'pointer' : 'default' }}
            >
              {pulsing && (
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={fill}
                  fillOpacity={0.35}
                  animate={{ r: [r, r + 12, r], fillOpacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                fillOpacity={worst ? 0.9 : 0.6}
                stroke={stroke}
                strokeWidth={worst ? 2.5 : 1.2}
                filter={worst ? 'url(#glow)' : undefined}
              />
              {evs.length > 0 && (
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#fff"
                  fontWeight="700"
                  pointerEvents="none"
                >
                  {evs.length}
                </text>
              )}
              <text
                x={n.x}
                y={n.y - r - 4}
                textAnchor="middle"
                fontSize="10"
                fill={worst ? '#e2e8f0' : '#64748b'}
                pointerEvents="none"
              >
                {NODE_ICON[n.type] || ''} {n.name}
              </text>
            </g>
          );
        })}

        {/* Corner labels */}
        <text x="30" y="605" fontSize="10" fill="#334155">MetLife Stadium · East Rutherford, NJ</text>
      </svg>
      <div className="p-3 text-xs text-slate-400 flex gap-4 flex-wrap border-t border-slate-800 bg-slate-950/40">
        {['CRITICAL', 'HIGH', 'MED', 'LOW'].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: SEV_FILL[s], boxShadow: `0 0 8px ${SEV_FILL[s]}` }}
            />
            {s}
          </span>
        ))}
        <span className="ml-auto text-slate-500">
          circle size ∝ log(distinct observers) · pulse = HIGH/CRITICAL
        </span>
      </div>
    </div>
  );
}
