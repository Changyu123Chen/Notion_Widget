import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

/**
 * GET /api/get-weights
 * Returns the latest cached weight snapshot written by /api/refresh-weights.
 * The snapshot is stored in Vercel Blob as JSON.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Location of the cached JSON in Vercel Blob
  const BLOB_KEY = process.env.WEIGHTS_BLOB_KEY || 'weights/latest.json';

  try {
    // Find the blob metadata by exact key or prefix
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    const blob = blobs.find((b: any) => b.pathname === BLOB_KEY) || blobs[0];
    if (!blob) throw new Error('Blob not found');

    // Fetch the actual JSON content from the blob's URL
    const resp = await fetch(blob.url);
    if (!resp.ok) {
      throw new Error(`Blob fetch failed: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();

    // Cache for 5 minutes on the edge/CDN, allow stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    // If the caller only wants the rows, support ?rows=1
    if (req.query.rows) {
      return res.status(200).json(data.rows ?? []);
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err: any) {
    // When the blob key doesn't exist, @vercel/blob throws. Return 404.
    const msg = err?.message || 'failed to load weights';
    const status = /not found/i.test(msg) ? 404 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
}