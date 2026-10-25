# 🎧 Party DJ: QR song requests straight into your Spotify queue

Guests scan a QR code, search Spotify, add a dedication, and tap **Add**. The song lands in the
host's real Spotify queue. No app or login for guests. Your phone keeps playing through the
speaker as usual, and tapping **Next** plays requests in order.

Built for a Diwali party (marigold garland, diyas, rangoli, fireworks), but every name and title is a setting.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdys2806%2Fdj-darshan&project-name=party-dj&repository-name=party-dj&env=SPOTIFY_CLIENT_ID%2CSPOTIFY_CLIENT_SECRET%2CHOST_PIN%2CAPP_URL&envDescription=Spotify%20app%20keys%2C%20a%20PIN%20for%20your%20DJ%20booth%2C%20and%20this%20site%27s%20address%20%28https%3A%2F%2FYOUR-PROJECT.vercel.app%29&envLink=https%3A%2F%2Fgithub.com%2Fdys2806%2Fdj-darshan%232-deploy&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%2C%22protocol%22%3A%22storage%22%2C%22envVarPrefix%22%3A%22KV%22%7D%5D)

## What you get

| Page | Who | What it does |
|---|---|---|
| `/` | Guests | Search, add a song + dedication, see Now Playing and Up Next with "requested by" |
| `/host` | You (PIN) | Auto ↔ Approve toggle, explicit filter, approve/decline, Next, keepsake playlist, reset |
| `/tv` | Big screen | Now playing on a spinning record, Up Next, dedications, QR code, fireworks for each new request |
| `/qr` | Printing | QR poster for the party |

**Every request goes through:** a valid song → explicit filter (checked on the server) → duplicate guard
(already requested, playing now, or queued) → straight into the queue (**Auto**) or held for you (**Approve**).
If music is paused, requests wait for you instead of being lost.

**Guest picks keepsake:** every guest song is saved to a private Spotify playlist and logged with who asked
and their dedication. Download it all as a CSV from `/host` after the party.

## Set it up for your party (about 15 minutes, all free)

You need: a **Spotify Premium** account (the one that plays at the party), a **GitHub** account, and a **Vercel** account.

### 1. Create a Spotify app
1. Go to <https://developer.spotify.com/dashboard> and click **Create app**.
2. Name it anything. For **Redirect URI**, enter `https://YOUR-PROJECT.vercel.app/api/callback`.
   You'll know your exact project name in step 2. You can come back and edit it.
3. Tick **Web API**, accept the terms and save. Keep the page open: you need the **Client ID** and **Client secret**.

> Spotify development-mode apps require the owner to have Premium and allow 5 users.
> Only the host signs in to Spotify, so that's plenty. Guests never authorize anything.

### 2. Deploy
Click **Deploy with Vercel** above. It copies this project to your GitHub, creates the free Upstash Redis
storage, and asks for four settings:

| Setting | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | From your Spotify app |
| `SPOTIFY_CLIENT_SECRET` | From your Spotify app (**View client secret**) |
| `HOST_PIN` | Any PIN you choose; it protects `/host` |
| `APP_URL` | Your site address, no trailing slash, e.g. `https://party-dj.vercel.app` |

Then make sure the Spotify **Redirect URI** is exactly `APP_URL` + `/api/callback`.

<details><summary>Deploying without the button</summary>

Fork or copy this repo, import it at <https://vercel.com/new> (preset **Other**), then in the project:
**Storage → Create Database → Upstash for Redis → Free**, with env prefix `KV`. Add the four settings above
under **Settings → Environment Variables** and redeploy.
</details>

### 3. Make it yours (optional settings)
Add any of these under **Settings → Environment Variables**, then redeploy:

| Setting | Shown as | Default |
|---|---|---|
| `PARTY_NAME` | Party title on every page and the keepsake playlist | `Diwali Party` |
| `DJ_NAME` | The big neon name, e.g. `DJ Rohan` | `DJ` |
| `QUEUE_TITLE` | Headline on the poster and big screen | `Song Request Queue` |
| `GREETING` | Chip under the name, e.g. `✨ Shubh Deepavali · requests open all night` | `✨ Requests open all night` |
| `DEDICATION_EXAMPLE` | Hint in the dedication box | `For our amazing hosts 💛` |
| `PARTY_TIMEZONE` | Times in the picks CSV | `America/Los_Angeles` |
| `REPO_URL` | Where "Get this for your party" links | this repo |

### 4. Connect Spotify
Open `https://YOUR-SITE/host`, enter your PIN, tap **Connect Spotify** and approve.

## Party-night checklist
- [ ] Party phone on a charger, Spotify open, a playlist **already playing** (Spotify only accepts queue adds while something plays).
- [ ] `/host` open on your phone. Pick **Auto** or **Approve**.
- [ ] `/tv` on a TV or laptop: tap **Full screen** (the screen stays awake). Or print `/qr`.
- [ ] One test request from a friend's phone.
- [ ] After the party: **Open playlist in Spotify** and **Picks + dedications (CSV)** on `/host`.

## Good to know
- **Reset night** clears requests, duplicate memory and the activity log. It keeps the keepsake.
  **New keepsake** starts a fresh playlist for your next party.
- Spotify's API can't remove a song once it's queued. Use **Approve** mode if you want a gate.
- Guest search shows the top 10 matches (Spotify's development-mode limit).
- Now Playing / Up Next is cached for ~8 seconds to stay well within Spotify's rate limits.
- Phones set to "reduce motion" get a calmer page; the diyas keep burning.

## Troubleshooting
| Message | Fix |
|---|---|
| "Spotify isn't playing on the host phone right now." | Press play in Spotify. Waiting requests are under **Waiting for approval**: tap **Approve all**. |
| "The host needs to connect Spotify…" | `/host` → **Reconnect Spotify**. |
| Spotify says `INVALID_CLIENT: Invalid redirect URI` | The Spotify Redirect URI must equal `APP_URL` + `/api/callback` exactly. |
| Keepsake card says "Reconnect Spotify" | Tap it once to grant playlist permission. |

## Developing
`npm install && npm test` runs the end-to-end suite offline against a fake Spotify and a fake Redis:
login security, auto-queue, duplicates, explicit filter, dedications, approval flow, idle-phone fallback,
keepsake playlist, CSV, settings, skip and reset.

Stack: static HTML pages + Vercel serverless functions (`api/`) + Upstash Redis. No framework, no build step.

## License
MIT. See [LICENSE](LICENSE).
