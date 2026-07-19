'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import StaffLogin from '../../components/StaffLogin';
import EvidencePanel from '../../components/EvidencePanel';
import MediaAttach from '../../components/MediaAttach';
import {
  Me,
  VenueNode,
  VolunteerScript,
  VolunteerTask,
  logout,
  me as fetchMe,
  venueGraph,
  volunteerComplete,
  volunteerConfirm,
  volunteerDeny,
  volunteerEventSource,
  volunteerScripts,
  volunteerTasks,
} from '../../lib/api';

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

export default function VolunteerPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [verify, setVerify] = useState<VolunteerTask[]>([]);
  const [active, setActive] = useState<VolunteerTask[]>([]);
  const [scripts, setScripts] = useState<VolunteerScript[]>([]);
  const [drilling, setDrilling] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [nodes, setNodes] = useState<VenueNode[]>([]);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const refresh = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([volunteerTasks(), volunteerScripts()]);
      setVerify(t.verify);
      setActive(t.active);
      setScripts(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (u && (u.role === 'volunteer' || u.role === 'staff')) setMe(u);
    });
    venueGraph().then((g) => setNodes(g.nodes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const iv = setInterval(refresh, 6000);
    const es = volunteerEventSource(me.id);
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.type === 'volunteer.script' && parsed.data) {
          setScripts((cur) => [parsed.data as VolunteerScript, ...cur].slice(0, 30));
        }
      } catch {}
      refresh();
    });
    return () => {
      clearInterval(iv);
      es.close();
    };
  }, [me, refresh]);

  async function onConfirm(eventId: string) {
    const note = window.prompt('Optional note (what did you see?):', '');
    try {
      await volunteerConfirm(eventId, note || undefined);
      setFlash({ kind: 'ok', msg: 'Confirmed. Confidence will re-score.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onDeny(eventId: string) {
    const note = window.prompt('Why deny? (required)', '');
    if (!note) return;
    try {
      await volunteerDeny(eventId, note);
      setFlash({ kind: 'ok', msg: 'Denied. Confidence will drop.' });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }
  async function onComplete(eventId: string, text: string, mediaIds: string[]) {
    try {
      const r = await volunteerComplete(eventId, { text, media_ids: mediaIds });
      setFlash({ kind: 'ok', msg: r.message });
      refresh();
    } catch (e: any) { setFlash({ kind: 'err', msg: e.message }); }
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400">← back</Link>
        <StaffLogin onLogin={setMe} role="volunteer" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400 transition">← back</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
            Volunteer
          </h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {me.display_name} · {me.zone ? `zone: ${me.zone}` : 'all zones'}
          </div>
        </div>
        <button
          onClick={() => { logout(); setMe(null); }}
          className="text-xs px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-500"
        >
          Sign out
        </button>
      </header>

      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`mb-3 p-2 text-xs rounded ${
              flash.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
            }`}
          >
            {flash.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active tasks — dispatched from staff */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs text-emerald-300 uppercase tracking-wider">
            Active tasks · dispatched by staff ({active.length})
          </div>
          {active.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
        </div>
        {!active.length && (
          <div className="text-sm text-slate-500 italic">
            No active tasks. When staff dispatches an event to your zone, it appears here with the
            full context and a form to submit completion evidence.
          </div>
        )}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {active.map((t) => (
              <ActiveTaskCard
                key={t.id}
                task={t}
                nodesById={nodesById}
                onComplete={onComplete}
                onDrill={setDrilling}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Verify queue — RUMOR/PROBABLE */}
      <section className="mb-8">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
          Verify queue · confirm what fans are reporting ({verify.length})
        </div>
        {!verify.length && (
          <div className="text-sm text-slate-500 italic">
            Nothing to verify. When a rumor lands nearby, walk over and confirm what fans reported.
          </div>
        )}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {verify.map((t) => (
              <VerifyCard
                key={t.id}
                task={t}
                nodesById={nodesById}
                onConfirm={onConfirm}
                onDeny={onDeny}
                onDrill={setDrilling}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Legacy scripts panel — kept below as reference */}
      {scripts.length > 0 && (
        <section>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            Live scripts (context)
          </div>
          <div className="space-y-2">
            {scripts.slice(0, 6).map((s, i) => (
              <div key={`${s.event_id}-${i}`} className="p-3 rounded border border-slate-800 bg-slate-900/30 text-sm">
                <div className="text-xs text-slate-500 mb-1">
                  {s.category} · {s.severity} · {s.node_id}
                </div>
                <div className="italic text-slate-300">&ldquo;{s.say}&rdquo;</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {drilling && <EvidencePanel eventId={drilling} onClose={() => setDrilling(null)} />}
    </main>
  );
}

// ---------- sub-components ----------------------------------------------

function LocationLine({ nodeId, nodesById }: { nodeId: string; nodesById: Map<string, VenueNode> }) {
  const node = nodesById.get(nodeId);
  if (!node) return <span>{nodeId}</span>;
  return (
    <span>
      📍 <span className="text-slate-200 font-medium">{node.name}</span>
      <span className="text-slate-500"> · level {node.level}</span>
    </span>
  );
}

function ActiveTaskCard({
  task, nodesById, onComplete, onDrill,
}: {
  task: VolunteerTask;
  nodesById: Map<string, VenueNode>;
  onComplete: (id: string, text: string, mediaIds: string[]) => void;
  onDrill: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const alreadySubmitted = task.completion && task.completion.count > 0;

  async function submit() {
    if (text.trim().length < 5) return;
    setBusy(true);
    try {
      await onComplete(task.id, text.trim(), mediaIds);
      setText('');
      setMediaIds([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20"
    >
      <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
        <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[task.severity] || ''}`}>
          {task.severity}
        </span>
        <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[task.confidence_band] || ''}`}>
          {task.confidence_band}
        </span>
        <span className="text-slate-400 uppercase tracking-wider">{task.category}</span>
        <span className="ml-auto text-emerald-300 text-[10px] uppercase tracking-wider font-medium">
          🚀 DISPATCHED — Take action
        </span>
      </div>
      <div className="text-sm text-slate-400 mb-2">
        <LocationLine nodeId={task.node_id} nodesById={nodesById} />
      </div>
      {task.recent_reports && task.recent_reports.length > 0 ? (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/70 mb-1.5">
            What fans reported
          </div>
          <div className="space-y-1.5">
            {task.recent_reports.map((r, i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-sm text-slate-100"
              >
                {r.language && (
                  <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase align-middle">
                    {r.language}
                  </span>
                )}
                <span className="italic">&ldquo;{r.text}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-100 mb-3">
          {task.canonical_summary || <i className="text-slate-500">no summary</i>}
        </div>
      )}
      <div className="text-xs text-slate-400 mb-3">
        👥 {task.distinct_observers.toLocaleString()} fan report{task.distinct_observers === 1 ? '' : 's'}
      </div>

      {alreadySubmitted ? (
        <div className="p-3 rounded-lg bg-slate-950/60 border border-emerald-700/40">
          <div className="text-xs text-emerald-300 mb-1">
            ✓ Completion evidence already submitted ({task.completion!.count})
          </div>
          <div className="text-sm text-slate-200 italic">
            &ldquo;{task.completion!.latest_text}&rdquo;
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Waiting for staff to verify + notify fans.
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
          <label className="block">
            <div className="text-xs text-emerald-300 font-medium mb-1">
              Submit completion evidence
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="What did you see / do? e.g. 'Floor mopped, area cordoned off. Restroom reopened.'"
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </label>
          <MediaAttach attached={mediaIds} onChange={setMediaIds} />
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={submit}
              disabled={busy || text.trim().length < 5}
              className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium"
            >
              ✓ Submit — task complete
            </motion.button>
            <button
              onClick={() => onDrill(task.id)}
              className="text-sm px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500"
            >
              view full evidence
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function VerifyCard({
  task, nodesById, onConfirm, onDeny, onDrill,
}: {
  task: VolunteerTask;
  nodesById: Map<string, VenueNode>;
  onConfirm: (id: string) => void;
  onDeny: (id: string) => void;
  onDrill: (id: string) => void;
}) {
  const reports = task.recent_reports || [];
  const langs = Array.from(new Set(reports.map((r) => r.language).filter(Boolean))) as string[];

  return (
    <motion.div
      layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="p-4 rounded-xl border border-slate-800 bg-slate-900/40"
    >
      {/* Chip row */}
      <div className="flex items-baseline gap-2 mb-2 flex-wrap text-xs">
        <span className={`px-1.5 py-0.5 rounded border ${SEV_COLOR[task.severity] || ''}`}>
          {task.severity}
        </span>
        <span className={`px-1.5 py-0.5 rounded ${BAND_COLOR[task.confidence_band] || ''}`}>
          {task.confidence_band}
        </span>
        <span className="text-slate-400 uppercase tracking-wider">{task.category}</span>
        <span className="ml-auto text-slate-500">
          {task.distinct_observers.toLocaleString()} fan report{task.distinct_observers === 1 ? '' : 's'}
          {langs.length > 0 && ` · ${langs.join('/').toUpperCase()}`}
        </span>
      </div>

      {/* Location */}
      <div className="text-sm text-slate-400 mb-3">
        <LocationLine nodeId={task.node_id} nodesById={nodesById} />
      </div>

      {/* THE QUEUE — what fans actually said, in their own languages */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          What fans reported ({reports.length})
        </div>
        {reports.length === 0 ? (
          <div className="text-sm text-slate-500 italic">
            (fans tapped this category without typing a description)
          </div>
        ) : (
          <div className="space-y-1.5">
            {reports.map((r, i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-sm text-slate-100"
              >
                {r.language && (
                  <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase align-middle">
                    {r.language}
                  </span>
                )}
                <span className="italic">&ldquo;{r.text}&rdquo;</span>
                {r.at && (
                  <span className="ml-2 text-[10px] text-slate-500 not-italic">
                    · {r.at.slice(11, 19)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onConfirm(task.id)}
          className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
        >
          ✓ Confirm — I see it
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onDeny(task.id)}
          className="text-sm px-3 py-1.5 rounded bg-red-800/60 hover:bg-red-700/60 text-white"
        >
          ✗ Deny — nothing here
        </motion.button>
        <button
          onClick={() => onDrill(task.id)}
          className="text-sm px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500"
        >
          full timeline
        </button>
      </div>
    </motion.div>
  );
}
