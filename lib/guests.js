// lib/guests.js — each guest's own request history and where their songs are in the queue.
// Guests are identified only by a random id their phone makes up (no names, no logins);
// a guest can only ever read their own list.
import { redis, K } from './store.js';

export const GUEST_ID = /^[a-z0-9]{16,40}$/;
const KEEP_SECONDS = 3 * 24 * 3600; // forget a guest's history 3 days after their last request
const GRACE_MS = 90 * 1000;          // a just-queued song may not show in Spotify's queue straight away

export const validGuest = (g) => typeof g === 'string' && GUEST_ID.test(g);

// Save (or update) one request in a guest's history.
export async function recordPick(guestId, entry, status) {
  if (!validGuest(guestId)) return;
  const key = K.guest(guestId);
  await redis.hset(key, {
    [entry.id]: {
      id: entry.id, name: entry.name, artists: entry.artists, thumb: entry.thumb || null,
      dedication: entry.dedication || '', at: entry.at || Date.now(), status,
      ...(status === 'queued' ? { queuedAt: Date.now() } : {}),
    },
  });
  await redis.expire(key, KEEP_SECONDS);
  await redis.sadd(K.guests, guestId);
}

// Change the stored status of a guest's request (approved → queued, declined, …).
export async function setPickStatus(guestId, trackId, status) {
  if (!validGuest(guestId)) return;
  const key = K.guest(guestId);
  const pick = await redis.hget(key, trackId);
  if (pick) await redis.hset(key, { [trackId]: { ...pick, status, ...(status === 'queued' ? { queuedAt: Date.now() } : {}) } });
}

// A guest's requests, newest first, each with a live status worked out from the Spotify queue:
//   playing | queued (ahead = number of songs before it) | pending | declined | played
export async function myRequests(guestId, now) {
  if (!validGuest(guestId)) return [];
  const all = Object.values((await redis.hgetall(K.guest(guestId))) || {});
  const upNext = now?.upNext || [];

  return all.sort((a, b) => b.at - a.at).map((p) => {
    const r = { id: p.id, name: p.name, artists: p.artists, thumb: p.thumb, dedication: p.dedication, at: p.at, status: p.status };
    if (p.status !== 'queued' || !now) return r;            // pending / declined / played: as stored

    if (now.current?.id === p.id) return { ...r, status: 'playing' };
    const idx = upNext.findIndex((t) => t.id === p.id);
    if (idx >= 0) return { ...r, status: 'queued', ahead: idx };
    // Not playing and not in the part of the queue Spotify showed us. It's still waiting if
    // Spotify cut the list short or the song was only just added (Spotify can lag a few seconds);
    // otherwise it has played.
    const justAdded = Date.now() - (p.queuedAt || p.at) < GRACE_MS;
    return now.queueCut || justAdded ? { ...r, status: 'queued', ahead: null } : { ...r, status: 'played' };
  });
}

// Remember songs that have played, so they still say "Played" if the queue can't be read later.
export async function settlePlayed(guestId, mine) {
  for (const p of mine) if (p.status === 'played') await setPickStatus(guestId, p.id, 'played');
}

// Forget every guest's history (used when starting a new party).
export async function clearGuests() {
  const ids = (await redis.smembers(K.guests)) || [];
  if (ids.length) await redis.del(...ids.map(K.guest));
  await redis.del(K.guests);
}
