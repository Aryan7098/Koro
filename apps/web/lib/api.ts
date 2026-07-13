// Thin client for the FastAPI backend. Uses relative paths so the Next.js
// rewrite in next.config.mjs proxies /api/* to :8000 in dev.
const BASE = '/api';

export type FanNudge = {
  event_id: string;
  category: string;
  severity: string;
  band: string;
  node_id: string;
  lang: string;
  headline: string;
  body: string;
  action_hint?: string;
  next_node_id?: string | null;
};

export type ActiveEvent = {
  id: string;
  node_id: string;
  category: string;
  severity: string;
  confidence_band: string;
  confidence_score: number;
  status: string;
  canonical_summary: string | null;
  first_seen: string | null;
  last_seen: string | null;
  source_mix: Record<string, unknown>;
  distinct_observers: number;
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

export async function fanSession(): Promise<{ device_fp: string }> {
  return req('/auth/fan-session', { method: 'POST', body: '{}' });
}

export async function login(username: string): Promise<{ access_token: string; user: any }> {
  return req('/auth/login', { method: 'POST', body: JSON.stringify({ username }) });
}

export async function submitFanReport(body: {
  text?: string;
  language?: string;
  category?: string;
  node_hint?: string;
  seat_hint?: string;
}): Promise<{ report_id: string; status: string; message: string }> {
  return req('/reports/fan', { method: 'POST', body: JSON.stringify(body) });
}

export async function listActiveEvents(): Promise<ActiveEvent[]> {
  return req('/reports/events/active');
}

export async function venueGraph(): Promise<any> {
  return req('/venue/graph');
}

export function fanEventSource(deviceFp: string, userId?: string): EventSource {
  const q = new URLSearchParams(userId ? { user_id: userId } : { device_fp: deviceFp });
  return new EventSource(`${BASE}/realtime/fan?${q.toString()}`);
}
