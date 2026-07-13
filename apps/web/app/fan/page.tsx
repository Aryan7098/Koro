'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, SUPPORTED_LANGUAGES, label } from '../../lib/categories';
import {
  FanNudge,
  fanEventSource,
  fanSession,
  submitFanReport,
  venueGraph,
} from '../../lib/api';

type Node = { id: string; name: string; type: string; level: number };

export default function FanPage() {
  const [deviceFp, setDeviceFp] = useState<string | null>(null);
  const [lang, setLang] = useState<string>('en');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodeHint, setNodeHint] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [nudges, setNudges] = useState<FanNudge[]>([]);

  useEffect(() => {
    fanSession()
      .then((r) => setDeviceFp(r.device_fp))
      .catch(() => setDeviceFp('offline'));
    venueGraph()
      .then((g) => setNodes(g.nodes))
      .catch(() => setNodes([]));
  }, []);

  useEffect(() => {
    if (!deviceFp || deviceFp === 'offline') return;
    const es = fanEventSource(deviceFp);
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.type === 'fan.nudge' && parsed.data) {
          setNudges((cur) => [parsed.data as FanNudge, ...cur].slice(0, 12));
        }
      } catch {}
    });
    return () => es.close();
  }, [deviceFp]);

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
    [nodes]
  );

  async function submit(categoryId: string) {
    if (!deviceFp) return;
    setPending(true);
    setAck(null);
    try {
      const r = await submitFanReport({
        text: text || undefined,
        language: lang,
        category: categoryId,
        node_hint: nodeHint || undefined,
      });
      setAck(r.message);
      setText('');
    } catch (e: any) {
      setAck(`error: ${e.message}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Fan</h1>
        <div className="text-xs text-slate-500 mt-1">
          MetLife Stadium · session {deviceFp?.slice(0, 8) ?? '…'}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 mb-6">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">Language</div>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
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
            onChange={(e) => setNodeHint(e.target.value)}
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
      </section>

      <label className="block mb-4">
        <div className="text-xs text-slate-400 mb-1">Optional description</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. spill outside the restroom, huge line, someone needs help…"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2"
        />
      </label>

      <section className="grid grid-cols-2 gap-3 mb-6">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => submit(c.id)}
            disabled={pending}
            className={`p-4 rounded-lg border text-left transition ${
              c.safety_critical
                ? 'border-critical hover:bg-critical/10'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="text-lg font-medium">{label(c.id, lang)}</div>
            <div className="text-xs text-slate-500 mt-1">
              {c.safety_critical ? 'safety-critical' : `bias: ${c.severity_bias}`}
            </div>
          </button>
        ))}
      </section>

      {ack && (
        <div className="mb-6 p-3 bg-slate-800 rounded border border-slate-700 text-sm">
          {ack}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Live guidance</h2>
        {nudges.length === 0 && (
          <div className="text-sm text-slate-500">Nothing yet. Nudges appear here as they arrive.</div>
        )}
        <div className="space-y-3">
          {nudges.map((n, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-slate-700 bg-slate-900/40"
            >
              <div className="flex items-baseline justify-between text-xs text-slate-500 mb-1">
                <span>
                  {n.category} · {n.severity} · {n.band}
                </span>
                <span>{n.lang}</span>
              </div>
              <div className="font-semibold">{n.headline}</div>
              <div className="text-sm text-slate-300 mt-1">{n.body}</div>
              {n.action_hint && (
                <div className="text-sm text-emerald-400 mt-2">→ {n.action_hint}</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
