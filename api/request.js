// POST /api/request { trackId, guestName, dedication, guestId } — a guest asks for a song.
// guestId is the random id the guest's phone made up; it lets them see their own requests later.
// Rules, in order: valid track -> explicit filter -> duplicate guard -> auto-queue or hold for approval.
import { redis, K, getSettings, logEvent } from '../lib/store.js';
import { sp, slimTrack, friendly } from '../lib/spotify.js';
import { getNow } from '../lib/now.js';
import { sendToSpotify } from '../lib/queue.js';
import { recordPick, myRequests, validGuest } from '../lib/guests.js';

const TRACK_ID = /^[A-Za-z0-9]{22}$/; // Spotify IDs are 22 base-62 characters

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const trackId = String(req.body?.trackId || '');
  const by = String(req.body?.guestName || '').trim().slice(0, 30) || 'A guest';
  // Optional dedication ("For the hosts 💛"): plain text, single line, 60 chars max.
  const dedication = String(req.body?.dedication || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const guestId = validGuest(req.body?.guestId) ? req.body.guestId : null;
  if (!TRACK_ID.test(trackId)) return res.status(400).json({ status: 'error', error: 'That isn’t a valid song.' });

  try {
    const settings = await getSettings();

    // Look the track up server-side so the explicit flag can't be faked by the page.
    const track = slimTrack(await sp(`/tracks/${trackId}`));

    if (settings.blockExplicit && track.explicit) {
      return res.status(403).json({ status: 'blocked', error: 'Explicit songs are off tonight. Try a clean version.' });
    }

    // Duplicate guard part 1: already playing or already in Spotify's upcoming queue.
    const now = await getNow().catch(() => null);
    const inQueue = now && [now.current, ...now.upNext].some((t) => t?.id === track.id);

    // Duplicate guard part 2: SADD is atomic, so two guests tapping at once can't both win.
    const fresh = !inQueue && (await redis.sadd(K.taken, track.id)) === 1;
    if (!fresh) return res.status(409).json({ status: 'duplicate', error: 'Someone already requested this one.' });

    const entry = { ...track, by, dedication, guestId, at: Date.now() };

    if (settings.mode === 'auto') {
      try {
        await sendToSpotify(entry, 'queued');
        // Tell the guest where their song landed ("plays after 3 songs").
        const now = await getNow({ fresh: true }).catch(() => null);
        const mine = guestId ? (await myRequests(guestId, now)).find((p) => p.id === track.id) : null;
        return res.status(200).json({ status: 'queued', track, position: mine || null });
      } catch (e) {
        // Spotify unreachable (e.g. nothing playing): keep the request so the host can approve it later.
        entry.note = friendly(e);
      }
    }

    // Approval mode (or auto mode fallback): hold it for the host.
    await redis.hset(K.pending, { [track.id]: entry });
    await recordPick(guestId, entry, 'pending');
    await logEvent({ type: 'pending', id: track.id, name: track.name, artists: track.artists, by, dedication });
    return res.status(202).json({ status: 'pending', track });
  } catch (e) {
    return res.status(e.status === 401 ? 503 : 502).json({ status: 'error', error: friendly(e) });
  }
}
