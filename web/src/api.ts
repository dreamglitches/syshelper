// Typed fetch wrappers for all Syshelper API endpoints.
// All paths are relative — resolved via Pages _redirects or Vite proxy.

export interface Server {
  machine_id: string;
  hostname: string;
  last_seen: number;
  status: 'idle' | 'connecting' | 'active';
  agent_version: string | null;
  online: boolean;
  link: string | null;
  session_created_at: number | null;
}

export interface Action {
  id: string;
  machine_id: string;
  type: 'get_link' | 'kill' | 'recreate';
  status: 'pending' | 'dispatched' | 'done' | 'failed';
  created_at: number;
  expires_at: number;
}

export interface Config {
  idle_beacon_interval: number;
  action_expiry_hours: number;
  upterm_server: string;
  operator_authorized_key: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(password: string): Promise<void> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Invalid password');
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' });
}

export async function changePassword(password: string): Promise<void> {
  const res = await fetch('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error: string };
    throw new Error(body.error);
  }
}

// ─── Servers ──────────────────────────────────────────────────────────────────

export async function getServers(): Promise<Server[]> {
  const res = await fetch('/api/servers');
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to fetch servers');
  return res.json() as Promise<Server[]>;
}

export async function queueAction(
  machine_id: string,
  type: 'get_link' | 'kill' | 'recreate'
): Promise<Action> {
  const res = await fetch(`/api/servers/${machine_id}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to queue action');
  return res.json() as Promise<Action>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<Config> {
  const res = await fetch('/api/config');
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json() as Promise<Config>;
}

export async function patchConfig(patch: Partial<Config>): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error: string };
    throw new Error(body.error);
  }
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'AuthError';
  }
}
