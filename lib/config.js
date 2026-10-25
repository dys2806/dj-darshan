// lib/config.js — everything that makes this "your" party, read from environment variables.
// Set these in Vercel (Settings → Environment Variables). All are optional.
export function partyConfig() {
  const env = (k, fallback) => (process.env[k] || '').trim() || fallback;
  const djName = env('DJ_NAME', 'DJ');
  return {
    partyName: env('PARTY_NAME', 'Diwali Party'),                       // e.g. "Asha and Raj’s Diwali Party"
    djName,                                                              // big animated name, e.g. "Rohan's Jukebox" or "DJ Rohan"
    // Host's own name for friendly sentences ("So Rohan knows who picked it"). HOST_NAME wins;
    // otherwise strip a leading "DJ " from DJ_NAME; otherwise "the DJ".
    djFirstName: env('HOST_NAME', '') || djName.replace(/^DJ(\s+|$)/i, '').trim() || 'the DJ',
    queueTitle: env('QUEUE_TITLE', 'Song Request Queue'),                // headline on the QR poster + big screen
    greeting: env('GREETING', '✨ Requests open all night'),             // chip under the name on the guest page
    dedicationExample: env('DEDICATION_EXAMPLE', 'For our amazing hosts 💛'), // hint in the dedication box
    timezone: env('PARTY_TIMEZONE', 'America/Los_Angeles'),              // times in the picks CSV
    repoUrl: env('REPO_URL', 'https://github.com/dys2806/dj-darshan'),    // "Get this for your party" link
  };
}
