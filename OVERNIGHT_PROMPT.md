# Overnight run: TappedIn end-to-end job pipeline

You are running unattended overnight. Nobody will answer questions. When something is ambiguous, pick the conservative option, write the decision and your reasoning in `MORNING_REPORT.md` under "Decisions", and keep going. Do not stop early because a step is hard; skip it, log why, and move to the next milestone.

## Context you need first

This repo (`coop-hub`, Next.js 16 App Router, Prisma 7 + SQLite, Tailwind v4) is today a **tracker only**. It has:
- Two company sources (`data/company-sources.json`: Robinhood via Greenhouse, Palantir via Lever) fetched daily by `lib/jobs/dailyRefresh.ts`.
- A `SavedItem` model with status `interested | applied | interview | rejected | accepted` and `appliedAt`, shown on `/saved`.

It does **not** have: any AI resume tailoring, any resume storage, any apply flow, any stage history, or broad internship coverage. The owner believes some of this exists. It doesn't. You are building it.

Before writing code:
1. Read `AGENTS.md`. Next.js 16 differs from your training data. Read the relevant guides in `node_modules/next/dist/docs/` (run `npm install` first) for anything you touch: server actions, route handlers, `searchParams` as a Promise, caching.
2. Read `README.md`, `prisma/schema.prisma`, `lib/sources/**`, `lib/jobs/dailyRefresh.ts`, `app/saved/page.tsx`, `components/SavedItemCard.tsx`.
3. Run `npm test`, `npm run lint`, `npm run build` and record the baseline in `MORNING_REPORT.md`. If the baseline is broken, fix that first as its own commit.

## Hard rules

- **Never fabricate resume content.** The AI may select, reorder, and rephrase the owner's existing bullets. It may not add employers, projects, skills, tools, metrics, dates, or numbers that are not in the master resume. This is enforced in code (see Milestone 3), not just in the prompt.
- **Never auto-submit an application.** No form-filling bots against Greenhouse, Lever, Ashby, Workday, or anything else. "Apply fast" means: everything is prepared, the owner clicks submit themselves. Never touch WaterlooWorks or any authenticated site.
- **Schema changes are additive only.** New models and nullable/defaulted columns via `prisma migrate dev --name <name>`. Never drop or rename existing columns; the owner's Railway DB has real data.
- **No secrets in git.** The real master resume and any API keys never get committed.
- Commit after each milestone with a clear message, only when `npm test`, `npm run lint`, and `npm run build` all pass. Push to the current branch after every commit. Do not open a PR.
- Keep the existing code style: server actions in `actions/`, data access in `lib/data/`, small components in `components/`, zod for validation, vitest for tests.

## Milestone 1: Summer 2027 coverage from SimplifyJobs

The canonical list is `SimplifyJobs/Summer2027-Internships`. Its machine-readable feed is
`https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`
(note: `dev` branch, not `main`). As of 2026-10-03 it has ~17k rows across all terms; filtering to `terms` containing `"Summer 2027"`, `active: true`, `is_visible: true` leaves ~2,100, of which ~730 are `Software`, ~765 `AI/ML/Data`, ~160 `Product`.

Build:
1. A new adapter `simplify` in `lib/sources/adapters/` that fetches that feed once per daily run. Config: `{ term: "Summer 2027", categories: ["Software", "Software Engineering", "AI/ML/Data", "Product"] }`. Map `id` to `externalKey`, `company_name` to `company`, `title` to `role`, `locations.join(" / ")` to `location`, and store `category` and `date_posted` (add nullable columns). Strip `utm_*` and `ref=Simplify` query params from URLs before storing. Register it in `data/company-sources.json` as enabled.
2. Treat the feed's `active: false` as closed immediately (it's authoritative), separate from the existing two-miss rule for scraped sources.
3. The feed has no reliable US-citizenship field (`sponsorship` is `"Other"` on almost every row). The README table marks citizenship-required roles with 🇺🇸 and no-sponsorship with 🛂. Parse `README.md` from the same branch, join on apply URL or company+title, and store a `requiresUsCitizenship` boolean. The owner is Canadian; default the co-op view to hide citizenship-required roles with a toggle to show them.
4. Dedupe against existing Greenhouse/Lever postings by normalized company + title + URL host so Robinhood/Palantir roles don't appear twice.
5. Add a filter bar on the Co-op tab: category (SWE / AI-ML / PM), location contains (Canada, Remote, specific city), posted within N days, hide citizenship-required.
6. **Coverage check:** write `scripts/coverage-check.ts` (runnable via `npm run coverage:check`) that pulls the live feed, applies the same filter, and compares against the DB after a refresh. Output per category: feed count, DB count, missing count, and the first 20 missing rows. Target: 100% of filtered feed rows present. Put the real numbers in `MORNING_REPORT.md`.
7. Unit tests with a checked-in fixture (trim ~30 real rows from the feed into `lib/sources/adapters/__fixtures__/simplify.json`) covering term filtering, category filtering, URL normalization, `active:false` closing, and dedupe.

## Milestone 2: master resume storage

1. Add a `MasterResume` model (single row) storing structured JSON: contact, education, experience[], projects[], skills, each bullet with a stable `id`. Validate with a zod schema in `lib/resume/schema.ts`.
2. A `/resume` page to view and edit it (a JSON editor with zod error messages is fine; don't build a fancy form tonight).
3. Seed from `data/resume.json` if present. Commit `data/resume.example.json` with obviously fake placeholder content and add `data/resume.json` to `.gitignore`. The DB is the source of truth on Railway, so the real resume lives on the volume, not in git.

## Milestone 3: AI tailoring that sounds human and can't lie

1. Install `@anthropic-ai/sdk`. Model: `claude-sonnet-5-5` (good enough and cheaper per resume; make it a constant). Read `ANTHROPIC_API_KEY` from env; add it to `.env.example` and the README Railway variable list.
2. `lib/resume/tailor.ts`: given master resume + posting (title, company, and the job description if fetchable from the posting URL for Greenhouse/Lever/Ashby JSON APIs; title-only otherwise), ask the model to return **structured JSON** via tool use: selected bullet ids in order, a rephrased text per id, selected skills, and an optional 1-line summary. One page worth of content max.
3. **Deterministic guards, run after every model call** (`lib/resume/guards.ts`, fully unit-tested):
   - Every output bullet references an id that exists in the master resume.
   - Every number, percentage, and dollar figure in a rephrased bullet appears in the source bullet. Every skill in the output appears in the master skills list.
   - Style lint rejects: em dash (—), en dash used as a dash (–), ` -- `, curly quotes, semicolons in bullets, first-person pronouns, and this banned list (case-insensitive, whole word): leverage, leveraged, utilize, utilized, spearheaded, synergy, seamless, robust, cutting-edge, innovative, passionate, dynamic, results-driven, detail-oriented, fast-paced, delve, showcase, foster, tapestry, pivotal, meticulous, streamline (allowed only if in the source bullet), "in order to", "responsible for", "helped to".
   - Each bullet starts with a past-tense action verb (present tense allowed for current roles), is under ~200 characters, and has no trailing period inconsistency (all or none).
   - On failure: one retry with the specific violations fed back. On second failure, fall back to the original master bullets for the failing items and surface a warning in the UI. Never silently ship a violating resume.
4. If `ANTHROPIC_API_KEY` is unset, use a `MockTailor` that returns a deterministic selection from the master resume so the whole flow is testable offline. Tests must not hit the network.

## Milestone 4: ATS-safe PDF output

1. Render with `@react-pdf/renderer` (pure JS, works on Railway; do not depend on Chromium or LaTeX at runtime). Layout follows the standard one-column engineering resume (Jake's-resume style): name + contact line, Education, Experience, Projects, Skills. Standard font (Helvetica or bundled Inter), 10 to 11pt body, no tables, no icons, no columns, no images, real selectable text.
2. File name: `Firstname_Lastname_Resume_<Company>.pdf`.
3. Test: render the fixture resume, extract text (use `pdf-parse` or `unpdf` as a dev dependency), assert page count is 1, assert headings and every bullet text are present in reading order, assert no — characters.
4. Store each generated version (`ResumeVersion` model: posting id, JSON snapshot, created at, guard warnings). The owner must always be able to see exactly which resume went to which company.

## Milestone 5: apply kit and application pipeline

1. On each posting: an **Apply** button opening an apply panel with: generate/regenerate tailored resume, preview, download PDF, copy-to-clipboard answers for common fields (name, email, phone, LinkedIn, GitHub, school, grad date, work authorization, from the master resume contact block), and an "Open application" link to the posting URL in a new tab.
2. **Mark as applied** (one click) creates or updates the `SavedItem` with `status = applied`, `appliedAt = now`, links the `ResumeVersion` used.
3. Expand stages to: `interested, applied, oa, interview, final, offer, rejected, ghosted, withdrawn`. Keep backwards compatibility with existing values. Add an `ApplicationEvent` model (saved item id, from stage, to stage, at, note) and write a row on every stage change.
4. Replace or extend `/saved` into an **Applications** dashboard: table sortable by applied date, company, stage, days since last update. Counts per stage at the top. Auto-suggest "ghosted?" on anything sitting in `applied` for 21+ days (suggest, don't auto-change). Clicking a row shows its event timeline and the exact resume version sent.
5. Mobile-usable: the owner will check this on their phone.

## Milestone 6: end-to-end verification

1. `scripts/e2e-smoke.ts` (`npm run e2e:smoke`) against a fresh temp SQLite DB: migrate, seed example resume, ingest the Simplify fixture, filter to SWE, tailor 3 postings with `MockTailor`, assert guards pass, render 3 PDFs and assert 1 page each, mark 2 applied, advance 1 to `oa`, assert dashboard data layer returns correct counts and timeline.
2. If `ANTHROPIC_API_KEY` is set in this environment, also tailor 3 real postings with the live model and paste the resulting bullets (and any guard violations caught) into `MORNING_REPORT.md` so the owner can judge the voice.
3. Start `next dev`, use Playwright (Chromium is preinstalled at `/opt/pw-browsers`; do not run `playwright install`) to screenshot `/coop`, the apply panel, `/resume`, and the applications dashboard at desktop and 390px widths. Save to `docs/screenshots/` and commit them. Fix anything visibly broken.
4. Run the live coverage check from Milestone 1 one last time.

## MORNING_REPORT.md (write as you go, finalize at the end)

Short and factual:
- Baseline state, then what shipped per milestone, with commit hashes.
- Coverage numbers per category, and why any rows are missing.
- Sample tailored bullets (mock or live), plus every guard violation the live model produced.
- What's skipped or broken, and exactly what the owner must do: set `ANTHROPIC_API_KEY` on Railway, paste their real resume into `/resume`, run `prisma migrate deploy` (already in `npm start`).
- Decisions you made without asking, one line each.

Priority if you run out of time: Milestone 1, then 2, 3, 5, 4, 6. Coverage and honest tailoring matter more than polish.
