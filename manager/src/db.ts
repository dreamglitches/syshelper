import type { Server } from './types';

// ─── FK pragma ───────────────────────────────────────────────────────────────

/**
 * Must be called at the start of every request handler before any DB operation.
 * D1 disables foreign key enforcement by default.
 */
export async function enableFK(db: D1Database): Promise<void> {
  await db.prepare('PRAGMA foreign_keys = ON').run();
}

// ─── Config helpers ───────────────────────────────────────────────────────────

export async function getConfig(db: D1Database, key: string): Promise<string> {
  const row = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? '';
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('UPDATE config SET value = ? WHERE key = ?')
    .bind(value, key)
    .run();
}

export async function getAllConfig(
  db: D1Database
): Promise<Record<string, string>> {
  const result = await db.prepare('SELECT key, value FROM config').all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of result.results) {
    map[row.key] = row.value;
  }
  return map;
}

// ─── Offline detection ────────────────────────────────────────────────────────

/**
 * Offline is never stored — computed at read time only.
 * active threshold: 300s × 2.5 = 12.5 min
 * idle threshold:   idleInterval × 2.5
 */
export function isOnline(server: Server, idleInterval: number): boolean {
  const intervalSec = server.status === 'active' ? 300 : idleInterval;
  const thresholdMs = intervalSec * 2.5 * 1000;
  return Date.now() - server.last_seen < thresholdMs;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Input validation ─────────────────────────────────────────────────────────

export function validateMachineId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64;
}

export function validateHostname(h: unknown): h is string {
  return typeof h === 'string' && h.length > 0 && h.length <= 253;
}

export function validateAgentStatus(s: unknown): s is 'idle' | 'connecting' | 'active' {
  return s === 'idle' || s === 'connecting' || s === 'active';
}

export function validateActionType(t: unknown): t is 'get_link' | 'kill' | 'recreate' {
  return t === 'get_link' || t === 'kill' || t === 'recreate';
}
