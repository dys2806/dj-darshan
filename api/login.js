// GET /api/login?pin=XXXX — host only. Sends the host to Spotify to approve access.
import crypto from 'node:crypto';
import { redis, K, isHost } from '../lib/store.js';
import { SCOPES, redirectUri } from '../lib/spotify.js';

export default async function handler(req, res) {
  if (!isHost(req)) return res.status(401).send('Wrong host PIN.');

  // Random one-time state, checked in /api/callback so nobody can forge a login.
  const state = crypto.randomBytes(16).toString('hex');
  await redis.set(K.state(state), 1, { ex: 600 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    state,
    show_dialog: 'true', // always show the consent screen so you can pick the right account
  });
  res.redirect(302, `https://accounts.spotify.com/authorize?${params}`);
}
