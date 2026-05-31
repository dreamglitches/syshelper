import type { Env, PatchConfigRequest, ConfigResponse } from '../types';
import { enableFK, getAllConfig, jsonOk, jsonError } from '../db';

// GET /api/config
export async function handleGetConfig(_request: Request, env: Env): Promise<Response> {
  const db = env.DB;
  await enableFK(db);

  const cfg = await getAllConfig(db);

  const response: ConfigResponse = {
    idle_beacon_interval: parseInt(cfg['idle_beacon_interval'] || '60'),
    action_expiry_hours: parseInt(cfg['action_expiry_hours'] || '24'),
    upterm_server: cfg['upterm_server'] || 'ssh://uptermd.upterm.dev:22',
    operator_authorized_key: cfg['operator_authorized_key'] || '',
  };

  return jsonOk(response);
}

// PATCH /api/config
export async function handlePatchConfig(request: Request, env: Env): Promise<Response> {
  let body: PatchConfigRequest;
  try {
    body = await request.json() as PatchConfigRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const errors: string[] = [];

  if (body.idle_beacon_interval !== undefined) {
    const v = body.idle_beacon_interval;
    if (!Number.isInteger(v) || v < 50) errors.push('idle_beacon_interval must be an integer ≥ 50');
  }
  if (body.action_expiry_hours !== undefined) {
    const v = body.action_expiry_hours;
    if (!Number.isInteger(v) || v < 1) errors.push('action_expiry_hours must be an integer ≥ 1');
  }
  if (body.upterm_server !== undefined) {
    if (typeof body.upterm_server !== 'string' || !body.upterm_server.startsWith('ssh://')) {
      errors.push('upterm_server must start with ssh://');
    }
  }
  if (body.operator_authorized_key !== undefined) {
    const k = body.operator_authorized_key;
    if (typeof k !== 'string' || (k !== '' && !k.startsWith('ssh-'))) {
      errors.push('operator_authorized_key must start with ssh- or be empty');
    }
  }

  if (errors.length > 0) return jsonError(errors.join('; '), 400);

  const db = env.DB;
  await enableFK(db);

  const updates: Array<[string, string]> = [];
  if (body.idle_beacon_interval !== undefined) updates.push(['idle_beacon_interval', String(body.idle_beacon_interval)]);
  if (body.action_expiry_hours !== undefined) updates.push(['action_expiry_hours', String(body.action_expiry_hours)]);
  if (body.upterm_server !== undefined) updates.push(['upterm_server', body.upterm_server]);
  if (body.operator_authorized_key !== undefined) updates.push(['operator_authorized_key', body.operator_authorized_key]);

  // Batch updates
  await db.batch(updates.map(([k, v]) =>
    db.prepare('UPDATE config SET value = ? WHERE key = ?').bind(v, k)
  ));

  return jsonOk({ ok: true });
}
