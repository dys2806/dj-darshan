// lib/now.js — what's playing and what's next, cached for a few seconds so
// 30 guests refreshing their phones don't burn through Spotify's rate limit.
import { redis, K } from './store.js';
import { sp, slimTrack } from './spotify.js';

const CACHE_SECONDS = 8;

export async function getNow({ fresh = false } = {}) {
  if (!fresh) {
    const cached = await redis.get(K.now);
    if (cached) return cached;
  }

  // GET /me/player/queue returns currently_playing plus the upcoming queue.
  const q = await sp('/me/player/queue');
  const current = slimTrack(q?.currently_playing);
  // Keep everything Spotify returns (about 20 songs) so a guest's position can be worked out;
  // pages trim this for display. queueCut = Spotify may have more than it showed us.
  const raw = q?.queue || [];
  const upNext = raw.map(slimTrack).filter(Boolean);
  const queueCut = raw.length >= 20;

  // Tag songs that guests requested, with who asked for them and any dedication.
  const who = (await redis.hgetall(K.who)) || {};
  for (const t of [current, ...upNext]) {
    const w = t && who[t.id];
    if (!w) continue;
    t.requestedBy = typeof w === 'object' ? w.by : String(w); // older entries stored just the name
    if (w.dedication) t.dedication = w.dedication;
  }

  const now = { current, upNext, queueCut };
  await redis.set(K.now, now, { ex: CACHE_SECONDS });
  return now;
}

// Call after anything that changes the queue so the next read is fresh.
export const bustNow = () => redis.del(K.now);
