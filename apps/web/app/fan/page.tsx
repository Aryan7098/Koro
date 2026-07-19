'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import LanguagePicker from '../../components/LanguagePicker';
import AccessibilityDrawer from '../../components/AccessibilityDrawer';
import CategoryGrid from '../../components/CategoryGrid';
import NudgeCard from '../../components/NudgeCard';
import MediaAttach from '../../components/MediaAttach';
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

type StoredNudge = { nudge: FanNudge; at: number; resolved?: boolean };

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

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const evs = await listActiveEvents();
        if (!stopped) setActive(evs);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 8000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);

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
                  headline: parsed.data.headline || '✓ Resolved',
                  body: parsed.data.body || 'Fixed. Thanks for reporting.',
                },
                at: Date.now(),
                resolved: true,
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
      setTimeout(() => setAck(null), 4000);
    } catch (e: any) {
      setAck(`error: ${e.message}`);
    } finally {
      setPending(false);
    }
  }

  async function onLangChange(newMe: Me | null, newLang: string) {
    setMe(newMe);
    setLang(newLang);
    if (newMe?.home_node_id) setNodeHint(newMe.home_node_id);
    if (newMe && newMe.language !== newLang) {
      try {
        await patchMe({ language: newLang });
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

  const activeAtSelected = nodeHint ? active.find((e) => e.node_id === nodeHint) : undefined;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 max-w-3xl mx-auto">
      <header className="flex items-start justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-emerald-400 transition">
            ← back
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
            Fan
          </h1>
          <div className="text-xs text-slate-500 mt-0.5">
            MetLife Stadium · anonymous session
          </div>
        </div>
        <LanguagePicker me={me} currentLang={lang} onChange={onLangChange} />
      </header>

      {/* THE STAR — big text input at the top */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-5 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-lg"
      >
        <label htmlFor="report-text" className="block text-sm font-medium text-slate-200 mb-2">
          What&apos;s happening?
        </label>
        <textarea
          id="report-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Describe it in any language — spill outside the restroom, long line at Gate C, someone needs help..."
          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition placeholder:text-slate-600"
        />
        <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
          <MediaAttach attached={mediaIds} onChange={setMediaIds} />
          <div className="text-xs text-slate-500">
            {text.length > 0 && `${text.length} chars · `}
            tap a category below to send
          </div>
        </div>
      </motion.section>

      {/* Location + accessibility, tucked below the star */}
      <section className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Where are you?</div>
          <select
            value={nodeHint}
            onChange={(e) => onNodeChange(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">(pick location — optional)</option>
            {sortedNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.type}: {n.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Accessibility</div>
          <AccessibilityDrawer me={me} onUpdate={setMe} />
        </div>
      </section>

      <AnimatePresence>
        {activeAtSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300"
          >
            💡 {activeAtSelected.distinct_observers.toLocaleString()} people already flagged something
            at this spot ({activeAtSelected.category}, {activeAtSelected.confidence_band}). Adding
            yours strengthens the signal.
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mb-6">
        <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">
          Tap a category to send
        </div>
        <CategoryGrid lang={lang} disabled={pending} onPick={pickCategory} />
        <AnimatePresence>
          {ack && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-4 p-3 bg-emerald-950/40 border border-emerald-700/50 rounded-lg text-sm"
            >
              ✓ {ack}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section>
        <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Live guidance</div>
        {nudges.length === 0 && (
          <div className="text-sm text-slate-500 italic">
            Nothing yet. When something happens near you, guidance appears here in your language.
          </div>
        )}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {nudges.map((n, i) => {
              const openAtNode = active.find((e) => e.id === n.nudge.event_id);
              return (
                <motion.div
                  key={`${n.nudge.event_id}-${n.at}`}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.25 }}
                >
                  <NudgeCard
                    nudge={n.nudge}
                    arrivedAt={n.at}
                    reporterCount={openAtNode?.distinct_observers}
                    nodesById={nodesById}
                    resolved={n.resolved}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
