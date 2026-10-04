# TappedIn

A personal, all-in-one tracker for a University of Waterloo degree: co-op/internship postings pulled
from every source worth watching, one pipeline for every application (co-op, design teams, clubs,
hackathons), a calendar, contacts, and a term-by-term record of the whole five years.

Single user, password-protected.

## What's in it

| Page | What it does |
| --- | --- |
| **Today** | Up next (interviews, OAs, deadlines, next steps, follow-ups), stale applications to mark ghosted, fresh jobs, upcoming hackathons, teams/clubs recruiting. |
| **Jobs** | Every posting from every source, **deduplicated** — filter by region, UW term, role type; "new since last visit"; one-click Save / Applied. |
| **Applications** | Kanban board (drag between Saved → Applied → OA → Interview → Offer) or table. Quick-add and bulk-paste for WaterlooWorks. Each application has a timeline, details (term, channel, WW job ID, resume version, pay, next step), notes and linked people. |
| **Calendar** | Month view + agenda, and a private `.ics` feed to subscribe to from Google/Apple Calendar. |
| **Hackathons / Design teams / Clubs** | Curated lists + every MLH hackathon within reach, refreshed daily. |
| **Contacts** | Recruiters, referrers, interviewers, with follow-up dates. |
| **Journey** | Five years of terms — study/work/off, employer, pay, rating. Offers drop straight in. |
| **Insights** | Funnel, weekly pace, response rate by channel and by resume version, per-term breakdown. |
| **Sources / Settings** | Source health, refresh-now, JSON/CSV backup, calendar link, theme, sign out. |

Search everything with **⌘K / Ctrl+K**.

## Where jobs come from

Configured in `data/company-sources.json` (re-synced on every deploy):

- **Curated lists** (run first, so they become the canonical copy of a job):
  - [negarprh/Canadian-Tech-Internships](https://github.com/negarprh/Canadian-Tech-Internships-2027) — `markdown-table`
  - [SimplifyJobs/Summer20XX-Internships](https://github.com/SimplifyJobs/Summer2027-Internships) (all terms, incl. off-season) — `simplify`
  - [vanshb03/Summer20XX-Internships](https://github.com/vanshb03/Summer2027-Internships) — `simplify`
  - [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) — off by default; turn on in final year
- **Company boards**: Workday (RBC, TD, Ciena, NVIDIA), Ashby (Cohere, Wealthsimple, Ramp, Notion), Greenhouse (Robinhood), Lever (Palantir).
- **WaterlooWorks** can't be fetched (it's behind your login and its terms forbid scraping) — use **Add from WaterlooWorks** / bulk paste.

List URLs may contain `{year}`: they expand to this recruiting year and the next, so the sources roll
over from `Summer2027` to `Summer2028` by themselves.

Adapters (`lib/sources/adapters/`): `greenhouse` (`boardToken`), `lever` (`company`), `ashby` (`org`),
`workday` (`host`, `tenant`, `site`, `searchText` — read them off any job URL like
`https://ciena.wd5.myworkdayjobs.com/Careers/job/…`), `smartrecruiters` (`company`), `simplify`
(`url`), `markdown-table` (`url`), plus `generic-css` / `generic-json` fallbacks. `match` narrows a
source with `includeTitle` / `excludeTitle` / `includeLocation` regexes and `regions`
(`canada`, `remote`, `us`, `intl`).

### No repeats

Every posting gets two keys: its application URL (minus tracking params, `www`, trailing `/apply`) and
company + role (normalized so "Co-op"/"Intern"/"Internship" and "Inc."/"Corp" agree). A job that
matches an existing one from another source — or one you typed in — is stored as a hidden duplicate of
it, so it shows once with a "N sources" badge, and you track it once.

### New / possibly closed

A posting is **New** until you've visited the Jobs page after it appeared. A posting is flagged
**possibly closed** only after it's missing from two consecutive successful fetches; a run that
suddenly returns zero (or a fraction of) postings is treated as a broken source, not mass closure.

### Best match first

Each refresh reads the text of every new posting (`lib/details`): the public APIs of Greenhouse,
Lever, Ashby, SmartRecruiters, Workday, Workable and Oracle Cloud, or the page itself (JSON-LD, then
the page text). When the ATS says a posting no longer exists, it's closed straight away, without
waiting for the lists to drop it. A tracked job is never closed this way; it gets a "taken down" note.

`lib/fit` then reads who the job is for and scores it 0–100 against **Settings → What you're looking
for** (terms, role types, graduation year, resume skills). Postings you can't apply to are hidden
unless you ask for them:

| Hidden when the posting… | Example |
| --- | --- |
| is for another graduating class | "Graduation date between December 2027 and June 2028" |
| wants upper years | "rising senior", "penultimate or final year", "completed sophomore year" |
| is for grad students | PhD / Master's / MBA in the title, "Must be enrolled in a PhD program" |
| needs U.S. citizenship or a clearance | "Must be a U.S. citizen", "active Secret clearance", ITAR |
| is for one school's students | "currently enrolled at the University of Illinois…" |
| is over | its only term already started, or the ATS took it down |

Each row shows its score and the reasons ("✓ Spring '27 · ✓ Open to 1st/2nd years · – No visa
sponsorship"). The daily refresh reads for up to 3 minutes; `npm run jobs:details` reads the whole
backlog at once (and `-- --rescore` only re-scores, after changing the rules).

## Running locally

```bash
npm install
cp .env.example .env        # then edit APP_PASSWORD / AUTH_SECRET
npm run db:dev              # local Postgres (Prisma Postgres dev server)
npm run db:migrate
npm run dev                 # seeds data/*.json on boot
npm run cron:once           # optional: fetch every source now
npm test
npm run coverage:check   # does the Jobs pipeline keep every Summer 2027 SWE/AI-ML/PM role from SimplifyJobs?
npm run jobs:details     # read every posting's text and score it (the daily refresh does this gradually)
```

## Deploying (Vercel + Postgres)

1. Create the Vercel project and connect a Postgres database (Storage → Neon or Prisma Postgres), which sets `DATABASE_URL`.
2. Set env vars: `APP_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET` (long random strings), optionally `DISPLAY_NAME`.
3. Deploy. The `vercel-build` script runs migrations and seeds `data/*.json` before `next build`.
4. `vercel.json` schedules `/api/cron/refresh` daily at 12:00 UTC (8am Toronto). Trigger it manually from **Sources → Refresh everything**.

Back up from **Settings → Full backup** every so often.

## Editing the curated lists

`data/design-teams.json`, `data/clubs.json`, `data/hackathons.json` — `slug` is the stable key.
Seeded fields are overwritten on deploy; your edits in the app (status, deadline, notes, last checked)
are never touched. Removing an item flags it "No longer listed" rather than deleting your notes.
