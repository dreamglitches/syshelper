import type { Env, StatusRequest } from '../types';
import { enableFK, jsonOk, jsonError, validateMachineId, validateAgentStatus } from '../db';

export async function handleStatus(request: Request, env: Env): Promise<Response> {
  let body: StatusRequest;
  try {
    body = await request.json() as StatusRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { machine_id, status } = body;

  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);
  if (!validateAgentStatus(status)) return jsonError('Invalid status', 400);

  const db = env.DB;
  await enableFK(db);

  // Guard: machine must have beaconed first
  const exists = await db
    .prepare('SELECT machine_id FROM servers WHERE machine_id = ?')
    .bind(machine_id)
    .first();

  if (!exists) return jsonError('Not found', 404);

  await db
    .prepare('UPDATE servers SET status = ?, last_seen = ? WHERE machine_id = ?')
    .bind(status, Date.now(), machine_id)
    .run();

  return jsonOk({ ok: true });
}
