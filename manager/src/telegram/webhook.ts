import bcrypt from 'bcryptjs';
import type { Env, Server } from '../types';
import { enableFK, getConfig, setConfig, isOnline } from '../db';
import { replyTelegram, deleteTelegramMessage } from './notify';

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: string | number };
    text?: string;
  };
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // Verify webhook secret
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    console.error("Invalid secret")
    return new Response('OK', { status: 200 }); // silent reject
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    console.error("Invalid JSON")
    return new Response('OK', { status: 200 });
  }

  const msg = update.message;
  if (!msg || !msg.text) return new Response('OK', { status: 200 });

  // Verify chat_id
  if (String(msg.chat.id) !== String(env.TELEGRAM_CHAT_ID)) {
    console.error("Invalid chat_id")
    return new Response('OK', { status: 200 }); // silent reject
  }

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const [cmd, ...args] = text.split(/\s+/);

  await enableFK(env.DB);

  try {
    await dispatch(cmd.toLowerCase(), args, chatId, msg.message_id, env);
  } catch (e) {
    await replyTelegram(env, chatId, `❌ Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return new Response('OK', { status: 200 });
}

async function dispatch(
  cmd: string,
  args: string[],
  chatId: string,
  messageId: number,
  env: Env
): Promise<void> {
  const db = env.DB;

  switch (cmd) {
    case '/servers': {
      const idleInterval = parseInt(await getConfig(db, 'idle_beacon_interval') || '60');
      const rows = await db
        .prepare(
          `SELECT s.*, sess.link FROM servers s
           LEFT JOIN sessions sess ON s.machine_id = sess.machine_id
           ORDER BY s.last_seen DESC LIMIT 50`
        )
        .all<Server & { link: string | null }>();

      if (rows.results.length === 0) {
        await replyTelegram(env, chatId, 'No servers registered.');
        return;
      }

      const lines = rows.results.map(s => {
        const online = isOnline(s, idleInterval);
        const dot = online ? '🟢' : '🔴';
        const badge = s.status === 'active' ? '📡' : s.status === 'connecting' ? '⏳' : '💤';
        return `${dot} <b>${s.hostname}</b> ${badge} <code>${s.machine_id.slice(0, 8)}</code>`;
      });
      await replyTelegram(env, chatId, lines.join('\n'));
      break;
    }

    case '/status': {
      const idleInterval = parseInt(await getConfig(db, 'idle_beacon_interval') || '60');
      const rows = await db.prepare('SELECT * FROM servers').all<Server>();
      const total = rows.results.length;
      const online = rows.results.filter(s => isOnline(s, idleInterval)).length;
      const active = rows.results.filter(s => s.status === 'active').length;
      await replyTelegram(env, chatId,
        `📊 <b>Status</b>\nTotal: ${total} | Online: ${online} | Offline: ${total - online} | Active sessions: ${active}`
      );
      break;
    }

    case '/connect':
    case '/kill':
    case '/recreate': {
      const hostname = args[0];
      if (!hostname) { await replyTelegram(env, chatId, `Usage: ${cmd} &lt;hostname&gt;`); return; }
      const server = await db
        .prepare('SELECT machine_id FROM servers WHERE hostname = ?')
        .bind(hostname)
        .first<{ machine_id: string }>();
      if (!server) { await replyTelegram(env, chatId, `❌ Server <b>${hostname}</b> not found`); return; }

      const type = cmd === '/connect' ? 'get_link' : cmd === '/kill' ? 'kill' : 'recreate';
      await db
        .prepare(`UPDATE actions SET status = 'failed' WHERE machine_id = ? AND status IN ('pending','dispatched')`)
        .bind(server.machine_id)
        .run();
      const expiryHours = parseInt(await getConfig(db, 'action_expiry_hours') || '24');
      const now = Date.now();
      await db
        .prepare(`INSERT INTO actions (id, machine_id, type, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)`)
        .bind(crypto.randomUUID(), server.machine_id, type, now, now + expiryHours * 3600 * 1000)
        .run();
      await replyTelegram(env, chatId, `✅ Queued <b>${type}</b> for <b>${hostname}</b>`);
      break;
    }

    case '/session': {
      const hostname = args[0];
      if (!hostname) { await replyTelegram(env, chatId, 'Usage: /session &lt;hostname&gt;'); return; }
      const row = await db
        .prepare(
          `SELECT sess.link FROM sessions sess
           JOIN servers s ON s.machine_id = sess.machine_id
           WHERE s.hostname = ?`
        )
        .bind(hostname)
        .first<{ link: string }>();
      if (!row) { await replyTelegram(env, chatId, `❌ No active session for <b>${hostname}</b>`); return; }
      await replyTelegram(env, chatId, `🔗 <b>${hostname}</b>\n<code>${row.link}</code>`);
      break;
    }

    case '/interval': {
      const v = parseInt(args[0] ?? '');
      if (isNaN(v) || v < 50) { await replyTelegram(env, chatId, '❌ Interval must be ≥ 50 seconds'); return; }
      await setConfig(db, 'idle_beacon_interval', String(v));
      await replyTelegram(env, chatId, `✅ Beacon interval set to <b>${v}s</b>`);
      break;
    }

    case '/expiry': {
      const v = parseInt(args[0] ?? '');
      if (isNaN(v) || v < 1) { await replyTelegram(env, chatId, '❌ Expiry must be ≥ 1 hour'); return; }
      await setConfig(db, 'action_expiry_hours', String(v));
      await replyTelegram(env, chatId, `✅ Action expiry set to <b>${v}h</b>`);
      break;
    }

    case '/upterm': {
      const url = args[0] ?? '';
      if (!url.startsWith('ssh://')) { await replyTelegram(env, chatId, '❌ URL must start with ssh://'); return; }
      await setConfig(db, 'upterm_server', url);
      await replyTelegram(env, chatId, `✅ upterm server set to <b>${url}</b>`);
      break;
    }

    case '/authkey': {
      const key = args.join(' ');
      if (!key.startsWith('ssh-')) { await replyTelegram(env, chatId, '❌ Key must start with ssh-'); return; }
      await setConfig(db, 'operator_authorized_key', key);
      await replyTelegram(env, chatId, '✅ Operator authorized key updated');
      break;
    }

    case '/resetpassword': {
      const pw = args[0] ?? '';
      if (pw.length < 8) { await replyTelegram(env, chatId, '❌ Password must be at least 8 characters'); return; }
      // Delete the original message immediately to reduce plaintext exposure window
      deleteTelegramMessage(env, chatId, messageId);
      const hash = await bcrypt.hash(pw, 10);
      await db.prepare('UPDATE auth SET web_password = ? WHERE id = 1').bind(hash).run();
      await replyTelegram(env, chatId, '✅ Web password updated\n⚠️ Change it from the web UI when possible — Telegram stores message history on their servers.');
      break;
    }

    default:
      await replyTelegram(env, chatId,
        `Available commands:\n/servers /status /connect /kill /recreate /session /interval /expiry /upterm /authkey /resetpassword`
      );
  }
}
