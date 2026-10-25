// lib/keepsake.js — tonight's "guest picks" keepsake.
// Every guest song that reaches Spotify is (1) logged with who asked and their dedication,
// and (2) added to a private Spotify playlist created on the first request of the night.
// Failures here never block the song from playing; they're shown to the host instead.
import { redis, K } from './store.js';
import { sp, friendly } from './spotify.js';
import { partyConfig } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The host must have granted playlist permission (done on Connect Spotify).
export async function keepsakeEnabled() {
  const scope = await redis.get(K.scope);
  return typeof scope === 'string' && scope.split(' ').includes('playlist-modify-private');
}

// Tonight's playlist id: reuse it, or create it once (a short lock stops duplicates).
async function playlistId() {
  const existing = await redis.get(K.keepsake);
  if (existing?.id) return existing.id;

  const mine = await redis.set(K.keepsakeLock, '1', { nx: true, ex: 20 });
  if (!mine) {
    // Another request is creating it right now; wait for it.
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      const p = await redis.get(K.keepsake);
      if (p?.id) return p.id;
    }
    throw new Error('The guest-picks playlist is still being created');
  }

  const { partyName: party, djName: dj } = partyConfig();
  const pl = await sp('/me/playlists', {
    method: 'POST',
    json: {
      name: `${party} · Guest Picks`.slice(0, 100),
      public: false,
      description: `Every song our guests requested, played by ${dj}. 🪔`,
    },
  });
  const saved = { id: pl.id, url: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`, name: pl.name };
  await redis.set(K.keepsake, saved);
  return saved.id;
}

// Called right after a song is queued on Spotify.
export async function saveToKeepsake(entry) {
  // Always log the pick (powers the CSV download), even if the playlist is off.
  await redis.rpush(K.picks, {
    at: Date.now(), id: entry.id, name: entry.name, artists: entry.artists,
    by: entry.by || 'A guest', dedication: entry.dedication || '',
  });

  if (!(await keepsakeEnabled())) return;
  try {
    const id = await playlistId();
    await sp(`/playlists/${id}/items`, { method: 'POST', json: { uris: [entry.uri] } });
    await redis.del(K.keepsakeError);
  } catch (e) {
    await redis.set(K.keepsakeError, friendly(e), { ex: 3600 });
  }
}

// What the host screen shows about the keepsake.
export async function keepsakeStatus() {
  const [enabled, playlist, count, error] = await Promise.all([
    keepsakeEnabled(), redis.get(K.keepsake), redis.llen(K.picks), redis.get(K.keepsakeError),
  ]);
  return { enabled, url: playlist?.url || null, name: playlist?.name || null, count, error: error || null };
}

// Tonight's picks as CSV: time, song, artist, requested by, dedication.
export async function picksCsv() {
  const picks = (await redis.lrange(K.picks, 0, -1)) || [];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const time = (ts) => new Date(ts).toLocaleTimeString('en-US', { timeZone: partyConfig().timezone, hour: 'numeric', minute: '2-digit' });
  const rows = picks.map((p, i) => [i + 1, time(p.at), p.name, p.artists, p.by, p.dedication].map(cell).join(','));
  return ['#,Time,Song,Artist,Requested by,Dedication', ...rows].join('\n') + '\n';
}
