import type { Env, AckRequest, ActionReportRequest } from '../types';
import { enableFK, jsonOk, jsonError, validateMachineId } from '../db';
import { sendTelegram } from '../telegram/notify';

// POST /actions/:id/ack
export async function handleAck(
  request: Request,
  env: Env,
  actionId: string
): Promise<Response> {
  let body: AckRequest;
  try {
    body = await request.json() as AckRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { machine_id } = body;
  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);

  const db = env.DB;
  await enableFK(db);

  // Verify the action belongs to this machine
  const action = await db
    .prepare('SELECT machine_id FROM actions WHERE id = ?')
    .bind(actionId)
    .first<{ machine_id: string }>();

  if (!action) return jsonError('Action not found', 404);
  if (action.machine_id !== machine_id) return jsonError('Forbidden', 403);

  await db
    .prepare(`UPDATE actions SET status = 'dispatched' WHERE id = ?`)
    .bind(actionId)
    .run();

  return jsonOk({ ok: true });
}

// POST /actions/report
export async function handleReport(request: Request, env: Env): Promise<Response> {
  let body: ActionReportRequest;
  try {
    body = await request.json() as ActionReportRequest;
    console.log("body: ", body)
  } catch {
    console.log("report error")
    return jsonError('Invalid JSON', 400);
  }

  const { machine_id, action_id, error } = body;
  if (!validateMachineId(machine_id)) return jsonError('Invalid machine_id', 400);
  if (typeof action_id !== 'string' || !action_id) return jsonError('Invalid action_id', 400);
  if (typeof error !== 'string') return jsonError('Invalid error', 400);

  const db = env.DB;
  await enableFK(db);

  const newStatus = error === '' ? 'done' : 'failed';
  await db
    .prepare(`UPDATE actions SET status = ? WHERE id = ? AND machine_id = ?`)
    .bind(newStatus, action_id, machine_id)
    .run();

  // Notify on error only
  if (error !== '') {
    const server = await db
      .prepare('SELECT hostname FROM servers WHERE machine_id = ?')
      .bind(machine_id)
      .first<{ hostname: string }>();
    const hostname = server?.hostname ?? machine_id.slice(0, 8);
    sendTelegram(env, `⚠️ <b>${hostname}</b> failed: ${error}`);
  }

  return jsonOk({ ok: true });
}
