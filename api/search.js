// GET /api/search?q=... — guests search Spotify's catalog (top 10, the dev-mode maximum).
import { redis, K } from '../lib/store.js';
import { sp, slimTrack, friendly } from '../lib/spotify.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.status(200).json({ tracks: [] });

  try {
    const data = await sp('/search', { query: { q, type: 'track', limit: '10' } });
    const tracks = (data?.tracks?.items || []).filter(Boolean).map(slimTrack);

    // Mark songs already requested tonight so the page can grey them out.
    const ids = tracks.map((t) => t.id);
    const taken = ids.length ? await redis.smismember(K.taken, ids) : [];
    tracks.forEach((t, i) => { t.taken = Boolean(taken[i]); });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ tracks });
  } catch (e) {
    res.status(e.status === 401 ? 503 : 502).json({ error: friendly(e), reason: e.reason });
  }
}
