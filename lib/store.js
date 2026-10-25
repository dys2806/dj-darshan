// lib/store.js — shared state for the party (Upstash Redis, free tier via Vercel Marketplace)
import { Redis } from '@upstash/redis';

// Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*. Accept either.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Every key the app uses, in one place.
export const K = {
  refresh: 'dj:refresh',          // host's Spotify refresh token (long-lived)
  access: 'dj:access',            // cached Spotify access token (expires ~1h)
  settings: 'dj:settings',        // { mode: 'auto' | 'approve' }
  pending: 'dj:pending',          // hash: trackId -> request waiting for host approval
  taken: 'dj:taken',              // set: trackIds already requested tonight (duplicate guard)
  who: 'dj:who',                  // hash: trackId -> guest name (shown as "requested by")
  log: 'dj:log',                  // list: latest 50 events for the host screen
  now: 'dj:now',                  // short-lived cache of now playing + up next
  scope: 'dj:scope',              // Spotify permissions the host granted (space-separated)
  picks: 'dj:picks',              // list: every guest song that reached Spotify tonight, with dedication
  keepsake: 'dj:keepsake',        // { id, url, name } of tonight's guest-picks playlist
  keepsakeLock: 'dj:keepsake:lock', // stops two requests creating two playlists at once
  keepsakeError: 'dj:keepsake:err', // last problem saving to the playlist, shown to the host
  state: (s) => `dj:state:${s}`,  // one-time OAuth state values (CSRF protection)
  guest: (g) => `dj:guest:${g}`,  // hash: trackId -> one guest's request + its status (by anonymous device id)
  guests: 'dj:guests',            // set: every guest id tonight (so a new party can clear them)
};

// Default settings: auto-queue on.
const DEFAULTS = { mode: 'auto' };

// Read settings, filling in defaults for anything never saved.
export async function getSettings() {
  const saved = (await redis.get(K.settings)) || {};
  // Only known settings; anything older (like the retired explicit filter) is ignored.
  return { mode: saved.mode === 'approve' ? 'approve' : DEFAULTS.mode };
}

// Merge a partial change into the saved settings.
export async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await redis.set(K.settings, next);
  return next;
}

// Host-only endpoints check the PIN from the header (pages) or ?pin= (the Spotify login link).
export function isHost(req) {
  const pin = req.headers['x-host-pin'] || req.query?.pin;
  return Boolean(process.env.HOST_PIN) && String(pin) === String(process.env.HOST_PIN);
}

// Append an event to the host's activity log and keep only the newest 50.
export async function logEvent(event) {
  await redis.lpush(K.log, { ...event, at: Date.now() });
  await redis.ltrim(K.log, 0, 49);
}
