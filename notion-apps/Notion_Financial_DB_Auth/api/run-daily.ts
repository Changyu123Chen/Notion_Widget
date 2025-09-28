// api/run-daily.ts
import { runDailyRecalc } from '../Account_recal.js'; // Vercel compiles TS->JS; keep .js suffix

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  const secret = process.env.WEBHOOK_SECRET || '';
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    await runDailyRecalc();
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || 'failed' });
  }
}