import type { Env } from '../types';

/**
 * Fire-and-forget Telegram message.
 * Intentionally NOT awaited — must never block a response.
 */
export function sendTelegram(env: Env, text: string): void {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
  }).catch(() => {
    // Silently swallow — fire-and-forget
  });
}

/**
 * Delete a Telegram message (used after /resetpassword to remove plaintext).
 * Fire-and-forget.
 */
export function deleteTelegramMessage(env: Env, chat_id: string, message_id: number): void {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, message_id }),
  }).catch(() => { });
}

/**
 * Reply to a Telegram message.
 */
export async function replyTelegram(env: Env, chat_id: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  console.log(env.TELEGRAM_BOT_TOKEN)
  console.log(env.TELEGRAM_CHAT_ID)
  console.log(chat_id)
  console.log(text)
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
    }),
  });
}
