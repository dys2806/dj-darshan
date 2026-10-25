// GET /api/callback — Spotify sends the host back here after they approve.
import { redis, K, logEvent } from '../lib/store.js';
import { exchangeCode } from '../lib/spotify.js';

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `/host?error=${encodeURIComponent(error)}`);

  // The state must be one we issued in the last 10 minutes, and it only works once.
  const known = state && (await redis.getdel(K.state(state)));
  if (!code || !known) return res.status(400).send('Login link expired. Go back to the host screen and tap Connect again.');

  try {
    await exchangeCode(code);                          // stores refresh + access tokens
    await logEvent({ type: 'connected' });
    res.redirect(302, '/host?connected=1');
  } catch (e) {
    res.redirect(302, `/host?error=${encodeURIComponent(e.message)}`);
  }
}
