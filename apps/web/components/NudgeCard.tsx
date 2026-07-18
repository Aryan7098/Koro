'use client';

import { FanNudge, VenueNode } from '../lib/api';

const BAND_COLOR: Record<string, string> = {
  RUMOR: 'bg-slate-700 text-slate-300',
  PROBABLE: 'bg-amber-600/30 text-amber-300',
  CONFIRMED: 'bg-emerald-600/30 text-emerald-300',
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'bg-slate-700 text-slate-300',
  MED: 'bg-yellow-700/30 text-yellow-300',
  HIGH: 'bg-orange-700/30 text-orange-300',
  CRITICAL: 'bg-red-700/30 text-red-300',
};

type Props = {
  nudge: FanNudge;
  arrivedAt: number;
  reporterCount?: number;
  nodesById: Map<string, VenueNode>;
};

export default function NudgeCard({ nudge, arrivedAt, reporterCount, nodesById }: Props) {
  const nextNodeName = nudge.next_node_id ? nodesById.get(nudge.next_node_id)?.name : undefined;
  const eventNodeName = nodesById.get(nudge.node_id)?.name || nudge.node_id;
  const ageSec = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));

  return (
    <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 flex-wrap">
        <span
          className={`px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] ${
            BAND_COLOR[nudge.band] || 'bg-slate-700'
          }`}
        >
          {nudge.band}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] ${
            SEVERITY_COLOR[nudge.severity] || 'bg-slate-700'
          }`}
        >
          {nudge.severity}
        </span>
        <span>{nudge.category}</span>
        <span>·</span>
        <span>{eventNodeName}</span>
        <span className="ml-auto">
          {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`}
        </span>
      </div>
      <div className="font-semibold text-base">{nudge.headline}</div>
      <div className="text-sm text-slate-300 mt-1 leading-relaxed">{nudge.body}</div>
      {nudge.action_hint && (
        <div className="text-sm text-emerald-400 mt-2 flex items-start gap-1">
          <span>→</span>
          <span>
            {nudge.action_hint}
            {nextNodeName && <span className="text-slate-400"> ({nextNodeName})</span>}
          </span>
        </div>
      )}
      {reporterCount && reporterCount > 1 && (
        <div className="text-xs text-slate-500 mt-3 border-t border-slate-800 pt-2">
          {reporterCount.toLocaleString()} fans flagged this — your report matters.
        </div>
      )}
    </div>
  );
}
