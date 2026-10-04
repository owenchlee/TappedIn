# Morning report: 2026-10-04 overnight run

Branch `overhaul`, every commit pushed. `npm test` (160 tests), `npm run lint` and `npm run build`
pass. Last night's report moved to `docs/morning-reports/2026-10-03.md`.

## Do this first: RBC co-ops close today (Sunday, Oct 4)

Their posting says the deadline is **Oct 5**, but RBC only accepts applications until 11:59 PM the
day before, so they really close **tonight**:

| Score | Role |
| --- | --- |
| 90 | Royal Bank of Canada · AI Engineer Co-op, Global Equities |
| 77 | Royal Bank of Canada · Algorithmic Trading Developer Co-op, Global Equities |
| 63 | Royal Bank of Canada · Data Engineer Co-op (Winter 2027) |
| 60 | Royal Bank of Canada · Quantitative Trading Analyst Co-op, Global Equities |

The Today page now lists these under **Closing this week**. Sun Life's Associate Software Engineer
Co-op (W27, score 72) and Cenovus's IT Student (S27) close Oct 7.

## What changed: the Jobs page finds the jobs you can actually get

**The problem.** ~4,400 open postings sorted by date, ~85% US internships written for juniors and
seniors. The app only read titles, so it couldn't tell which ones a 1A student can apply to.

**Now:**

1. **Every posting is read.** Its text is fetched from the ATS's public API (Greenhouse, Lever, Ashby,
   SmartRecruiters, Workday, Workable, Oracle Cloud) or the page itself. **4,114 of 4,449 open jobs
   (92%) are readable.** Most of the rest is Tesla (129), which blocks automated requests.
2. **Dead links are closed.** 82 postings the ATS says no longer exist were closed (e.g. Etched and
   Notion reposted their internships under new IDs; the lists still had the old links). Jobs you
   track are never closed this way.
3. **Jobs you can't apply to are hidden** (one click shows them):

   | Hidden because the posting… | Open jobs |
   | --- | --- |
   | is for another graduating class ("Graduation between Dec 2027 and Jun 2028") | 607 |
   | is for grad students (PhD / Master's / MBA) | 503 |
   | its term already happened | 395 |
   | needs U.S. citizenship / clearance / ITAR | 332 |
   | wants upper years ("rising senior", "completed sophomore year", "3rd or 4th year") | 300 |
   | is for one school ("enrolled at the University of Illinois…"), or isn't an internship | 25 |

   **2,625 of 4,449 stay visible; 1,141 of those are Spring/Summer 2027.** (A job can be hidden for several reasons, so the rows overlap.)
4. **Each job gets a 0–100 score with reasons**, e.g. "✓ Spring '27 · ✓ Open to 1st/2nd years ·
   ✓ In Canada · ✓ Python, Java, C++ +4". It weighs your term, role type, region, early-student and
   co-op wording, resume skills, freshness and deadline. **Best match** is the default sort.
5. **Deadlines are read from the posting.** The feeds had a deadline for 1 job. Now 190 do: 11 had
   already passed (hidden), 41 close within a week. Jobs closing within 7 days rank higher and say
   so ("Closes tomorrow").
6. **Today:** "Closing this week" (good matches, soonest first) and "Best matches for you" (replaces
   "New jobs").
7. **Settings → What you're looking for:** target terms (default Spring 2027), role types, graduation
   year (2031) and resume skills. Saving re-scores every job (~12 s).
8. **13 more company boards** that hire co-ops in Canada: Lyft, Pinterest, Stripe, Faire, Instacart,
   Tenstorrent, D2L, 1Password, Jobber, Neo Financial, Waabi, Kepler, Magnet Forensics. First run
   added 10 jobs the lists didn't have, including 6 Lyft Toronto internships.

## Bugs found and fixed along the way

1. **~580 jobs had the wrong term.** SimplifyJobs tags most of its September 2026 postings "Winter
   2026" (a term that ended in April). Only 2 of 579 such postings mention 2026 in their text; most
   are 2027 roles. Terms that ended before a job was posted are now dropped. When nothing is left,
   the term is read from the posting ("SPRING 2027 SOFTWARE ENGINEERING INTERNSHIP").
2. **Stored regions were never corrected.** Last night's location fix only applied to new rows, so
   jobs in New Brunswick NJ, Vancouver WA, Waterloo IA and Hamilton NJ still said Canada (20 rows).
   Re-scoring now re-reads each job's region from its location.
3. Lever jobs only kept their first office (Waabi lists Toronto + Pittsburgh + SF).

## Decisions

- **No questions asked overnight**, per your standing instruction. The plan was written at the top
  of this file before starting, then built.
- **Default target term is Spring/Summer 2027.** That's what last night's coverage work targeted.
  If you're on a stream with a Winter 2027 work term, tick Winter 2027 in Settings.
- **Hidden ≠ deleted.** "Show them" on the Jobs page lists every hidden job with the reason in red.
  I checked every hidden Canadian job by hand (54) and a random 40 US ones. I fixed the misreads I
  found and added each one as a test: RBC's "if this is your last term (graduating April 2027)"
  exception, "senior and junior staff", "second or third year", and USAA's "graduation cannot be
  prior to August 2027".
- **Nothing was applied to, submitted or uploaded.** Detail fetching only reads public job APIs and
  pages. The 13 new sources were each checked live before being added.
- **Deploy:** the migration only adds columns. `vercel-build` now re-scores every job, so a fresh
  deploy is ranked straight away. The daily cron reads up to 3 minutes of postings per day; to read
  the whole backlog on the Vercel database at once, run `npm run jobs:details` with `DATABASE_URL`
  pointing at it (takes ~15 min).
- **Your `next dev` server** was holding the local DB's only connection, so I stopped it at the start.
  Later, Claude Code stopped the dev server I'd started because the machine ran low on memory. It's
  not running now; start it with `npm run dev`.

## Worth knowing

- **The local DB (`prisma dev`) crashed twice** on queries that scan all the posting text at once.
  Each time it left a stale lock (`%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\tappedin\server.lock.lock`),
  so `npm run db:dev` failed with "Lock file is already being held". Fix: `npx prisma dev stop
  tappedin`, delete that folder, then `npm run db:dev`. The app's own queries read text in small
  batches and never hit this. Its stream log in that folder has also grown to **5 GB**.
- **Open the app at http://127.0.0.1:3000, not localhost.** localhost:3000 has another project's
  service worker, which serves pages one navigation behind. That's the "previous page" quirk from
  last night's report; it isn't an app bug. (The Chrome extension also needs permission for
  127.0.0.1 if you want me to drive it there.)
- Scores are rules, not AI: fast, free, and the same on Vercel. Each rule is tested against real
  sentences in `lib/fit/*.test.ts`. If a job is hidden or ranked wrongly, the reason on the row says
  which rule fired.
