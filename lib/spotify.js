// lib/spotify.js — talks to Spotify on the host's behalf. Guests never log in to Spotify.
import { redis, K } from './store.js';

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Scopes needed: read the queue / now playing, add to queue, skip,
// and create + fill the private "guest picks" keepsake playlist.
export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

// An error that carries Spotify's status and a short reason code the pages can react to.
export class SpotifyError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.status = status;   // HTTP status from Spotify (or ours)
    this.reason = reason;   // e.g. NO_ACTIVE_DEVICE, NOT_CONNECTED, PREMIUM_REQUIRED
  }
}

// Must match the Redirect URI registered in the Spotify dashboard exactly.
export function redirectUri() {
  return `${String(process.env.APP_URL || '').replace(/\/$/, '')}/api/callback`;
}

// Client ID + secret as a Basic auth header for the token endpoint.
function basicAuth() {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

// POST to Spotify's token endpoint and store what comes back.
async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // invalid_grant = the host revoked access or the refresh token expired: reconnect needed.
    const reason = j.error === 'invalid_grant' ? 'NOT_CONNECTED' : 'AUTH_ERROR';
    throw new SpotifyError(401, reason, j.error_description || 'Spotify sign-in failed');
  }
  if (j.refresh_token) await redis.set(K.refresh, j.refresh_token);                 // Spotify may rotate it
  if (j.scope) await redis.set(K.scope, j.scope);                                   // what the host allowed
  await redis.set(K.access, j.access_token, { ex: Math.max(60, j.expires_in - 60) }); // expire a minute early
  return j.access_token;
}

// Step 2 of host login: trade the one-time code for tokens.
export function exchangeCode(code) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
}

// A valid access token: cached if possible, refreshed otherwise.
async function accessToken() {
  const cached = await redis.get(K.access);
  if (cached) return cached;
  const refresh = await redis.get(K.refresh);
  if (!refresh) throw new SpotifyError(401, 'NOT_CONNECTED', 'The host has not connected Spotify yet');
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
}

export async function isConnected() {
  return Boolean(await redis.get(K.refresh));
}

// Call the Web API. Returns parsed JSON, or null for empty responses. `json` is sent as the request body.
export async function sp(path, { method = 'GET', query, json } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);

  const send = async () => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  let r = await send();

  // Token rejected mid-life (e.g. host reconnected): drop the cache and retry once.
  if (r.status === 401) {
    await redis.del(K.access);
    r = await send();
  }

  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* queue/skip can return non-JSON */ }

  if (!r.ok) {
    const reason =
      body?.error?.reason ||
      (r.status === 404 ? 'NO_ACTIVE_DEVICE' : r.status === 429 ? 'RATE_LIMITED' : 'SPOTIFY_ERROR');
    throw new SpotifyError(r.status, reason, body?.error?.message || `Spotify returned ${r.status}`);
  }
  return body;
}

// Shrink Spotify's large track object to what the pages need. Handles podcast episodes too.
export function slimTrack(t) {
  if (!t) return null;
  const images = t.album?.images || t.images || [];
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', ') || t.show?.name || '',
    image: (images[1] || images[0])?.url || null,   // ~300px, for now playing
    thumb: (images.at(-1) || images[0])?.url || null, // ~64px, for lists
    explicit: Boolean(t.explicit),
    durationMs: t.duration_ms || 0,
  };
}

// Plain-English messages for the errors guests and the host are most likely to hit.
export function friendly(err) {
  switch (err?.reason) {
    case 'NO_ACTIVE_DEVICE': return 'Spotify isn’t playing on the host phone right now.';
    case 'NOT_CONNECTED': return 'The host needs to connect Spotify on the host screen.';
    case 'PREMIUM_REQUIRED': return 'The host’s Spotify account needs Premium.';
    case 'RATE_LIMITED': return 'Spotify is busy, try again in a few seconds.';
    default: return err?.message || 'Something went wrong talking to Spotify.';
  }
}
