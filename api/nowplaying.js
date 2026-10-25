// GET /api/nowplaying — public. Party settings + now playing + up next, for the guest page, big screen and poster.
import { getSettings } from '../lib/store.js';
import { isConnected } from '../lib/spotify.js';
import { getNow } from '../lib/now.js';
import { partyConfig } from '../lib/config.js';

export default async function handler(req, res) {
  const { timezone, ...config } = partyConfig(); // everything pages display (timezone is server-only)
  res.setHeader('Cache-Control', 'no-store');

  try {
    const [connected, settings] = await Promise.all([isConnected(), getSettings()]);
    if (!connected) return res.status(200).json({ ...config, connected, current: null, upNext: [] });

    const now = await getNow().catch(() => ({ current: null, upNext: [] })); // nothing playing is fine
    res.status(200).json({ ...config, connected, mode: settings.mode, ...now });
  } catch {
    res.status(200).json({ ...config, connected: false, current: null, upNext: [] });
  }
}
