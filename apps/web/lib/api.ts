// Thin client for the FastAPI backend.
//
// - In production (Vercel), set NEXT_PUBLIC_API_BASE_URL to the backend URL
//   (e.g. https://echostand-api.fly.dev). All fetches + SSE go direct,
//   bypassing Vercel's rewrite (better for long-lived SSE connections).
// - In dev, leave NEXT_PUBLIC_API_BASE_URL unset. The Next.js rewrite in
//   next.config.mjs sends /api/* to http://localhost:8000.
const BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  '/api';

// ---------- shared types -------------------------------------------------

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
  planned_route?: {
    from: string;
    to: string;
    node_path: string[];
    node_names: string[];
    distance_m: number;
    step_free: boolean;
    low_stimulus: boolean;
    reason: string;
  };
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

export type VenueNode = {
  id: string;
  name: string;
  type: string;
  level: number;
  step_free: boolean;
  low_stimulus: boolean;
  is_open: boolean;
  lat: number;
  lng: number;
};

export type Me = {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  tier: string;
  language: string;
  accessibility_profile: { mobility?: boolean; sensory?: boolean };
  home_node_id: string | null;
  zone: string | null;
  category_ownership: string[];
};

// ---------- token storage ------------------------------------------------

const TOKEN_KEY = 'echostand:token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ---------- request helper -----------------------------------------------

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token && !headers.authorization) headers.authorization = `bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

// ---------- auth ---------------------------------------------------------

export async function fanSession(): Promise<{ device_fp: string }> {
  return req('/auth/fan-session', { method: 'POST', body: '{}' });
}

export async function login(username: string): Promise<{ access_token: string; user: Me }> {
  const r = await req<{ access_token: string; user: Me }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  setToken(r.access_token);
  return r;
}

export function logout(): void {
  setToken(null);
}

export async function me(): Promise<Me | null> {
  if (!getToken()) return null;
  try {
    return await req<Me>('/auth/me');
  } catch {
    return null;
  }
}

export async function patchMe(patch: {
  language?: string;
  home_node_id?: string | null;
  accessibility_profile?: { mobility?: boolean; sensory?: boolean };
}): Promise<Partial<Me>> {
  return req('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

// ---------- reports ------------------------------------------------------

export async function submitFanReport(body: {
  text?: string;
  language?: string;
  category?: string;
  node_hint?: string;
  seat_hint?: string;
  media_ids?: string[];
}): Promise<{ report_id: string; status: string; message: string }> {
  return req('/reports/fan', { method: 'POST', body: JSON.stringify(body) });
}

export async function listActiveEvents(): Promise<ActiveEvent[]> {
  return req('/reports/events/active');
}

// ---------- venue --------------------------------------------------------

export async function venueGraph(): Promise<{ nodes: VenueNode[]; edges: any[] }> {
  return req('/venue/graph');
}

export async function planRoute(params: {
  from_id: string;
  category?: string;
  avoid_id?: string;
  mobility?: boolean;
  sensory?: boolean;
}): Promise<{
  from_id: string;
  to_id: string | null;
  node_path: string[];
  node_names: string[];
  distance_m: number;
  step_free: boolean;
  low_stimulus: boolean;
  accessibility: { mobility: boolean; sensory: boolean };
  reason: string;
}> {
  const qs = new URLSearchParams();
  qs.set('from_id', params.from_id);
  if (params.category) qs.set('category', params.category);
  if (params.avoid_id) qs.set('avoid_id', params.avoid_id);
  if (params.mobility) qs.set('mobility', 'true');
  if (params.sensory) qs.set('sensory', 'true');
  return req(`/venue/plan?${qs.toString()}`);
}

// ---------- media --------------------------------------------------------

export async function uploadMedia(file: File): Promise<{ media_id: string; content_type: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const res = await fetch(`${BASE}/media`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: token ? { authorization: `bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

// ---------- SSE ----------------------------------------------------------

export function fanEventSource(deviceFp: string | null, userId?: string | null): EventSource {
  const params: Record<string, string> = {};
  if (userId) params.user_id = userId;
  else if (deviceFp) params.device_fp = deviceFp;
  const qs = new URLSearchParams(params).toString();
  return new EventSource(`${BASE}/realtime/fan?${qs}`);
}

// EventSource does not send Authorization headers — we pass user_id in the
// query string and let the SSE endpoint scope by that (it is a bus key, not
// an auth check). For hackathon fidelity that's enough.
export function staffEventSource(userId: string): EventSource {
  return new EventSource(`${BASE}/realtime/staff?user_id=${encodeURIComponent(userId)}`);
}

// ---------- staff --------------------------------------------------------

export type StaffEvent = {
  id: string;
  node_id: string;
  category: string;
  severity: string;
  confidence_band: string;
  confidence_score: number;
  status: string;
  canonical_summary: string | null;
  severity_reason: string | null;
  source_mix: Record<string, unknown>;
  distinct_observers: number;
  first_seen: string | null;
  last_seen: string | null;
  resolved_at: string | null;
};

export type PendingAuth = {
  auth_id: string;
  created_at: string | null;
  proposed_action: Record<string, unknown>;
  evidence: Record<string, unknown>;
  event: StaffEvent;
};

export type EventLineage = {
  event: StaffEvent;
  reports: Array<{
    id: string;
    source: string;
    source_user_id: string | null;
    device_fp: string | null;
    raw_text: string | null;
    raw_language: string | null;
    category_hint: string | null;
    node_hint: string | null;
    normalized: Record<string, unknown> | null;
    confirm_value: string | null;
    created_at: string | null;
  }>;
  ledger: Array<{
    id: string;
    action: string;
    actor_user_id: string | null;
    report_ids: string[];
    payload: Record<string, unknown>;
    notes: string | null;
    created_at: string | null;
  }>;
};

export async function staffQueue(): Promise<StaffEvent[]> {
  return req('/staff/queue');
}

export async function staffAuthorizeQueue(): Promise<PendingAuth[]> {
  return req('/staff/authorize');
}

export async function staffResolveQueue(): Promise<StaffEvent[]> {
  return req('/staff/resolve');
}

export async function approveAuth(authId: string, reason?: string) {
  return req(`/staff/authorize/${authId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

export async function denyAuth(authId: string, reason?: string) {
  return req(`/staff/authorize/${authId}/deny`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

export async function resolveEvent(eventId: string, reason?: string) {
  return req(`/staff/events/${eventId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

export async function dispatchEvent(eventId: string, reason?: string) {
  return req(`/staff/events/${eventId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

export async function dismissEvent(eventId: string, reason?: string) {
  return req(`/staff/events/${eventId}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

export async function eventLineage(eventId: string): Promise<EventLineage> {
  return req(`/events/${eventId}/lineage`);
}

// ---------- volunteer ----------------------------------------------------

export type VolunteerTask = {
  id: string;
  node_id: string;
  category: string;
  severity: string;
  confidence_band: string;
  status: string;
  canonical_summary: string | null;
  distinct_observers: number;
  source_mix: Record<string, unknown>;
  first_seen: string | null;
  last_seen: string | null;
  completion: {
    count: number;
    latest_text: string | null;
    latest_at: string | null;
    media_ids: string[];
  } | null;
  recent_reports: Array<{
    text: string;
    language: string | null;
    source: string;
    at: string | null;
  }>;
};

export type VolunteerTasksResponse = {
  verify: VolunteerTask[];
  active: VolunteerTask[];
};

export type VolunteerScript = {
  event_id: string;
  category: string;
  severity: string;
  band: string;
  node_id: string;
  needs_verification: boolean;
  verify_prompt?: string;
  do: string[];
  say: string;
  at?: string;
};

export async function volunteerTasks(): Promise<VolunteerTasksResponse> {
  return req('/volunteer/tasks');
}

export async function volunteerComplete(
  eventId: string,
  body: { text: string; media_ids?: string[] }
): Promise<{ report_id: string; event_id: string; status: string; message: string }> {
  return req(`/volunteer/events/${eventId}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function volunteerScripts(): Promise<VolunteerScript[]> {
  return req('/volunteer/scripts');
}

export async function volunteerConfirm(eventId: string, note?: string) {
  return req('/volunteer/confirm', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, note: note || null }),
  });
}

export async function volunteerDeny(eventId: string, note?: string) {
  return req('/volunteer/deny', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, note: note || null }),
  });
}

export function volunteerEventSource(userId: string): EventSource {
  return new EventSource(`${BASE}/realtime/volunteer?user_id=${encodeURIComponent(userId)}`);
}

export function organizerEventSource(): EventSource {
  return new EventSource(`${BASE}/realtime/organizer`);
}

// ---------- organizer ----------------------------------------------------

export type OrganizerMetrics = {
  window_hours: number;
  events_seen: number;
  events_open: number;
  events_resolved: number;
  events_dismissed: number;
  pending_authorizations: number;
  loop_closure_notifications: number;
  avg_time_to_confirmed_seconds: number | null;
  manipulation_suppressed: number;
};

export type Pattern = {
  category: string;
  node_id: string;
  count: number;
  resolved: number;
  confirmed: number;
  avg_severity_score: number;
};

export type OrganizerLive = {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    lat: number;
    lng: number;
    level: number;
    is_open: boolean;
  }>;
  events: Array<{
    id: string;
    node_id: string;
    category: string;
    severity: string;
    confidence_band: string;
    status: string;
    distinct_observers: number;
    canonical_summary: string | null;
  }>;
};

export async function organizerMetrics(): Promise<OrganizerMetrics> {
  return req('/organizer/metrics');
}
export async function organizerPatterns(): Promise<Pattern[]> {
  return req('/organizer/patterns');
}
export async function organizerLive(): Promise<OrganizerLive> {
  return req('/organizer/live');
}

// ---------- simulator ----------------------------------------------------

export async function listScenarios(): Promise<Array<{
  name: string;
  description: string | null;
  steps: number;
}>> {
  return req('/simulator/scenarios');
}

export async function runScenario(name: string) {
  return req('/simulator/run', { method: 'POST', body: JSON.stringify({ name }) });
}
export async function stopScenario() {
  return req('/simulator/stop', { method: 'POST', body: '{}' });
}
export async function simulatorStatus(): Promise<{
  running: boolean;
  scenario_name: string | null;
  started_at: string | null;
  steps_total: number;
  steps_completed: number;
  last_error: string | null;
  log: Array<Record<string, unknown>>;
}> {
  return req('/simulator/status');
}
export async function simulatorInject(kind: string, payload: Record<string, unknown>) {
  return req('/simulator/inject', {
    method: 'POST',
    body: JSON.stringify({ kind, payload }),
  });
}
