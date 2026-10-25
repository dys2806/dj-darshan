// /api/host — host only (x-host-pin header).
// GET  -> status, settings, pending requests, activity log, keepsake playlist status
// GET ?export=csv -> tonight's picks with dedications as a CSV file
// POST -> { action: setMode | setExplicit | approve | approveAll | reject | skip | reset }
import { redis, K, isHost, getSettings, updateSettings, logEvent } from '../lib/store.js';
import { isConnected, sp, friendly } from '../lib/spotify.js';
import { getNow, bustNow } from '../lib/now.js';
import { sendToSpotify } from '../lib/queue.js';
import { keepsakeStatus, picksCsv } from '../lib/keepsake.js';

// Pending requests, oldest first (first come, first served).
async function pendingList() {
  const all = (await redis.hgetall(K.pending)) || {};
  return Object.values(all).sort((a, b) => a.at - b.at);
}

export default async function handler(req, res) {
  if (!isHost(req)) return res.status(401).json({ error: 'Wrong host PIN' });
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && req.query?.export === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="diwali-party-guest-picks.csv"');
    return res.status(200).send('﻿' + (await picksCsv())); // BOM so Excel shows emoji correctly
  }

  if (req.method === 'GET') {
    const [connected, settings, pending, log, keepsake] = await Promise.all([
      isConnected(), getSettings(), pendingList(), redis.lrange(K.log, 0, 29), keepsakeStatus(),
    ]);
    let now = null, playerError = null;
    if (connected) {
      try { now = await getNow(); } catch (e) { playerError = friendly(e); }
    }
    return res.status(200).json({ connected, settings, pending, log, now, playerError, keepsake });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

  const { action, trackId, mode, blockExplicit } = req.body || {};
  try {
    switch (action) {
      case 'setMode': {
        if (!['auto', 'approve'].includes(mode)) return res.status(400).json({ error: 'mode must be auto or approve' });
        await updateSettings({ mode });
        await logEvent({ type: 'mode', mode });
        break;
      }
      case 'setExplicit': {
        await updateSettings({ blockExplicit: Boolean(blockExplicit) });
        await logEvent({ type: 'explicit', blockExplicit: Boolean(blockExplicit) });
        break;
      }
      case 'approve': {
        const entry = await redis.hget(K.pending, String(trackId));
        if (!entry) return res.status(404).json({ error: 'That request is gone.' });
        await sendToSpotify(entry, 'approved');
        break;
      }
      case 'approveAll': {
        // One at a time, oldest first, so the queue order matches request order.
        for (const entry of await pendingList()) await sendToSpotify(entry, 'approved');
        break;
      }
      case 'reject': {
        await redis.hdel(K.pending, String(trackId));
        await redis.srem(K.taken, String(trackId)); // someone else may request it later
        await logEvent({ type: 'rejected', id: trackId });
        break;
      }
      case 'skip': {
        await sp('/me/player/next', { method: 'POST' }); // same as tapping Next on the phone
        await bustNow();
        break;
      }
      case 'reset': {
        // Clears requests, duplicate memory and log. Keeps Spotify login, settings and the keepsake.
        await redis.del(K.pending, K.taken, K.who, K.log, K.now);
        break;
      }
      case 'newKeepsake': {
        // For the next party: forget tonight's picks log and start a new playlist on the next request.
        // The old playlist stays in Spotify.
        await redis.del(K.picks, K.keepsake, K.keepsakeLock, K.keepsakeError);
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: friendly(e), reason: e.reason });
  }
}
