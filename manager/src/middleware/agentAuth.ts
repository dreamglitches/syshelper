import type { Env } from '../types';
import { jsonError } from '../db';

/**
 * Middleware: verify Agent bearer token.
 * Returns null on success, error Response on failure.
 */
export function agentAuth(request: Request, env: Env): Response | null {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== env.AGENT_TOKEN) {
    return jsonError('Unauthorized', 401);
  }
  return null;
}
