# Party DJ — scan a QR, request a song, it lands in your Spotify queue

Guests scan a QR code, search Spotify, and tap **Add**. No app or login needed for guests.
Your phone keeps playing through the JBL speaker as usual; requests go into Spotify's real queue,
so tapping **Next** on your phone plays them in order.

| Page | Who | What it does |
|---|---|---|
| `/` | Guests | Search, add a song, see Now Playing + Up Next (with "requested by") |
| `/host` | You (PIN) | Auto ↔ Approve toggle, explicit filter, approve/decline, Next, reset |
| `/qr` | You | Printable QR poster that always points at your deployed URL |
| `/tv` | Big screen | TV/laptop view: now playing on a spinning record, Up Next, dedications, QR code, fireworks for every new request |

**Rules every request goes through:** valid song → explicit filter (server-side, can't be faked) →
duplicate guard (already requested, playing now, or in the queue) → auto-queue **or** hold for approval.
If Spotify isn't reachable in Auto mode (e.g. music paused), the request is kept for you to approve
instead of being lost.

---

## Setup (≈15 minutes, all free)

### 1. Spotify app
1. Open <https://developer.spotify.com/dashboard> → your app → **Settings**.
2. Under **Redirect URIs** add `https://YOUR-PROJECT.vercel.app/api/callback`
   (you'll know the exact name after step 3; come back and add it then).
3. Make sure **Web API** is ticked. Copy the **Client ID** and **Client Secret**.

> Spotify development-mode apps need the owner on Premium and allow 5 authorized users. Only *you*
> log in to Spotify, so that's plenty: guests never authorize the app.

### 2. GitHub
Create a new **private** repo (e.g. `party-dj`) and push this folder to it:
```bash
cd party-dj
git init && git add . && git commit -m "Party DJ"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/party-dj.git
git push -u origin main
```

### 3. Vercel project
1. <https://vercel.com/new> → import the `party-dj` repo → Framework preset **Other** → **Deploy**.
2. Note the URL, e.g. `https://party-dj-darshan.vercel.app`. Add `…/api/callback` to Spotify (step 1.2).

### 4. Storage (Upstash Redis, free tier)
Vercel project → **Storage** → **Create Database** → **Upstash for Redis** → free plan → connect it to
this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

### 5. Environment variables
Vercel project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | from step 1 |
| `SPOTIFY_CLIENT_SECRET` | from step 1 |
| `APP_URL` | your Vercel URL, no trailing slash, e.g. `https://party-dj-darshan.vercel.app` |
| `HOST_PIN` | any PIN only you know, e.g. `7391` |
| `PARTY_NAME` | optional; party title on the guest page and poster (default `Himanshu and Kirti’s Diwali Party`) |
| `DJ_NAME` | optional; big name on the guest page and poster (default `DJ Darshan`) |

Then **Deployments → ⋯ → Redeploy** so the variables take effect.

### 6. Connect Spotify
On your phone, open `https://YOUR-URL/host`, enter the PIN, tap **Connect Spotify**, approve.

### 7. QR code
Open `https://YOUR-URL/qr` → **Print poster**, or keep it open on a tablet/laptop by the speaker.

---

## Guest picks keepsake
Every guest song that reaches Spotify is saved to a private playlist (created with the first request)
and logged with who asked and their dedication. On `/host`: **Open playlist in Spotify** or download
**Picks + dedications (CSV)**. *Reset night* keeps the keepsake; *New keepsake* starts fresh for the next party.
If you connected Spotify before this feature existed, tap **Reconnect Spotify** once to grant playlist permission.

## Party-night checklist
- [ ] Phone on a charger, Spotify open, a playlist **already playing** to the JBL
      (Spotify only accepts queue adds when something is playing).
- [ ] `/host` open in a browser tab on your phone. Pick **Auto** or **Approve**.
- [ ] Big screen: open `https://YOUR-URL/tv` on a TV or laptop, tap **Full screen** (the screen stays awake).
- [ ] Test once from a friend's phone: scan → add a song → it shows in Up Next.
- [ ] Wi-Fi password posted next to the QR code (guests need internet).
- [ ] Next morning: **Reset night** on `/host` clears requests for the next party.

## Troubleshooting
| Message | Fix |
|---|---|
| "Spotify isn't playing on the host phone right now." | Press play in Spotify. Requests made meanwhile are waiting under **Waiting for approval**; tap **Approve all**. |
| "The host needs to connect Spotify…" | `/host` → **Reconnect Spotify**. |
| Spotify says `INVALID_CLIENT: Invalid redirect URI` | The Redirect URI in Spotify must exactly equal `APP_URL` + `/api/callback`. |
| Guest page loads but search errors | Check `SPOTIFY_CLIENT_*` and that you redeployed after adding variables. |

## Limits worth knowing
- Spotify's API can't remove a song from the queue once added. Use **Approve** mode if you want a gate.
- Search shows the top 10 matches (Spotify's development-mode cap); guests can refine their query.
- Now Playing / Up Next is cached for ~8 seconds to stay well inside Spotify's rate limits.

## Tests
`npm install && npm test` runs 34 end-to-end checks offline (fake Spotify + fake Redis):
login/state security, auto-queue, duplicates, explicit filter, dedications, guest-picks keepsake playlist, approval flow, idle-phone fallback,
skip and reset.
