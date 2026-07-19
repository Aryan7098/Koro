'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { OrganizerLive } from '../lib/api';

// Bird's-eye MetLife-ish stadium rendering. Two big legibility rules to
// avoid label overlap:
//   1. Only nodes that currently have events get a large name label.
//   2. Quiet nodes just show their type icon; hover in the browser to see
//      the tooltip (title attribute).

const SEV_FILL: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MED: '#eab308',
  LOW: '#64748b',
};

const NODE_STROKE: Record<string, string> = {
  gate: '#38bdf8',
  restroom: '#0ea5e9',
  medical: '#ef4444',
  section: '#94a3b8',
  concourse: '#475569',
  vendor: '#f59e0b',
  exit: '#fb923c',
  transit: '#818cf8',
  landmark: '#10b981',
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

// Concise short-names so labels fit on the map without overlapping.
function shortName(name: string): string {
  return name
    .replace('Emergency Exit ', 'Exit ')
    .replace('Mezzanine Concourse ', 'Concourse ')
    .replace('Main Concourse ', 'Concourse ')
    .replace('Upper Concourse ', 'Concourse ')
    .replace('Sensory Quiet Room', 'Quiet Room')
    .replace('Concessions ', 'Vendor ')
    .replace('Restroom near ', 'Restroom ')
    .replace('Restroom Mezzanine ', 'Restroom Mezz ')
    .replace('Medical Station ', 'Medical ')
    .replace('Secaucus Junction Shuttle Stop', 'Secaucus Shuttle')
    .replace(' (Toyota Gate)', '')
    .replace(/\(\d+→\d+\)/, '')
    .trim();
}

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
    const W = 1100, H = 720, pad = 100;
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
      <svg viewBox="0 0 1100 720" className="w-full min-w-[700px]">
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

        {/* Bowl */}
        <ellipse cx="550" cy="360" rx="500" ry="330" fill="#1e293b" opacity="0.35" />
        <ellipse cx="550" cy="360" rx="415" ry="270" fill="#334155" opacity="0.4" />
        <ellipse cx="550" cy="360" rx="330" ry="210" fill="#475569" opacity="0.45" />

        {/* Field */}
        <ellipse cx="550" cy="360" rx="230" ry="140" fill="url(#field)" />
        <ellipse cx="550" cy="360" rx="230" ry="140" fill="none" stroke="#22c55e" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" />
        <line x1="550" y1="220" x2="550" y2="500" stroke="#22c55e" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="550" cy="360" r="36" fill="none" stroke="#22c55e" strokeOpacity="0.5" strokeWidth="1.2" />

        <ellipse cx="550" cy="360" rx="500" ry="330" fill="url(#bowl)" pointerEvents="none" />

        {/* Compass */}
        <g transform="translate(70,70)" opacity="0.6">
          <circle cx="0" cy="0" r="22" fill="#0f172a" stroke="#334155" />
          <text x="0" y="-9" textAnchor="middle" fontSize="10" fill="#94a3b8">N</text>
          <text x="0" y="17" textAnchor="middle" fontSize="10" fill="#64748b">S</text>
          <text x="-13" y="4" textAnchor="middle" fontSize="10" fill="#64748b">W</text>
          <text x="13" y="4" textAnchor="middle" fontSize="10" fill="#64748b">E</text>
          <polygon points="0,-6 -3,4 0,1 3,4" fill="#f43f5e" />
        </g>

        {/* Nodes — quiet ones first (dots + icons only), hot ones after so they render on top */}
        {projected.map((n) => {
          const evs = eventsByNode.get(n.id) || [];
          if (evs.length) return null; // draw hot nodes in the next pass
          return (
            <g key={n.id}>
              <title>{n.name}</title>
              <circle
                cx={n.x}
                cy={n.y}
                r={4}
                fill="#0f172a"
                stroke={NODE_STROKE[n.type] || '#64748b'}
                strokeWidth={1.2}
                fillOpacity={0.7}
              />
              <text
                x={n.x + 8}
                y={n.y + 4}
                fontSize="11"
                fill="#475569"
                pointerEvents="none"
              >
                {NODE_ICON[n.type] || ''}
              </text>
            </g>
          );
        })}

        {/* Hot nodes — full label with severity color and pulse */}
        {projected.map((n) => {
          const evs = eventsByNode.get(n.id) || [];
          if (!evs.length) return null;
          const worst = evs.reduce<string | null>((cur, e) => {
            const order = { CRITICAL: 3, HIGH: 2, MED: 1, LOW: 0 };
            if (!cur) return e.severity;
            return (order as any)[e.severity] > (order as any)[cur] ? e.severity : cur;
          }, null);
          const observers = evs.reduce((s, e) => s + e.distinct_observers, 0);
          const r = Math.max(11, Math.min(24, 11 + Math.log2(1 + observers) * 3));
          const fill = worst ? SEV_FILL[worst] : '#0f172a';
          const stroke = NODE_STROKE[n.type] || '#64748b';
          const pulsing = worst === 'CRITICAL' || worst === 'HIGH';
          const label = shortName(n.name);

          return (
            <g
              key={n.id}
              onClick={() => evs[0] && onSelect?.(evs[0].id)}
              style={{ cursor: 'pointer' }}
            >
              <title>{n.name}</title>
              {pulsing && (
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={fill}
                  fillOpacity={0.35}
                  animate={{ r: [r, r + 14, r], fillOpacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                fillOpacity={0.92}
                stroke={stroke}
                strokeWidth={2.5}
                filter="url(#glow)"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="12"
                fill="#fff"
                fontWeight="700"
                pointerEvents="none"
              >
                {evs.length}
              </text>
              {/* Label with rounded background pill for legibility */}
              <g pointerEvents="none">
                <rect
                  x={n.x - Math.max(60, label.length * 3.7)}
                  y={n.y - r - 22}
                  width={Math.max(120, label.length * 7.4)}
                  height="18"
                  rx="6"
                  fill="#0f172a"
                  fillOpacity="0.85"
                  stroke={stroke}
                  strokeOpacity="0.6"
                />
                <text
                  x={n.x}
                  y={n.y - r - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#e2e8f0"
                  fontWeight="600"
                >
                  {NODE_ICON[n.type] || ''} {label}
                </text>
              </g>
            </g>
          );
        })}

        <text x="30" y="705" fontSize="10" fill="#334155">MetLife Stadium · East Rutherford, NJ</text>
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
        <span className="text-slate-600">
          quiet nodes = small dots · hover for name · hot nodes labeled + pulsing
        </span>
      </div>
    </div>
  );
}
