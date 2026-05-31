// ─── Environment bindings ───────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AGENT_TOKEN: string;
  WEB_PASSWORD_INITIAL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

// ─── DB row types ────────────────────────────────────────────────────────────

export interface Server {
  machine_id: string;
  hostname: string;
  last_seen: number;
  status: 'idle' | 'connecting' | 'active';
  agent_version: string | null;
}

export interface ServerWithSession extends Server {
  link: string | null;
  session_created_at: number | null;
}

export interface Action {
  id: string;
  machine_id: string;
  type: ActionType;
  status: ActionStatus;
  created_at: number;
  expires_at: number;
}

export type ActionType = 'get_link' | 'kill' | 'recreate';
export type ActionStatus = 'pending' | 'dispatched' | 'done' | 'failed';

export interface Session {
  machine_id: string;
  link: string;
  created_at: number;
}

export interface ConfigRow {
  key: string;
  value: string;
}

export interface WebSession {
  token: string;
  created_at: number;
  expires_at: number;
}

// ─── API payload types ───────────────────────────────────────────────────────

export interface BeaconRequest {
  machine_id: string;
  hostname: string;
  status: 'idle' | 'connecting' | 'active';
  agent_version?: string;
}

export interface BeaconResponse {
  poll_interval: number;
  upterm_server: string;
  operator_authorized_key: string;
  actions: Array<{ id: string; type: ActionType }>;
}

export interface StatusRequest {
  machine_id: string;
  status: 'idle' | 'connecting' | 'active';
}

export interface AckRequest {
  machine_id: string;
}

export interface SessionReportRequest {
  machine_id: string;
  link: string;
  action_id: string;
}

export interface ActionReportRequest {
  machine_id: string;
  action_id: string;
  error: string;
}

export interface LoginRequest {
  password: string;
}

export interface CreateActionRequest {
  type: ActionType;
}

export interface PatchConfigRequest {
  idle_beacon_interval?: number;
  action_expiry_hours?: number;
  upterm_server?: string;
  operator_authorized_key?: string;
}

// ─── API response types ──────────────────────────────────────────────────────

export interface ServerResponse extends Server {
  online: boolean;
  link: string | null;
  session_created_at: number | null;
}

export interface ConfigResponse {
  idle_beacon_interval: number;
  action_expiry_hours: number;
  upterm_server: string;
  operator_authorized_key: string;
}
