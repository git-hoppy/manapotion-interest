# Mana Potion "I'm interested" counter - backend

Two small Vercel functions behind the release calendar page on manapotion.io (theme 2.0.42 and later).

What it does
- On a set whose release date is NOT confirmed, the calendar shows an "I'm interested" button. A click sends the set name to `POST /api/interest`, which saves one anonymous vote in Vercel Blob.
- One vote per visitor and set: the file name is a hash of the visitor's IP address (with a secret salt), so the same person clicking twice counts once, and no IP address is stored.
- `GET /api/interest-report?key=...` shows you the counts (only with your secret key).

Files
- api/interest.js          saves a vote
- api/interest-report.js   the report (table, or `&format=json`)
- lib/common.js            shared helpers
- test/run.js              local test with an in-memory store: `node test/run.js`
- package.json, vercel.json

## Setup (about 10 minutes)

### 1. Vercel project
- New project named exactly **manapotion-interest** (so the URL is https://manapotion-interest.vercel.app). Import this folder from a Git repo, or run `npx vercel --prod` inside it.
- Project > **Storage** > Create / connect a **Blob** store (you already use one for the price list; a new, separate store is tidier). Connecting it adds `BLOB_READ_WRITE_TOKEN` automatically.
- Project > Settings > Environment Variables (Production):
  - IP_SALT      = any long random text (for example 30 random characters)
  - ADMIN_KEY    = another long random text, this is the key for the report
  - ALLOWED_ORIGINS = https://manapotion.io,https://www.manapotion.io   (optional, this is the default)
- Redeploy after saving the variables.
- If the URL ended up different, change `release_calendar.interest_endpoint` in the theme's lang/en.json (or tell me).

### 2. Test
- Open /release-calendar/ (theme 2.0.42), click "I'm interested" on a set that is not confirmed. It should turn into "Interest noted".
- Open `https://manapotion-interest.vercel.app/api/interest-report?key=YOUR_ADMIN_KEY` : the set should show 1 person.
- To delete test votes: Vercel > Storage > your Blob store > delete the files under `interest/`.

## Notes
- It counts addresses, not people: two people on the same network (or one phone network address) count as one vote, and one person on several networks counts more than once. Treat it as a rough signal, not an exact number.
- The button only appears on sets with an unconfirmed date. Votes for a set stay in the report after it is confirmed.
- Limits: 30 requests per address per hour; a hidden field catches simple bots.
