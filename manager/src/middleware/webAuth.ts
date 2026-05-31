import type { Env } from '../types';
import { jsonError } from '../db';

/**
 * Middleware: verify web session cookie against web_sessions table.
 * Returns the session token on success, error Response on failure.
 */
export async function webAuth(
  request: Request,
  env: Env
): Promise<{ token: string } | Response> {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const token = parseCookie(cookieHeader, 'session');
  if (!token) {
    return jsonError('Unauthorized', 401);
  }

  const row = await env.DB.prepare(
    'SELECT token FROM web_sessions WHERE token = ? AND expires_at > ?'
  )
    .bind(token, Date.now())
    .first<{ token: string }>();

  if (!row) {
    return jsonError('Unauthorized', 401);
  }

  return { token: row.token };
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return v.join('=').trim();
  }
  return null;
}
