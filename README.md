# Coop Hub

Personal, single-user tracker for University of Waterloo co-op postings, design teams, and clubs.
No login, no multi-user support — this is meant to be deployed for one person's own use.

## Stack

- Next.js (App Router) + TypeScript, Tailwind v4 (dark theme only)
- SQLite via Prisma 7, using the `@prisma/adapter-better-sqlite3` driver adapter
- Deployed on **Railway** with a persistent volume for the SQLite file (see below for why)

## Local development

```bash
npm install
npm run db:migrate   # creates ./dev.db and applies migrations
npm run db:seed       # loads data/design-teams.json, data/clubs.json, data/company-sources.json
npm run dev
```

Open http://localhost:3000. The dev server also seeds automatically on boot (see `instrumentation.ts`),
so `npm run db:seed` is only needed if you want to seed without starting the server.

Run tests with:

```bash
npm test
```

## Editing the data you track

### Design teams / clubs — `data/design-teams.json`, `data/clubs.json`

Static files you edit by hand. Each item:

```json
{ "slug": "wat-ai", "name": "WAT.ai", "url": "https://watai.ca/", "description": "...", "tags": ["ai"], "sortOrder": 10 }
```

`slug` must be unique and stable — it's the upsert key, so renaming it creates a new row instead of
updating the existing one. Fields here are re-synced from the file on every server boot; anything you
edit *in the app itself* (application status, notes, deadline, last-checked date) is a separate
database column that the seed step never overwrites. Removing an item from the JSON doesn't delete it
from the app — it just gets flagged "No longer in seed list" in case you'd saved/tracked it.

There is **no automatic fetching** for these two tabs — that's intentional (see the original brief:
there's no reliable public API for "has this club's application opened"). Use the **Check now** button
on a card to open the team/club's site and eyeball it yourself; it also stamps a "last checked" date.

### Co-op — manual entries + `data/company-sources.json`

Most postings you'll add by hand from the Co-op tab ("+ Add posting"). The JSON file configures a
small set of company career pages the daily fetcher checks automatically:

```json
{
  "key": "robinhood",
  "name": "Robinhood",
  "careerUrl": "https://careers.robinhood.com/",
  "adapter": "greenhouse",
  "enabled": true,
  "config": { "boardToken": "robinhood" },
  "match": { "includeTitle": "(intern|co-?op)", "excludeTitle": "(senior|staff)" }
}
```

Four adapters ship in `lib/sources/adapters/`:

- **`greenhouse`** — `config.boardToken`. Find it from a company's Greenhouse-hosted careers URL
  (`boards.greenhouse.io/<token>`), or by checking whether
  `https://boards-api.greenhouse.io/v1/boards/<token>/jobs` returns JSON.
- **`lever`** — `config.company`, similarly from `jobs.lever.co/<company>`.
- **`generic-css`** — fallback for sites without a JSON API. `config: { listSelector, titleSelector, linkSelector?, locationSelector?, baseUrl? }`, scraped with Cheerio. This is the one most likely to break when a site redesigns — that's expected, and the fetcher is built to fail safely when it does (see below).
- **`generic-json`** — for a hand-found XHR endpoint that isn't Greenhouse/Lever-shaped. `config: { endpoint, itemsPath, fields: { title, url, location? }, baseUrl? }`, where `itemsPath` is a dot-path to the array in the response.

`match.includeTitle` / `excludeTitle` / `includeLocation` are optional case-insensitive regexes applied
after fetching, so you don't have to touch adapter code to narrow results down to co-op/intern roles.

Only `robinhood` (Greenhouse) and `palantir` (Lever) ship enabled by default, purely as a **working,
verified example** of both adapters — pick real companies you're actually targeting and add them here.
Check `/sources` in the app for each source's last run time, last error, and a manual "Run now" button —
that page is the first place to look if fetched postings stop showing up.

**Never add WaterlooWorks or any other authenticated/ToS-protected site here.** The fetcher only talks
to public, unauthenticated career-page endpoints, one request per source per day with a declared
User-Agent — see `lib/sources/fetchSource.ts` and `lib/jobs/dailyRefresh.ts`.

### How "new" and "possibly closed" are decided

A fetched posting is flagged **New** for 72 hours after first being seen. A posting is flagged
**Possibly closed** only after it's missing from **two consecutive successful fetches** (so one flaky
page load doesn't falsely close something) — you'll see "Still open" / "Confirm closed" buttons on it.
A run that comes back with zero postings when there were previously postings is treated as a **failed**
run rather than "everything closed" (this is the most common real failure mode — a broken CSS selector
or a renamed API — and this guard is what keeps it from silently wiping your co-op tab).

## Deployment (Railway)

SQLite needs a writable, persistent disk — that rules out Vercel's serverless functions, which have no
persistent filesystem between invocations. Railway (or Fly.io) gives you a small always-on container
with an attached volume instead, which is what this app expects.

1. Push this repo to GitHub.
2. In Railway, create a new project from that GitHub repo (it auto-detects Node via Nixpacks — `railway.toml` in this repo already sets the build/start/healthcheck commands).
3. Add a **volume** to the service, mounted at `/data`.
4. Set these service **variables** before the first deploy (Railway exposes them at build time, which matters because `postinstall` runs `prisma generate`):
   - `DATABASE_URL=file:/data/coophub.db` — must be an absolute path into the volume
   - `CRON_SECRET=<a long random string>` — required by `/api/cron/refresh` and `/api/sources/[key]/run`
   - `ENABLE_CRON=1`
   - `CRON_SCHEDULE=0 8 * * *` (or whatever time you want the daily fetch to run)
   - `TZ=America/Toronto`
   - `FETCH_USER_AGENT=CoopHub/1.0 (your name or contact, optional)`
5. Deploy. Confirm `https://<your-app>.up.railway.app/api/health` returns `{"ok":true}`, then check `/sources` — it should show a successful run once the boot catch-up kicks in (~20s after startup) or once the daily schedule fires.
6. `numReplicas` is pinned to `1` in `railway.toml` — **do not** scale this service beyond one instance. SQLite on a single volume can't be shared by two containers.

### How the daily cron actually runs

There's no separate worker service — Railway volumes attach to exactly one service, so a standalone
cron service would have no access to the database file. Instead, `instrumentation.ts` starts an
in-process `node-cron` schedule on server boot (`lib/jobs/scheduler.ts`), plus a one-time catch-up check
~20 seconds after boot that runs the fetch immediately if the last successful run is missing or more
than 20 hours old — this is what keeps a redeploy near your scheduled time from silently skipping a day.

If that ever proves unreliable, the fallback is a second, volume-less Railway service on its own cron
schedule that just does:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.up.railway.app/api/cron/refresh"
```

No code change needed for that — the endpoint already exists and is what the in-process scheduler calls.

### Backups

This is a single SQLite file with no replication. Options, roughly in order of effort:

- Railway's own volume snapshots (check current Railway volume backup support).
- `railway ssh` into the service, then `sqlite3 /data/coophub.db ".backup /data/backup.db"` and download it.
- Add a small authenticated `/api/admin/backup` route that streams the file — not included in v1, but trivial to add if you want it (same auth pattern as `/api/cron/refresh`).

## Known trade-offs / v1 limitations

- No auth, no multi-user — by design, per the original brief.
- No email/notification system — deadlines are surfaced only as in-app badges/borders (amber for ≤7 days, rose for overdue).
- `npm audit` reports 4 high-severity advisories in `mysql2` / `deepmerge-ts`, pulled in transitively by Prisma's CLI config loader (`@prisma/config`) regardless of which database provider you use. This app only ever talks to SQLite — the vulnerable MySQL code path is never reached — so this was left as-is rather than forcing a Prisma downgrade. Worth re-checking with `npm audit` occasionally in case a patched Prisma release resolves it upstream.
- The `generic-css` adapter is inherently fragile (any site redesign breaks it) — that's why Greenhouse/Lever are preferred, and why the fetcher has zero-result and sanity guards rather than trusting every fetch at face value.
