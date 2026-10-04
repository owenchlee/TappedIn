# Morning report: 2026-10-03 overnight run

Branch `overhaul`, every commit pushed. `npm test` (93 tests), `npm run lint` and `npm run build` pass on every commit.

**Round 2 (after you asked to test everything):** the local DB was started and everything below marked
"round 2" was run against it and in the real app in Chrome. Three more real bugs were found and fixed.

## Do these before your first application

1. **Fill the blanks on the Profile page** (`/profile`): phone, plus the three eligibility answers
   (Canada / US / sponsorship). They're blank, so the filler leaves those questions for you on every
   form. That's safe, but slower.
2. The local DB is running (`npm run db:dev`), migrated, and refreshed with today's jobs. If it's off
   when you start, run `npm run db:dev`. It accepts one connection at a time, so close any other script
   using it before starting `npm run dev`.
3. After you click Submit on a site, click **"I submitted it"** on the apply status page. That's what
   moves the job to Applied. The runner never submits and can't tell when you have.

## What was tested, and how

| Area | How | Result |
|---|---|---|
| Summer 2027 coverage | `npm run coverage:check`: live SimplifyJobs feed vs the real source pipeline | **100%** of in-region SWE / AI-ML / PM rows kept, after a fix (below) |
| Full auto-apply, SWE | Real runner on the local Northwind test form: Chrome, `claude -p`, pdfLaTeX, cover letter, fill | Ready in ~2 min, $1.27. 15/17 fields filled; the 2 left are phone (blank in your profile) and work authorization (blank). Nothing submitted |
| Full auto-apply, PM + US citizenship | Same, on a PM variant that requires U.S. citizenship and asks the country-ambiguous questions | PM base picked, citizenship warning shown, optional cover letter skipped, both eligibility questions left for you. $0.50 |
| Resume keeps your style | Compiled each Overleaf base with MiKTeX and compared embedded fonts plus a visual side by side with the tailored PDFs | Same fonts (CM Super, same sizes), same layout, one page |
| Real ATS forms | Headless scan + **fake-data** fill of live Anduril (Greenhouse), Aquatic (Greenhouse), Ellipsis/Mercor (Ashby), Palantir (Lever) Summer 2027 postings. No uploads, nothing submitted, tabs closed | Found 10+ bugs (below). After fixes every mapped dropdown and field holds the right value |
| Tracking (round 2) | In the real app: "I applied" on a Jobs row; auto-apply started from the Apply page → status page → "I submitted it"; stage change on the board. Checked the DB rows each time | All work: Applied with `appliedAt`, timeline event, channel and resume version; card moves to Interview. **Pasted-link jobs weren't tracked before**: fixed and verified. Test records deleted afterwards |
| Jobs page (round 2) | Real app in Chrome: region/role filters, Applied badge, promoted jobs visible | Works. Software filter: 195 jobs in Canada + remote |
| Full refresh into the DB (round 2) | `npm run cron:once` twice, then `coverage:check --db` (now checks each role is *visible*, not just stored) | 12/13 sources OK on the first run; TD fixed after (bug 11). Every in-region SWE / AI-ML / PM role visible |

### Coverage numbers (live feed, 2026-10-03)

Filter: `terms` contains "Summer 2027", `active`, `is_visible`, category Software / Software Engineering / AI/ML/Data / Product.

| Category | Feed | Kept | Outside Canada/US/remote | Missing |
|---|---|---|---|---|
| SWE | 718 | 691 | 27 | 0 |
| AI-ML | 755 | 740 | 15 | 0 |
| PM | 160 | 156 | 4 | 0 |

Before the fix, 86 of these were silently dropped (see bug 1). The 46 "outside" rows are all UK
(London, Glasgow, Manchester...). Re-run any time with `npm run coverage:check`; add `-- --db` once the DB
is up to also compare against what's stored.

## Bugs fixed

1. **86 US roles dropped from the Jobs list.** Simplify writes many locations as "SF", "LA", "South SF" or
   a bare state ("Texas"). These were classified international and filtered out. "Hamilton, NJ" and
   "New Brunswick, NJ" were tagged Canada.
2. **Résumé never uploaded on new Greenhouse boards** (`job-boards.greenhouse.io`, the most common host
   in the S27 list). The file input is labelled "Attach".
3. **Greenhouse dropdowns mostly failed** (School, Degree, Discipline, How did you hear, Gender,
   Hispanic/Latino). The filler now reads the real options and matches by meaning ("Decline To Self
   Identify", "Bachelors", "Anduril Website"), searching progressively for School/Degree.
4. Greenhouse's invisible "required" twin inputs were filled, which looked filled while the real
   dropdown stayed empty.
5. **Wrong answers:** the GPA question got your degree name; "Will you be returning to school…?" got
   "University of Waterloo"; "top location preference" got your home city; Ashby's "New York City"
   office checkbox matched "city"; "High School Name" got Waterloo; "Name Pronunciation" got your name;
   "Please state why…" would have got "Ontario".
6. **Work authorization by country.** Once you fill the profile, a Canadian "Yes, authorized" would have
   gone into US jobs' "authorized to work in the country where this job is?" question, and one
   sponsorship answer into every country. Now a question that doesn't name the country is left for you
   when your Canada and US answers differ.
7. Lever's "I do not want to answer" wasn't recognised as declining.
8. Pasted-link applications weren't added to the tracker when you marked them submitted.

9. **(round 2) Distinct jobs merged into one.** URL keys dropped job-ID query params, so all 8 Stripe
   `/jobs/search?gh_jid=…` internships became one job (also Waymo, Pinterest, Zipline, Tower, Greenhouse
   embeds `?token=`, Taleo `?job=`): 98 active feed rows. Keys now keep those params. Stored rows are
   re-keyed in place once (no churn, applications stay attached; your Vercel DB gets this on its next
   refresh automatically). 65 wrongly hidden jobs reappeared locally.
10. **(round 2) Open jobs hidden behind closed copies.** When the list that "owned" a job dropped it (e.g.
   the Canadian list dropping 3 RBC Global Equities co-ops), the job vanished even though SimplifyJobs
   still listed it as active. The live copy is now promoted (and any application moves with it). The
   vanshb03 list is marked `keepsClosedJobs`: it lags SimplifyJobs, so it can't keep a closed job alive
   (that would have resurrected 10 closed Amex / Microsoft / Snowflake postings).
11. **(round 2) Workday stopped after 40 jobs and dropped multi-location jobs.** Workday says
   `total: 0` after page 1, so RBC, TD, Ciena and NVIDIA stopped at 2 pages; and "2 Locations" jobs
   couldn't be placed (every TD Canada co-op, so TD failed with zero results). Fixed: RBC +6,
   NVIDIA +12, TD healthy again.

## New safety checks (enforced in code, not just the prompt)

- **No invented facts on the resume** (`lib/autoapply/facts.ts`): every number, skill/tool and
  project/employer name in a tailored resume must appear in one of your base resumes or the confirmed
  part of `experience.md` ("Unconfirmed" sections don't count). Otherwise Claude is told to restore the
  original wording; after 4 failed attempts the run fails rather than uploading. It caught a real one
  tonight: the PM run rewrote a Skills entry to "User feedback (surveys, performance metrics)".
- **Cover letters**: same number check (years allowed); flagged for your review if one survives.
- **Font/style lock**: the tailored resume can't use any font face or size your Overleaf version doesn't
  (catches a `\small` slipped in to squeeze onto one page). The preamble was already locked byte for byte.
- **Eligibility warnings** on the status page when a posting says U.S. citizenship required, security
  clearance, ITAR/export control, or no sponsorship.
- Always left for you, never guessed by the profile or Claude: GPA, citizenship/export control, employment
  eligibility status, pay expectations, background checks (plus the existing work-auth/visa/EEO rules).

## Decisions

- **Didn't follow the old prompt literally.** It described a SQLite tracker with no auto-apply. The repo
  already has Postgres, the Simplify adapter and auto-apply, so I tested and fixed what exists instead of
  rebuilding it. No schema changes were needed.
- **Citizenship filter on the Jobs page: not built.** The feed's `sponsorship` field is "Other" on 2,137
  of 2,138 rows, and the README's 🇺🇸 / 🛂 markers appear on **zero** rows right now. With no data to
  filter on, I added the posting-text warning at apply time instead.
- **`active: false` → closed immediately: not built.** Inactive rows are already dropped from each fetch,
  so they're marked "possibly closed" after two daily refreshes. Changing that touches the diff engine,
  which I couldn't safely test without the DB. The runner opens the real posting first, so a dead link
  shows up before any work is done.
- **Live forms were filled only with fake data, headless, with no uploads and no submit.** Uploading a
  résumé to Greenhouse sends it to the company, so file inputs were checked by label only.
- **Left as is:** your resume templates, `profile.json`, `experience.md`, and the two old Northwind test
  runs from Sept 29. My own test runs and test tracker records were deleted.
- **Another session was redesigning the UI at the same time.** I never staged its files (app pages,
  components, globals.css) and verified every one of my commits by building it in a clean worktree.

## Worth a look

- SWE test resume: the FoodFindr bullet reads "∼5 s to **650 ms**"; `experience.md` says ~650–700 ms.
  That's true, but it's the best end of the range.
- `hardware.tex` still has visible "\% TODO" notes in 3 bullets (they render in its PDF). Tailored
  resumes strip them, but the base itself still has them.
- Greenhouse's "Discipline" list has no "Systems Design Engineering", so it picks "Engineering".
- Ashby's top "Autofill from resume" upload is skipped on purpose (it would overwrite filled fields).

## Not tested

- Filling a Workday (or any login-walled) application form: they need an account, which I didn't create.
- Auto-apply started from a real posting's "Auto-apply" button on the Jobs page. That would upload your
  résumé to a real company. Same runner and same tracking code as the tested paths; only the URL differs.
- TD still has 9 older postings that may be closed: TD's board now lists only 1 Canadian co-op, and the
  "sudden drop = broken source" guard won't close them automatically. Mark them closed if you see them.

## Known quirks

- In `next dev`, the first visit to a page that hasn't compiled yet can briefly show the previous page.
  The server returns the right page (checked with curl), and in-app navigation is fine. Reload if it
  happens.
- Co-op term questions ("Which term are you applying for?") are sometimes left for you when the role
  title doesn't name the term.
