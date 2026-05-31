import type { Env } from './types';
import { jsonError } from './db';
import { agentAuth } from './middleware/agentAuth';
import { webAuth } from './middleware/webAuth';
import { ensureAuthInit, handleLogin, handleLogout, handleChangePassword } from './operator/auth';
import { handleBeacon } from './agent/beacon';
import { handleStatus } from './agent/status';
import { handleAck, handleReport } from './agent/actions';
import { handleSessionCreate, handleSessionClear } from './agent/sessions';
import { handleGetServers, handleCreateAction, handleGetSession } from './operator/servers';
import { handleGetConfig, handlePatchConfig } from './operator/config';
import { handleTelegramWebhook } from './telegram/webhook';
import { handleExpiry } from './cron/expiry';

export default {
  // ─── HTTP handler ──────────────────────────────────────────────────────────
  async fetch(request: Request, env: Env): Promise<Response> {
    // Seed auth table on cold start
    await ensureAuthInit(env);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── Telegram webhook ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/telegram') {
      return handleTelegramWebhook(request, env);
    }

    // ── Auth (no session required) ──────────────────────────────────────────
    if (method === 'POST' && path === '/auth/login') {
      return handleLogin(request, env);
    }

    // ── Agent routes (bearer token auth) ───────────────────────────────────
    if (path.startsWith('/beacon') || path.startsWith('/status') ||
        path.startsWith('/actions') || path.startsWith('/sessions')) {
      const authErr = agentAuth(request, env);
      if (authErr) return authErr;

      // POST /beacon
      if (method === 'POST' && path === '/beacon') {
        return handleBeacon(request, env);
      }
      // POST /status
      if (method === 'POST' && path === '/status') {
        return handleStatus(request, env);
      }
      // POST /actions/report
      if (method === 'POST' && path === '/actions/report') {
        return handleReport(request, env);
      }
      // POST /actions/:id/ack
      const ackMatch = path.match(/^\/actions\/([^/]+)\/ack$/);
      if (method === 'POST' && ackMatch) {
        return handleAck(request, env, ackMatch[1]);
      }
      // POST /sessions
      if (method === 'POST' && path === '/sessions') {
        return handleSessionCreate(request, env);
      }
      // POST /sessions/:machine_id/clear
      const clearMatch = path.match(/^\/sessions\/([^/]+)\/clear$/);
      if (method === 'POST' && clearMatch) {
        return handleSessionClear(request, env, clearMatch[1]);
      }
    }

    // ── Operator routes (session cookie auth) ───────────────────────────────
    if (path.startsWith('/api/') || path === '/auth/logout' || path === '/auth/change-password') {
      const authResult = await webAuth(request, env);
      if (authResult instanceof Response) return authResult;
      const { token } = authResult;

      // POST /auth/logout
      if (method === 'POST' && path === '/auth/logout') {
        return handleLogout(request, env, token);
      }
      // POST /auth/change-password
      if (method === 'POST' && path === '/auth/change-password') {
        return handleChangePassword(request, env);
      }
      // GET /api/servers
      if (method === 'GET' && path === '/api/servers') {
        return handleGetServers(request, env);
      }
      // POST /api/servers/:machine_id/actions
      const createActionMatch = path.match(/^\/api\/servers\/([^/]+)\/actions$/);
      if (method === 'POST' && createActionMatch) {
        return handleCreateAction(request, env, createActionMatch[1]);
      }
      // GET /api/servers/:machine_id/session
      const sessionMatch = path.match(/^\/api\/servers\/([^/]+)\/session$/);
      if (method === 'GET' && sessionMatch) {
        return handleGetSession(request, env, sessionMatch[1]);
      }
      // GET /api/config
      if (method === 'GET' && path === '/api/config') {
        return handleGetConfig(request, env);
      }
      // PATCH /api/config
      if (method === 'PATCH' && path === '/api/config') {
        return handlePatchConfig(request, env);
      }
    }

    return jsonError('Not found', 404);
  },

  // ─── Cron handler ──────────────────────────────────────────────────────────
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleExpiry(env);
  },
} satisfies ExportedHandler<Env>;
