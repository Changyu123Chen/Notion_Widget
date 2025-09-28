import { refreshWeights } from '../Auth/Notion_Weight_DB_Auth/Weight.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
/**
 * POST /api/refresh-weights
 * Triggered by a Notion "Send webhook" button (or curl) to refresh cached weight data.
 * Security: requires header `x-webhook-secret: <WEBHOOK_SECRET>`
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET || '';
  const provided =
    (req.headers['x-webhook-secret'] as string | undefined) ||
    (req.headers['X-Webhook-Secret'] as string | undefined) ||
    '';

  if (!secret || provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { count } = await refreshWeights();
    return res.status(200).json({ ok: true, count });
  } catch (err: any) {
    console.error('refresh-weights failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'refresh failed' });
  }
}