import type { Env, BeaconRequest, BeaconResponse, Server } from '../types';
import { enableFK, getConfig, isOnline, jsonOk, jsonError, validateMachineId, validateHostname, validateAgentStatus } from '../db';
import { sendTelegram } from '../telegram/notify';

export async function handleBeacon(request: Request, env: Env): Promise<Response> {
  let body: BeaconRequest;
  try {
    body = await request.json() as BeaconRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { machine_id, hostname, status, agent_version } = body;

  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);
  if (!validateHostname(hostname)) return jsonError('Invalid hostname', 400);
  if (!validateAgentStatus(status)) return jsonError('Invalid status', 400);
  if (agent_version !== undefined && (typeof agent_version !== 'string' || agent_version.length > 32)) {
    return jsonError('Invalid agent_version', 400);
  }

  const db = env.DB;
  await enableFK(db);

  const now = Date.now();

  // Read existing record before upsert
  const existing = await db
    .prepare('SELECT * FROM servers WHERE machine_id = ?')
    .bind(machine_id)
    .first<Server>();

  const isNew = !existing;
  const idleInterval = parseInt(await getConfig(db, 'idle_beacon_interval') || '60');
  const wasOffline = existing ? !isOnline(existing, idleInterval) : false;

  // Upsert server
  await db
    .prepare(
      `INSERT INTO servers (machine_id, hostname, last_seen, status, agent_version)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(machine_id) DO UPDATE SET
         hostname = excluded.hostname,
         last_seen = excluded.last_seen,
         status = excluded.status,
         agent_version = excluded.agent_version`
    )
    .bind(machine_id, hostname, now, status, agent_version ?? null)
    .run();

  // Expire stale actions
  await db
    .prepare(`UPDATE actions SET status = 'failed' WHERE machine_id = ? AND status IN ('pending','dispatched') AND expires_at < ?`)
    .bind(machine_id, now)
    .run();

  // Find one pending action
  const action = await db
    .prepare(
      `SELECT id, type FROM actions
       WHERE machine_id = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at ASC LIMIT 1`
    )
    .bind(machine_id, now)
    .first<{ id: string; type: string }>();

  // Read config
  const uptermServer = await getConfig(db, 'upterm_server');
  const operatorKey = await getConfig(db, 'operator_authorized_key');

  // Fire-and-forget Telegram notifications
  if (isNew) {
    sendTelegram(env, `🆕 New server: <b>${hostname}</b> (<code>${machine_id.slice(0, 8)}</code>)`);
  } else if (wasOffline) {
    sendTelegram(env, `🟢 <b>${hostname}</b> is back online`);
  }

  const pollInterval = status === 'active' ? 300 : idleInterval;

  const response: BeaconResponse = {
    poll_interval: pollInterval,
    upterm_server: uptermServer,
    operator_authorized_key: operatorKey,
    actions: action ? [{ id: action.id, type: action.type as 'get_link' | 'kill' | 'recreate' }] : [],
  };

  return jsonOk(response);
}
