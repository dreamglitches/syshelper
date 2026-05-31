import type { Env, ServerWithSession, ServerResponse, CreateActionRequest } from '../types';
import { enableFK, getConfig, isOnline, jsonOk, jsonError, validateActionType } from '../db';

// GET /api/servers
export async function handleGetServers(_request: Request, env: Env): Promise<Response> {
  const db = env.DB;
  await enableFK(db);

  const idleInterval = parseInt(await getConfig(db, 'idle_beacon_interval') || '60');

  const rows = await db
    .prepare(
      `SELECT s.machine_id, s.hostname, s.last_seen, s.status, s.agent_version,
              sess.link, sess.created_at as session_created_at
       FROM servers s
       LEFT JOIN sessions sess ON s.machine_id = sess.machine_id
       ORDER BY s.last_seen DESC
       LIMIT 500`
    )
    .all<ServerWithSession>();

  const servers: ServerResponse[] = rows.results.map(s => ({
    ...s,
    online: isOnline(s, idleInterval),
  }));

  return jsonOk(servers);
}

// POST /api/servers/:machine_id/actions
export async function handleCreateAction(
  request: Request,
  env: Env,
  machine_id: string
): Promise<Response> {
  let body: CreateActionRequest;
  try {
    body = await request.json() as CreateActionRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  if (!validateActionType(body.type)) return jsonError('Invalid action type', 400);

  const db = env.DB;
  await enableFK(db);

  // Verify server exists
  const server = await db
    .prepare('SELECT machine_id FROM servers WHERE machine_id = ?')
    .bind(machine_id)
    .first();
  if (!server) return jsonError('Server not found', 404);

  // Cancel any existing pending/dispatched action
  await db
    .prepare(`UPDATE actions SET status = 'failed' WHERE machine_id = ? AND status IN ('pending','dispatched')`)
    .bind(machine_id)
    .run();

  const expiryHours = parseInt(await getConfig(db, 'action_expiry_hours') || '24');
  const now = Date.now();
  const id = crypto.randomUUID();
  const expires_at = now + expiryHours * 3600 * 1000;

  // Single INSERT ... RETURNING to avoid a second SELECT
  const action = await db
    .prepare(
      `INSERT INTO actions (id, machine_id, type, status, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       RETURNING *`
    )
    .bind(id, machine_id, body.type, now, expires_at)
    .first();

  return jsonOk(action, 201);
}

// GET /api/servers/:machine_id/session
export async function handleGetSession(
  _request: Request,
  env: Env,
  machine_id: string
): Promise<Response> {
  const db = env.DB;
  await enableFK(db);

  const session = await db
    .prepare('SELECT link, created_at FROM sessions WHERE machine_id = ?')
    .bind(machine_id)
    .first<{ link: string; created_at: number }>();

  if (!session) return jsonError('No active session', 404);
  return jsonOk(session);
}
