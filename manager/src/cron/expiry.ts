import type { Env } from '../types';
import { enableFK } from '../db';

export async function handleExpiry(env: Env): Promise<void> {
  await enableFK(env.DB);
  await env.DB
    .prepare(
      `UPDATE actions SET status = 'failed'
       WHERE status IN ('pending','dispatched') AND expires_at < ?`
    )
    .bind(Date.now())
    .run();
}
