// GET /api/nowplaying — public. Now playing + up next for the guest page and QR poster.
import { getSettings } from '../lib/store.js';
import { isConnected } from '../lib/spotify.js';
import { getNow } from '../lib/now.js';

export default async function handler(req, res) {
  const partyName = process.env.PARTY_NAME || 'Himanshu and Kirti’s Diwali Party';
  const djName = process.env.DJ_NAME || 'DJ Darshan';            // big name at the top of the guest page
  res.setHeader('Cache-Control', 'no-store');

  try {
    const [connected, settings] = await Promise.all([isConnected(), getSettings()]);
    if (!connected) return res.status(200).json({ partyName, djName, connected, current: null, upNext: [] });

    const now = await getNow().catch(() => ({ current: null, upNext: [] })); // nothing playing is fine
    res.status(200).json({ partyName, djName, connected, mode: settings.mode, ...now });
  } catch {
    res.status(200).json({ partyName, djName, connected: false, current: null, upNext: [] });
  }
}
