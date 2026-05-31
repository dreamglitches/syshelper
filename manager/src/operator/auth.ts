import bcrypt from 'bcryptjs';
import type { Env, LoginRequest } from '../types';
import { enableFK, jsonOk, jsonError } from '../db';

// One-time init guard flag (module-level, per isolate lifetime)
let initialized = false;

/**
 * Seed the auth table with the initial password on first cold start.
 * The CHECK (id = 1) constraint prevents concurrent double-inserts.
 */
export async function ensureAuthInit(env: Env): Promise<void> {
  if (initialized) return;
  initialized = true;

  await enableFK(env.DB);
  const existing = await env.DB
    .prepare('SELECT id FROM auth WHERE id = 1')
    .first();

  if (!existing && env.WEB_PASSWORD_INITIAL) {
    const hash = await bcrypt.hash(env.WEB_PASSWORD_INITIAL, 10);
    await env.DB
      .prepare('INSERT OR IGNORE INTO auth (id, web_password) VALUES (1, ?)')
      .bind(hash)
      .run();
  }
}

// POST /auth/login
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginRequest;
  try {
    body = await request.json() as LoginRequest;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  if (typeof body.password !== 'string' || !body.password) {
    return jsonError('Invalid password', 400);
  }

  const db = env.DB;
  await enableFK(db);

  const row = await db
    .prepare('SELECT web_password FROM auth WHERE id = 1')
    .first<{ web_password: string }>();

  if (!row) {
    // Add artificial delay to prevent timing attacks
    await sleep(200);
    return jsonError('Unauthorized', 401);
  }

  const match = await bcrypt.compare(body.password, row.web_password);
  if (!match) {
    await sleep(200);
    return jsonError('Unauthorized', 401);
  }

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Lazy cleanup of expired sessions
  await db
    .prepare('DELETE FROM web_sessions WHERE expires_at < ?')
    .bind(now)
    .run();

  // Create new session
  const token = crypto.randomUUID();
  await db
    .prepare('INSERT INTO web_sessions (token, created_at, expires_at) VALUES (?, ?, ?)')
    .bind(token, now, now + sevenDays)
    .run();

  // No explicit Domain — defaults to issuing origin, works correctly via Pages proxy
  const cookie = `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 3600}`;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}

// POST /auth/logout
export async function handleLogout(_request: Request, env: Env, token: string): Promise<Response> {
  await env.DB
    .prepare('DELETE FROM web_sessions WHERE token = ?')
    .bind(token)
    .run();

  const clearCookie = `session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie,
    },
  });
}

// POST /auth/change-password  (web UI)
export async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  let body: { password: string };
  try {
    body = await request.json() as { password: string };
  } catch {
    return jsonError('Invalid JSON', 400);
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return jsonError('Password must be at least 8 characters', 400);
  }

  const hash = await bcrypt.hash(body.password, 10);
  await enableFK(env.DB);
  await env.DB
    .prepare('UPDATE auth SET web_password = ? WHERE id = 1')
    .bind(hash)
    .run();

  return jsonOk({ ok: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
