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
    case 'set': db.set(k, String(a[1])); return 'OK';
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
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url); const m = opts.method || 'GET';
  if (u.hostname === 'fake.upstash.io') return upstash(u, opts);
  calls.push(`${m} ${u.pathname}`);
  const json = (s, b) => new Response(b == null ? '' : JSON.stringify(b), { status: s });
  if (u.hostname === 'accounts.spotify.com') return json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
  if (u.pathname === '/v1/search') return json(200, { tracks: { items: Object.keys(tracks).map(mk) } });
  if (u.pathname.startsWith('/v1/tracks/')) return json(200, mk(u.pathname.split('/').pop()));
  if (u.pathname === '/v1/me/player/queue' && m === 'GET') return json(200, { currently_playing: mk('DDDDDDDDDDDDDDDDDDDDDD'), queue: spotifyQueue.map(mk) });
  if (u.pathname === '/v1/me/player/queue' && m === 'POST') {
    if (!deviceActive) return json(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } });
    spotifyQueue.push(u.searchParams.get('uri').split(':').pop()); return json(200, null);
  }
  if (u.pathname === '/v1/me/player/next') { spotifyQueue.shift(); return json(200, null); }
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

// 3. Auto mode (default) with explicit blocked (default)
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Priya', '  For   Kirti 💛 ');
check('auto mode: clean song queued straight to Spotify', r.body.status === 'queued' && spotifyQueue.includes('AAAAAAAAAAAAAAAAAAAAAA'));
r = await guestReq('AAAAAAAAAAAAAAAAAAAAAA', 'Rahul');
check('duplicate blocked', r.code === 409 && r.body.status === 'duplicate');
r = await guestReq('DDDDDDDDDDDDDDDDDDDDDD');
check('currently playing song counts as duplicate', r.code === 409);
r = await guestReq('BBBBBBBBBBBBBBBBBBBBBB');
check('explicit song blocked', r.code === 403 && r.body.status === 'blocked');
r = await guestReq('not-a-real-id');
check('invalid track id rejected', r.code === 400);
r = await call('search', { query: { q: 'song' } });
const a = r.body.tracks.find((t) => t.id === 'AAAAAAAAAAAAAAAAAAAAAA');
check('search marks requested songs as taken + reports explicit setting', a.taken === true && r.body.blockExplicit === true);
db.delete(K.now);
r = await call('nowplaying');
check('up next shows who requested', r.body.upNext[0]?.requestedBy === 'Priya' && r.body.current.name === 'Playing Now', JSON.stringify(r.body));
check('dedication shown in Up Next, whitespace tidied', r.body.upNext[0]?.dedication === 'For Kirti 💛', JSON.stringify(r.body.upNext[0]));

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

// 6. Explicit toggle off
await call('host', { method: 'POST', headers: host, body: { action: 'setMode', mode: 'auto' } });
await call('host', { method: 'POST', headers: host, body: { action: 'setExplicit', blockExplicit: false } });
r = await guestReq('BBBBBBBBBBBBBBBBBBBBBB');
check('explicit allowed once host turns filter off', r.body.status === 'queued');

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
await call('host', { method: 'POST', headers: host, body: { action: 'reset' } });
check('reset clears requests but keeps Spotify login', !db.has(K.taken) && !db.has(K.log) && peek(K.refresh) === 'RT');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
