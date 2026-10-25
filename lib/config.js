// lib/config.js — everything that makes this "your" party, read from environment variables.
// Set these in Vercel (Settings → Environment Variables). All are optional.
export function partyConfig() {
  const env = (k, fallback) => (process.env[k] || '').trim() || fallback;
  const djName = env('DJ_NAME', 'DJ');
  return {
    partyName: env('PARTY_NAME', 'Diwali Party'),                       // e.g. "Asha and Raj’s Diwali Party"
    djName,                                                              // e.g. "DJ Rohan"
    djFirstName: djName.replace(/^DJ(\s+|$)/i, '').trim() || 'the DJ',   // "Rohan" (used in friendly sentences)
    queueTitle: env('QUEUE_TITLE', 'Song Request Queue'),                // headline on the QR poster + big screen
    greeting: env('GREETING', '✨ Requests open all night'),             // chip under the name on the guest page
    dedicationExample: env('DEDICATION_EXAMPLE', 'For our amazing hosts 💛'), // hint in the dedication box
    timezone: env('PARTY_TIMEZONE', 'America/Los_Angeles'),              // times in the picks CSV
    repoUrl: env('REPO_URL', 'https://github.com/dys2806/dj-darshan'),    // "Get this for your party" link
  };
}
