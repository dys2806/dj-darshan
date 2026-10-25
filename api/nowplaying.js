// GET /api/nowplaying[?guest=<id>] — public. Party settings + now playing + up next (10),
// plus, when a guest id is given, that guest's own requests with live status.
import { getSettings } from '../lib/store.js';
import { isConnected } from '../lib/spotify.js';
import { getNow } from '../lib/now.js';
import { partyConfig } from '../lib/config.js';
import { myRequests, settlePlayed, validGuest } from '../lib/guests.js';

export default async function handler(req, res) {
  const { timezone, ...config } = partyConfig(); // everything pages display (timezone is server-only)
  res.setHeader('Cache-Control', 'no-store');

  try {
    const guest = validGuest(req.query?.guest) ? req.query.guest : null;
    const [connected, settings] = await Promise.all([isConnected(), getSettings()]);
    if (!connected) {
      const mine = guest ? await myRequests(guest, null) : undefined;
      return res.status(200).json({ ...config, connected, current: null, upNext: [], mine });
    }

    const now = await getNow().catch(() => null); // nothing playing is fine
    let mine;
    if (guest) {
      mine = await myRequests(guest, now);
      await settlePlayed(guest, mine);
    }
    res.status(200).json({
      ...config, connected, mode: settings.mode,
      current: now?.current || null, upNext: (now?.upNext || []).slice(0, 10), mine,
    });
  } catch {
    res.status(200).json({ ...config, connected: false, current: null, upNext: [] });
  }
}
