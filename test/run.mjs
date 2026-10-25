// Offline test suite: fake Spotify + fake Upstash Redis. Run with: npm test
// End-to-end test of the API handlers against an in-memory Redis and a fake Spotify.
process.env.HOST_PIN = '4242';
process.env.SPOTIFY_CLIENT_ID = 'cid';
process.env.SPOTIFY_CLIENT_SECRET = 'secret';
process.env.APP_URL = 'https://party.example.app';
process.env.KV_REST_API_URL = 'https://fake.upstash.io';
process.env.KV_REST_API_TOKEN = 'x';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { K } = await import(`${ROOT}/lib/store.js`);

// ---- in-memory Redis behind a fake Upstash REST API ----------------------------
const db = new Map();
function run([cmd, ...a]) {
  cmd = cmd.toLowerCase();
  const k = a[0];
  const H = () => { if (!db.has(k)) db.set(k, new Map()); return db.get(k); };
  const S = () => { if (!db.has(k)) db.set(k, new Set()); return db.get(k); };
  const L = () => { if (!db.has(k)) db.set(k, []); return db.get(k); };
  switch (cmd) {
    case 'get': return db.get(k) ?? null;
    case 'set': {
      const nx = a.slice(2).some((x) => String(x).toLowerCase() === 'nx');
      if (nx && db.has(k)) return null;                      // SET NX: only if missing
      db.set(k, String(a[1])); return 'OK';
    }
    case 'rpush': for (const v of a.slice(1)) L().push(String(v)); return L().length;
    case 'llen': return (db.get(k) || []).length;
    case 'expire': return db.has(k) ? 1 : 0;
    case 'smembers': return [...(db.get(k) || [])];
    case 'del': return a.filter((x) => db.delete(x)).length;
    case 'getdel': { const v = db.get(k) ?? null; db.delete(k); return v; }
    case 'hgetall': { const h = db.get(k); return h ? [...h].flat() : []; }
    case 'hget': return db.get(k)?.get(a[1]) ?? null;
    case 'hset': { let n = 0; for (let i = 1; i < a.length; i += 2) { if (!H().has(a[i])) n++; H().set(a[i], String(a[i + 1])); } return n; }
    case 'hdel': return a.slice(1).filter((f) => db.get(k)?.delete(f)).length;
    case 'sadd': { let n = 0; for (const m of a.slice(1)) { if (!S().has(String(m))) { S().add(String(m)); n++; } } return n; }
    case 'srem': return a.slice(1).filter((m) => db.get(k)?.delete(String(m))).length;
    case 'smismember': return a.slice(1).map((m) => (db.get(k)?.has(String(m)) ? 1 : 0));
    case 'lpush': for (const v of a.slice(1)) L().unshift(String(v)); return L().length;
    case 'ltrim': db.set(k, L().slice(+a[1], +a[2] + 1)); return 'OK';
    case 'lrange': return L().slice(+a[1], +a[2] === -1 ? undefined : +a[2] + 1);
    default: throw new Error('unmocked redis command ' + cmd);
  }
}
const enc = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(enc) : v;
function upstash(u, opts) {
  const b64 = String(opts.headers?.['Upstash-Encoding'] || opts.headers?.['upstash-encoding'] || '').toLowerCase() === 'base64';
  const body = JSON.parse(opts.body);
  const run0 = run;
  const run1 = (c) => { const r = run0(c); return b64 ? enc(r) : r; };
  const res = u.pathname.startsWith('/pipeline') || u.pathname.startsWith('/multi-exec')
    ? body.map((c) => ({ result: run1(c) }))
    : { result: run1(body) };
  return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json' } });
}
// test helpers to peek at state
const peek = (k) => db.get(k);

// ---- fake Spotify ------------------------------------------------------------
const tracks = {
  AAAAAAAAAAAAAAAAAAAAAA: { name: 'Clean Song', explicit: false },
  BBBBBBBBBBBBBBBBBBBBBB: { name: 'Explicit Song', explicit: true },
  CCCCCCCCCCCCCCCCCCCCCC: { name: 'Third Song', explicit: false },
  DDDDDDDDDDDDDDDDDDDDDD: { name: 'Playing Now', explicit: false },
};
const mk = (id) => ({ id, uri: `spotify:track:${id}`, name: tracks[id].name, explicit: tracks[id].explicit,
  artists: [{ name: 'Artist' }], album: { images: [{ url: 'big' }, { url: 'mid' }, { url: 'small' }] }, duration_ms: 1000 });
let spotifyQueue = [];
let deviceActive = true;
let currentId = 'DDDDDDDDDDDDDDDDDDDDDD';
let grantedScope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-modify-private playlist-modify-public';
let playlistsCreated = 0, playlistDown = false;
const playlistItems = [];
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url); const m = opts.method || 'GET';
  if (u.hostname === 'fake.upstash.io') return upstash(u, opts);
  calls.push(`${m} ${u.pathname}`);
  const json = (s, b) => new Response(b == null ? '' : JSON.stringify(b), { status: s });
  if (u.hostname === 'accounts.spotify.com') return json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: grantedScope });
  if (u.pathname === '/v1/me/playlists' && m === 'POST') {
    await new Promise((r) => setTimeout(r, 50));             // slow enough for two requests to race
    playlistsCreated++; const b = JSON.parse(opts.body);
    return json(201, { id: 'PL' + playlistsCreated, name: b.name, public: b.public, external_urls: { spotify: 'https://open.spotify.com/playlist/PL' + playlistsCreated } });
  }
  if (u.pathname.match(/^\/v1\/playlists\/[^/]+\/items$/) && m === 'POST') {
    if (playlistDown) return json(500, { error: { status: 500, message: 'Playlist service down' } });
    playlistItems.push(...JSON.parse(opts.body).uris.map((x) => `${u.pathname.split('/')[3]}:${x.split(':').pop()}`));
    return json(201, { snapshot_id: 'x' });
  }
  if (u.pathname === '/v1/search') return json(200, { tracks: { items: Object.keys(tracks).map(mk) } });
  if (u.pathname.startsWith('/v1/tracks/')) return json(200, mk(u.pathname.split('/').pop()));
  if (u.pathname === '/v1/me/player/queue' && m === 'GET') return json(200, { currently_playing: mk(currentId), queue: spotifyQueue.map(mk) });
  if (u.pathname === '/v1/me/player/queue' && m === 'POST') {
    if (!deviceActive) return json(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } });
    spotifyQueue.push(u.searchParams.get('uri').split(':').pop()); return json(200, null);
  }
  if (u.pathname === '/v1/me/player/next') { const n = spotifyQueue.shift(); if (n) currentId = n; return json(200, null); }
  return json(404, {});
};

// ---- fake req/res --------------------------------------------------------------
async function call(path, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const { default: h } = await import(`${ROOT}/api/${path}.js`);
  const res = { code: 200, headers: {}, body: null, loc: null,
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; }, redirect(c, l) { this.code = c; this.loc = l; return this; } };
  await h({ method, query, body, headers }, res);
  return res;
}
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + extra}`); if (!cond) fails++; };
const host = { 'x-host-pin': '4242' };
const guestReq = (id, name = 'Priya', dedication = '') => call('request', { method: 'POST', body: { trackId: id, guestName: name, dedication } });

// 1. Before connecting
let r2; let r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA');
check('request before Spotify connected -> friendly error', r.code === 503 && /connect Spotify/.test(r.body.error), JSON.stringify(r.body));
r = await call('host', { headers: { 'x-host-pin': 'nope' } });
check('host API rejects wrong PIN', r.code === 401);
r = await call('login', { query: { pin: 'nope' } });
check('login rejects wrong PIN', r.code === 401);

// 2. Host connects
r = await call('login', { query: { pin: '4242' } });
const loc = new URL(r.loc);
check('login redirects to Spotify with exact redirect URI', loc.hostname === 'accounts.spotify.com' && loc.searchParams.get('redirect_uri') === 'https://party.example.app/api/callback');
r = await call('callback', { query: { code: 'xyz', state: 'forged' } });
check('callback rejects forged state', r.code === 400);
r = await call('callback', { query: { code: 'xyz', state: loc.searchParams.get('state') } });
check('callback stores tokens and returns to /host', r.loc === '/host?connected=1' && peek(K.refresh) === 'RT');
r = await call('callback', { query: { code: 'xyz', state: loc.searchParams.get('state') } });
check('state cannot be reused', r.code === 400);

// 3. Auto mode (default)
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Priya', '  For   the hosts 💛 ');
check('auto mode: clean song queued straight to Spotify', r.body.status === 'queued' && spotifyQueue.includes('AAAAAAAAAAAAAAAAAAAAAA'));
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Rahul');
check('duplicate blocked', r.code === 409 && r.body.status === 'duplicate');
r = await guestReq('DDDDDDDDDDDDDDDDDDDDDD');
check('currently playing song counts as duplicate', r.code === 409);
r = await guestReq('not-a-real-id');
check('invalid track id rejected', r.code === 400);
r = await call('search', { query: { q: 'song' } });
const a = r.body.tracks.find((t) => t.id === 'AAAAAAAAAAAAAAAAAAAAAA');
const ex = r.body.tracks.find((t) => t.id === 'BBBBBBBBBBBBBBBBBBBBBB');
check('search marks requested songs as taken, explicit songs flagged but addable', a.taken === true && ex.explicit === true && ex.taken === false && !('blockExplicit' in r.body));
db.delete(K.now);
r = await call('nowplaying');
check('up next shows who requested', r.body.upNext[0]?.requestedBy === 'Priya' && r.body.current.name === 'Playing Now', JSON.stringify(r.body));
check('dedication shown in Up Next, whitespace tidied', r.body.upNext[0]?.dedication === 'For the hosts 💛', JSON.stringify(r.body.upNext[0]));

// 4. Switch to approval mode
r = await call('host', { method: 'POST', headers: host, body: { action: 'setMode', mode: 'approve' } });
r = await guestReq('CCCCCCCCCCCCCCCCCCCCCC', 'Meera', 'x'.repeat(200));
check('approve mode: request held, not sent to Spotify', r.code === 202 && !spotifyQueue.includes('CCCCCCCCCCCCCCCCCCCCCC'));
r = await call('host', { headers: host });
check('host sees pending request with guest name', r.body.pending.length === 1 && r.body.pending[0].by === 'Meera');
check('dedication capped at 60 characters', r.body.pending[0].dedication.length === 60);
r = await call('host', { method: 'POST', headers: host, body: { action: 'approve', trackId: 'CCCCCCCCCCCCCCCCCCCCCC' } });
check('approve sends it to Spotify queue in order', r.code === 200 && spotifyQueue.join() === 'AAAAAAAAAAAAAAAAAAAAAA,CCCCCCCCCCCCCCCCCCCCCC');
r = await call('nowplaying');
check('approved song keeps its dedication', r.body.upNext[1]?.dedication?.length === 60 && r.body.upNext[1]?.requestedBy === 'Meera', JSON.stringify(r.body.upNext[1]));

// 5. Reject frees the song for later
db.delete(K.taken); spotifyQueue = []; db.delete(K.now);
await guestReq('CCCCCCCCCCCCCCCCCCCCCC', 'Meera');
await call('host', { method: 'POST', headers: host, body: { action: 'reject', trackId: 'CCCCCCCCCCCCCCCCCCCCCC' } });
r = await guestReq('CCCCCCCCCCCCCCCCCCCCCC', 'Ankit');
check('rejected song can be requested again', r.code === 202);

// 6. Explicit songs are allowed; the host gets what it needs to warn about them
await call('host', { method: 'POST', headers: host, body: { action: 'setMode', mode: 'auto' } });
db.delete(K.now);
r = await guestReq('BBBBBBBBBBBBBBBBBBBBBB', 'Rahul');
check('explicit song goes straight into the queue', r.body.status === 'queued' && spotifyQueue.includes('BBBBBBBBBBBBBBBBBBBBBB'));
r = await call('host', { headers: host });
const exUp = r.body.now.upNext.find((t) => t.id === 'BBBBBBBBBBBBBBBBBBBBBB');
check('host screen: explicit song flagged in Up Next with who asked', exUp?.explicit === true && exUp.requestedBy === 'Rahul', JSON.stringify(exUp));
check('host screen: activity log marks it explicit', r.body.log[0]?.explicit === true && r.body.log[0]?.name === 'Explicit Song');
check('explicit filter setting is gone', !('blockExplicit' in r.body.settings));
db.set(K.settings, JSON.stringify({ mode: 'auto', blockExplicit: true }));   // a database from before this change
r = await call('host', { headers: host });
check('old saved explicit setting is ignored', JSON.stringify(r.body.settings) === '{"mode":"auto"}', JSON.stringify(r.body.settings));
r = await call('host', { method: 'POST', headers: host, body: { action: 'setExplicit', blockExplicit: true } });
check('old explicit toggle action no longer exists', r.code === 400);

// 7. Phone idle in auto mode -> request saved for host instead of lost
deviceActive = false; db.delete(K.taken); db.delete(K.now); spotifyQueue = [];
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Sam');
r2 = await call('host', { headers: host });
check('no active device: request kept as pending with a note', r.code === 202 && r2.body.pending.some((p) => p.id === 'AAAAAAAAAAAAAAAAAAAAAA' && /isn’t playing/.test(p.note)));
r = await call('host', { method: 'POST', headers: host, body: { action: 'approveAll' } });
check('approve fails cleanly while phone idle', r.code === 502 && /isn’t playing/.test(r.body.error));
deviceActive = true;
r = await call('host', { method: 'POST', headers: host, body: { action: 'approveAll' } });
r2 = await call('host', { headers: host });
check('approve all works once music resumes', r.code === 200 && spotifyQueue.includes('AAAAAAAAAAAAAAAAAAAAAA') && r2.body.pending.length === 0);

// 8. Skip + reset
const before = spotifyQueue.length;
r = await call('host', { method: 'POST', headers: host, body: { action: 'skip' } });
check('skip calls Spotify next', r.code === 200 && calls.includes('POST /v1/me/player/next') && spotifyQueue.length === before - 1);
currentId = 'DDDDDDDDDDDDDDDDDDDDDD'; db.delete(K.now); // put the original song back on for the later tests
await call('host', { method: 'POST', headers: host, body: { action: 'reset' } });
check('reset clears requests but keeps Spotify login', !db.has(K.taken) && !db.has(K.log) && peek(K.refresh) === 'RT');

// 8b. Party settings: generic defaults, overridable per party
r = await call('nowplaying');
check('settings: generic defaults when nothing is set', r.body.partyName === 'Diwali Party' && r.body.djName === 'DJ' && r.body.djFirstName === 'the DJ' && r.body.queueTitle === 'Song Request Queue' && r.body.repoUrl.includes('github.com') && !('timezone' in r.body), JSON.stringify(r.body).slice(0, 300));
Object.assign(process.env, { PARTY_NAME: 'Asha and Raj’s Diwali Party', DJ_NAME: 'DJ Rohan', QUEUE_TITLE: 'Diwali Song Request Queue' });
r = await call('nowplaying');
check('settings: party values come from environment', r.body.partyName === 'Asha and Raj’s Diwali Party' && r.body.djFirstName === 'Rohan' && r.body.queueTitle === 'Diwali Song Request Queue');
Object.assign(process.env, { DJ_NAME: 'Rohan’s Jukebox', HOST_NAME: 'Rohan' });
r = await call('nowplaying');
check('settings: title without DJ uses HOST_NAME in sentences', r.body.djName === 'Rohan’s Jukebox' && r.body.djFirstName === 'Rohan');
for (const k of ['PARTY_NAME', 'DJ_NAME', 'QUEUE_TITLE', 'HOST_NAME']) delete process.env[k];

// 9. Keepsake playlist + picks log
r = await call('host', { headers: host });
const ks = r.body.keepsake;
check('keepsake: one private playlist created for the night', playlistsCreated === 1 && ks.enabled && ks.url === 'https://open.spotify.com/playlist/PL1', JSON.stringify(ks));
check('keepsake: every queued guest song saved to it', ks.count >= 3 && playlistItems.length === ks.count && playlistItems.includes('PL1:AAAAAAAAAAAAAAAAAAAAAA'), JSON.stringify({ ks, playlistItems }));
r = await call('host', { headers: host, query: { export: 'csv' } });
check('keepsake: CSV has song, guest and dedication', r.headers['Content-Type'].startsWith('text/csv') && r.body.includes('#,Time,Song,Artist,Requested by,Dedication') && r.body.includes('"Clean Song","Artist","Priya","For the hosts 💛"'), r.body.slice(0, 300));
check('keepsake: reset night keeps the keepsake', peek(K.picks)?.length === ks.count && peek(K.keepsake));

// a broken playlist call never stops the song from playing
spotifyQueue = []; db.delete(K.now); playlistDown = true;
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Isha');
r2 = await call('host', { headers: host });
check('keepsake: playlist failure doesn’t block the song', r.body.status === 'queued' && spotifyQueue.includes('AAAAAAAAAAAAAAAAAAAAAA') && /Playlist service down/.test(r2.body.keepsake.error || ''), JSON.stringify(r2.body.keepsake));
playlistDown = false;

// old connection without playlist permission: still logs the pick, asks host to reconnect
db.set(K.scope, 'user-read-playback-state user-modify-playback-state');
const itemsBefore = playlistItems.length;
spotifyQueue = []; db.delete(K.now);
r = await guestReq('CCCCCCCCCCCCCCCCCCCCCC', 'Dev');
r2 = await call('host', { headers: host });
check('keepsake: without permission, song plays + is logged, host sees reconnect', r.body.status === 'queued' && playlistItems.length === itemsBefore && r2.body.keepsake.enabled === false && r2.body.keepsake.count === ks.count + 2);
db.set(K.scope, grantedScope);

// next party: new keepsake; two guests at once still make only one new playlist
await call('host', { method: 'POST', headers: host, body: { action: 'newKeepsake' } });
await call('host', { method: 'POST', headers: host, body: { action: 'reset' } });
spotifyQueue = []; db.delete(K.now);
const created = playlistsCreated;
await Promise.all([guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'X'), guestReq('CCCCCCCCCCCCCCCCCCCCCC', 'Y')]);
r = await call('host', { headers: host });
check('keepsake: new party starts fresh, simultaneous requests share one playlist', playlistsCreated === created + 1 && r.body.keepsake.count === 2 && r.body.keepsake.url.endsWith('PL' + playlistsCreated), JSON.stringify({ created, playlistsCreated, k: r.body.keepsake }));

// 10. Each guest's own requests + where their song is in the queue
await call('host', { method: 'POST', headers: host, body: { action: 'reset' } });
await call('host', { method: 'POST', headers: host, body: { action: 'setMode', mode: 'auto' } });
spotifyQueue = ['DDDDDDDDDDDDDDDDDDDDDD']; currentId = 'DDDDDDDDDDDDDDDDDDDDDD'; db.delete(K.now);
spotifyQueue = []; db.delete(K.now);
const G1 = 'guestone1234567890ab', G2 = 'guesttwo1234567890ab';
const req2 = (id, guestId, name = 'Priya') => call('request', { method: 'POST', body: { trackId: id, guestName: name, guestId } });
await req2('AAAAAAAAAAAAAAAAAAAAAA', G2, 'Rahul');                // someone else's song first
r = await req2('CCCCCCCCCCCCCCCCCCCCCC', G1);
check('position: guest told how many songs are ahead', r.body.status === 'queued' && r.body.position?.ahead === 1 && !('aheadMs' in r.body.position), JSON.stringify(r.body.position));
r = await call('nowplaying', { query: { guest: G1 } });
check('position: guest sees own request with live status', r.body.mine?.length === 1 && r.body.mine[0].id === 'CCCCCCCCCCCCCCCCCCCCCC' && r.body.mine[0].status === 'queued' && r.body.mine[0].ahead === 1, JSON.stringify(r.body.mine));
check('privacy: guest never sees another guest’s requests', !r.body.mine.some((p) => p.id === 'AAAAAAAAAAAAAAAAAAAAAA'));
r = await call('nowplaying', { query: { guest: 'bad id!' } });
check('privacy: invalid guest id gets no history', r.body.mine === undefined);
r = await call('nowplaying');
check('no guest id: page still works, no history field', r.body.connected && r.body.mine === undefined && r.body.upNext.length <= 10);

// Rahul's song plays, then Priya's is next, then hers plays
await call('host', { method: 'POST', headers: host, body: { action: 'skip' } }); db.delete(K.now);
r = await call('nowplaying', { query: { guest: G1 } });
check('position: counts down to "plays next"', r.body.mine[0].status === 'queued' && r.body.mine[0].ahead === 0, JSON.stringify(r.body.mine[0]));
await call('host', { method: 'POST', headers: host, body: { action: 'skip' } }); db.delete(K.now);
r = await call('nowplaying', { query: { guest: G1 } });
check('position: shows "playing now" when it’s on', r.body.mine[0].status === 'playing');
currentId = 'DDDDDDDDDDDDDDDDDDDDDD'; db.delete(K.now);
r = await call('nowplaying', { query: { guest: G1 } });
check('position: just-finished song waits out the grace period (no false "played")', r.body.mine[0].status === 'queued' && r.body.mine[0].ahead === null);
const realNow = Date.now; Date.now = () => realNow() + 5 * 60 * 1000; db.delete(K.now);
r = await call('nowplaying', { query: { guest: G1 } });
Date.now = realNow;
check('position: later it shows "played" and stays that way', r.body.mine[0].status === 'played' && JSON.parse(peek(K.guest(G1)).get('CCCCCCCCCCCCCCCCCCCCCC')).status === 'played');

// approval mode: waiting → approved goes into the queue; declined says so
await call('host', { method: 'POST', headers: host, body: { action: 'setMode', mode: 'approve' } });
db.delete(K.now);
await req2('BBBBBBBBBBBBBBBBBBBBBB', G1);      // explicit songs are allowed
r = await call('nowplaying', { query: { guest: G1 } });
check('approve mode: guest sees "waiting"', r.body.mine[0].id === 'BBBBBBBBBBBBBBBBBBBBBB' && r.body.mine[0].status === 'pending');
await call('host', { method: 'POST', headers: host, body: { action: 'approve', trackId: 'BBBBBBBBBBBBBBBBBBBBBB' } });
r = await call('nowplaying', { query: { guest: G1 } });
check('approve mode: approved song shows its place in the queue', r.body.mine[0].status === 'queued' && r.body.mine[0].ahead === 0, JSON.stringify(r.body.mine[0]));
await call('host', { method: 'POST', headers: host, body: { action: 'reset' } });
await req2('AAAAAAAAAAAAAAAAAAAAAA', G1);
await call('host', { method: 'POST', headers: host, body: { action: 'reject', trackId: 'AAAAAAAAAAAAAAAAAAAAAA' } });
r = await call('nowplaying', { query: { guest: G1 } });
check('approve mode: declined request says so', r.body.mine.find((p) => p.id === 'AAAAAAAAAAAAAAAAAAAAAA')?.status === 'declined');
check('history: newest request first, older ones kept', r.body.mine.length === 3 && r.body.mine[0].id === 'AAAAAAAAAAAAAAAAAAAAAA');

// new party clears everyone's history
await call('host', { method: 'POST', headers: host, body: { action: 'newKeepsake' } });
r = await call('nowplaying', { query: { guest: G1 } });
check('new party: guest histories start fresh', r.body.mine.length === 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
