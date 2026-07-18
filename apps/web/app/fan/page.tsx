'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PersonaPicker from '../../components/PersonaPicker';
import AccessibilityDrawer from '../../components/AccessibilityDrawer';
import CategoryGrid from '../../components/CategoryGrid';
import NudgeCard from '../../components/NudgeCard';
import MediaAttach from '../../components/MediaAttach';
import { SUPPORTED_LANGUAGES } from '../../lib/categories';
import {
  ActiveEvent,
  FanNudge,
  Me,
  VenueNode,
  fanEventSource,
  fanSession,
  listActiveEvents,
  me as fetchMe,
  patchMe,
  submitFanReport,
  venueGraph,
} from '../../lib/api';

type StoredNudge = { nudge: FanNudge; at: number };

export default function FanPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [deviceFp, setDeviceFp] = useState<string | null>(null);
  const [lang, setLang] = useState<string>('en');
  const [nodes, setNodes] = useState<VenueNode[]>([]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [nodeHint, setNodeHint] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [nudges, setNudges] = useState<StoredNudge[]>([]);
  const [active, setActive] = useState<ActiveEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Boot: fan-session (for anon), current me (if a token exists), venue graph.
  useEffect(() => {
    fanSession()
      .then((r) => setDeviceFp(r.device_fp))
      .catch(() => setDeviceFp('offline'));
    venueGraph()
      .then((g) => setNodes(g.nodes))
      .catch(() => setNodes([]));
    fetchMe().then((u) => {
      if (u) {
        setMe(u);
        setLang(u.language);
        if (u.home_node_id) setNodeHint(u.home_node_id);
      }
    });
  }, []);

  // Poll active events every 10s so we can show "N flagged this" reassurance.
  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const evs = await listActiveEvents();
        if (!stopped) setActive(evs);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 10000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);

  // Live nudge stream — re-open when identity (anon vs known fan) changes.
  useEffect(() => {
    esRef.current?.close();
    const key = me?.id ? me.id : deviceFp && deviceFp !== 'offline' ? deviceFp : null;
    if (!key) return;
    const es = fanEventSource(deviceFp, me?.id);
    esRef.current = es;
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.type === 'fan.nudge' && parsed.data) {
          setNudges((cur) => [{ nudge: parsed.data as FanNudge, at: Date.now() }, ...cur].slice(0, 12));
        }
        if (parsed?.type === 'fan.resolved' && parsed.data) {
          setNudges((cur) =>
            [
              {
                nudge: {
                  event_id: parsed.data.event_id,
                  category: parsed.data.category || 'closure',
                  severity: 'LOW',
                  band: 'CONFIRMED',
                  node_id: parsed.data.node_id || '',
                  lang: parsed.data.lang || 'en',
                  headline: parsed.data.headline || 'Resolved',
                  body: parsed.data.body || 'Fixed. Thanks for reporting.',
                },
                at: Date.now(),
              },
              ...cur,
            ].slice(0, 12)
          );
        }
      } catch {}
    });
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [deviceFp, me?.id]);

  const sortedNodes = useMemo(() => {
    const typeOrder: Record<string, number> = {
      section: 0, restroom: 1, vendor: 2, medical: 3, gate: 4, concourse: 5,
      landmark: 6, exit: 7, transit: 8,
    };
    return [...nodes].sort(
      (a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99) || a.name.localeCompare(b.name)
    );
  }, [nodes]);

  async function pickCategory(categoryId: string) {
    if (!deviceFp && !me) return;
    setPending(true);
    setAck(null);
    try {
      const r = await submitFanReport({
        text: text || undefined,
        language: lang,
        category: categoryId,
        node_hint: nodeHint || undefined,
        media_ids: mediaIds.length ? mediaIds : undefined,
      });
      setAck(r.message);
      setText('');
      setMediaIds([]);
    } catch (e: any) {
      setAck(`error: ${e.message}`);
    } finally {
      setPending(false);
    }
  }

  async function onLangChange(v: string) {
    setLang(v);
    if (me) {
      try {
        await patchMe({ language: v });
        setMe({ ...me, language: v });
      } catch {}
    }
  }

  async function onNodeChange(v: string) {
    setNodeHint(v);
    if (me) {
      try {
        await patchMe({ home_node_id: v || null });
        setMe({ ...me, home_node_id: v || null });
      } catch {}
    }
  }

  // Same-node open event, for the "N flagged this" hint on the current selection
  const activeAtSelected = nodeHint ? active.find((e) => e.node_id === nodeHint) : undefined;

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back
          </Link>
          <h1 className="text-2xl font-bold">Fan</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            MetLife Stadium
            {deviceFp && deviceFp !== 'offline' && (
              <> · session {deviceFp.slice(0, 8)}</>
            )}
          </div>
        </div>
        <PersonaPicker
          me={me}
          onChange={(u) => {
            setMe(u);
            if (u) {
              setLang(u.language);
              if (u.home_node_id) setNodeHint(u.home_node_id);
            }
          }}
        />
      </header>

      <section className="mb-6">
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Profile</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Language</div>
            <select
              value={lang}
              onChange={(e) => onLangChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Where are you?</div>
            <select
              value={nodeHint}
              onChange={(e) => onNodeChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2"
            >
              <option value="">(pick location)</option>
              {sortedNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.type}: {n.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AccessibilityDrawer me={me} onUpdate={setMe} />
      </section>

      <section className="mb-6">
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">
          Report something
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. spill outside the restroom, huge line, someone needs help…"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 mb-3"
        />
        <div className="mb-3">
          <MediaAttach attached={mediaIds} onChange={setMediaIds} />
        </div>
        {activeAtSelected && (
          <div className="mb-3 text-xs text-amber-400">
            {activeAtSelected.distinct_observers.toLocaleString()} people already flagged something
            at this location ({activeAtSelected.category}, {activeAtSelected.confidence_band}).
          </div>
        )}
        <CategoryGrid lang={lang} disabled={pending} onPick={pickCategory} />
        {ack && (
          <div className="mt-4 p-3 bg-slate-800 rounded border border-slate-700 text-sm">
            {ack}
          </div>
        )}
      </section>

      <section>
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Live guidance</div>
        {!me && (
          <div className="mb-3 text-xs text-slate-500 italic">
            Anonymous fans can report but don't receive per-user nudges. Pick a persona above
            to see the guidance loop.
          </div>
        )}
        {nudges.length === 0 && me && (
          <div className="text-sm text-slate-500">
            Nothing yet. Nudges appear here as they arrive.
          </div>
        )}
        <div className="space-y-3">
          {nudges.map((n, i) => {
            const openAtNode = active.find((e) => e.id === n.nudge.event_id);
            return (
              <NudgeCard
                key={`${n.nudge.event_id}-${i}`}
                nudge={n.nudge}
                arrivedAt={n.at}
                reporterCount={openAtNode?.distinct_observers}
                nodesById={nodesById}
              />
            );
          })}
        </div>
      </section>
    </main>
  );
}
