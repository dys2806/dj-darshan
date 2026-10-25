// lib/queue.js — the one place a song actually gets sent to Spotify's queue.
// Used by guest requests in auto mode and by the host's Approve button.
import { redis, K, logEvent } from './store.js';
import { sp } from './spotify.js';
import { bustNow } from './now.js';

export async function sendToSpotify(entry, how) {
  // Spotify appends to the queue; pressing Next on the phone plays queued songs in order.
  await sp('/me/player/queue', { method: 'POST', query: { uri: entry.uri } });
  await redis.hdel(K.pending, entry.id);                     // no longer waiting (no-op in auto mode)
  // Remember who asked and their dedication, for "requested by" in Up Next and on the big screen.
  await redis.hset(K.who, { [entry.id]: { by: entry.by, dedication: entry.dedication || '' } });
  await logEvent({ type: how, id: entry.id, name: entry.name, artists: entry.artists, by: entry.by, dedication: entry.dedication || '' });
  await bustNow();                                           // Up Next changed
}
