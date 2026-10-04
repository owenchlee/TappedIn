# Morning report: 2026-10-04 overnight run

Last night's report moved to `docs/morning-reports/2026-10-03.md`.

## The plan (written before starting; status filled in as I go)

**The problem.** The Jobs page holds ~4,500 open postings sorted by date. About 85% are US internships
written for juniors and seniors. As a 1A student looking for a first co-op (Spring/Summer 2027),
most of them are ones you can't get: "graduating Dec 2027–Jun 2028", "rising senior", "PhD
students", "U.S. citizens only". The app never reads the posting itself, only the title, so it can't
tell. You'd have to open each one to find out.

**Goal for tonight: put the jobs you can actually get at the top, and hide the ones you can't.**

1. **Read every posting.** Fetch the description of every open job from the ATS's public API
   (Greenhouse, Ashby, Lever, SmartRecruiters, Workday) or the page itself (JSON-LD / page text for
   everything else). A posting the ATS says is gone (404, "job not found") gets marked closed, so dead
   links stop wasting your time.
2. **Pull out who it's for.** From the text: graduation-year window, year of study (freshman /
   sophomore / junior / senior, "first-year"), degree level (PhD- or Master's-only), U.S. citizenship /
   clearance / export control, co-op / 4-month friendly.
3. **Score each job for you.** 0–100 from: target term, role type, region, eligibility, "early
   student friendly" signals, skill overlap with your resumes, freshness and deadline. Each score
   comes with the reasons, shown on the row.
4. **Jobs page:** new default sort "Best match", a "Hide ones I can't apply to" switch (on by
   default), and red-flag chips (e.g. "Grads 2027–28 only", "U.S. citizens only"). Jobs whose only
   terms are in the past are hidden.
5. **Your preferences** (target terms, roles, graduation year) live in Settings, so the ranking
   works on Vercel too, not just this laptop.
6. **Today page:** "Top matches" instead of just "newest".
7. **Daily refresh** fetches details for new jobs within a time budget, then re-scores. A backfill
   script does the whole backlog once.
8. **More Canadian sources** if time allows: company boards that hire Waterloo co-ops, each one
   checked live before it's added.
9. Tests, lint, build, then check it in the real app.

## Status

(in progress)

## Decisions

- Your `next dev` server was running and holding the local DB's only connection, so I stopped it at
  the start of the run. The `prisma dev` daemon had also left a stale lock (`server.lock.lock`) after
  it stopped; I removed that lock directory and restarted the DB.
