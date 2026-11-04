// Workday's "My Experience" page: Work Experience, Education, Websites and Skills are lists Owen has to "Add"
// entries to. They're optional, so the plain field scan never opened them and the application went in with an
// empty profile. This fills them from the job's own tailored resume (one model call, cached per job).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
import { runClaude } from "./claude";
import { PRIVATE_DIR } from "./job";

const EXPERIENCE = path.join(PRIVATE_DIR, "experience.md");

export type History = {
  work: { title: string; company: string; location?: string; from: string; to?: string; current?: boolean; description?: string }[];
  education: { school: string; degree: string; field?: string; from?: string; to?: string }[];
  skills: string[];
};

export function historyPrompt(resumeTex: string, experience = ""): string {
  return `Turn Owen Lee's resume (LaTeX below) into JSON for a job application's "My Experience" page. You have no tools.

Rules:
- "work": the entries under Experience, then Involvements (design teams, clubs with a real role), newest first, at most 4. Never projects.
- Dates as "MM/YYYY". An entry that is ongoing has "current": true and no "to". A season means its first month (Summer 2025 = 05/2025, Fall = 09, Winter = 01).
- "description": the strongest version of that entry's work, as plain sentences, LaTeX removed, at most 600 characters. Take it from the entry's "Resume entry (use as written)" bullets in the experience bank below when it has one (they are newer than this resume), else from the resume's bullets. Follow the bank's wording rules (claim only what it allows).
- "education": the school entries. "degree" is the degree's name (e.g. "Bachelor of Applied Science"), "field" the program.
- "skills": up to 10 single skills from the Skills section (languages and tools, e.g. "Python", "C++", "React").
- Use only what the resume says. No em dashes.

Reply with ONE line of JSON as the very last line:
{"work":[{"title":"","company":"","location":"","from":"MM/YYYY","to":"MM/YYYY","current":false,"description":""}],"education":[{"school":"","degree":"","field":"","from":"MM/YYYY","to":"MM/YYYY"}],"skills":[""]}

Resume:
${resumeTex}

Experience bank (newest, strongest wording):
${experience}`;
}

export function parseHistory(text: string): History | null {
  const line = text.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  try {
    const h = JSON.parse(line ?? "");
    if (!Array.isArray(h?.work) || !Array.isArray(h?.education)) return null;
    return { work: h.work.slice(0, 4), education: h.education.slice(0, 2), skills: Array.isArray(h.skills) ? h.skills.map(String).slice(0, 10) : [] };
  } catch {
    return null;
  }
}

const MMYYYY = /^(\d{1,2})\/(\d{4})$/;

async function addEntry(page: Page, section: string): Promise<boolean> {
  const add = page.locator(`[aria-labelledby="${section}"] [data-automation-id="add-button"]:visible`).last();
  if (!(await add.count())) return false;
  await add.click({ force: true, timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(1200);
  return true;
}

/** Types a month/year into Workday's date widget (a month box that hands off to a year box). */
async function setDate(page: Page, id: string, value: string | undefined) {
  const m = value?.match(MMYYYY);
  if (!m) return;
  const month = page.locator(`[id="${id}-dateSectionMonth-display"]`);
  const year = page.locator(`[id="${id}-dateSectionYear-display"]`);
  // A real click (not a forced one) is what gives the month box focus, so the typing lands in it.
  if (await month.count()) {
    await month.click({ timeout: 3000 }).catch(() => month.click({ force: true, timeout: 3000 }).catch(() => null));
    await page.keyboard.type(m[1].padStart(2, "0"), { delay: 40 });
  } else if (await year.count()) {
    await year.click({ timeout: 3000 }).catch(() => year.click({ force: true, timeout: 3000 }).catch(() => null));
  } else return;
  await page.keyboard.type(m[2], { delay: 40 });
  await page.waitForTimeout(300);
}

async function fillText(page: Page, id: string, value: string | undefined) {
  if (!value) return;
  const el = page.locator(`[id="${id}"]`);
  if (await el.count()) await el.fill(value, { timeout: 3000 }).catch(() => null);
}

/** A Workday search box ("Field of Study", "Skills", sometimes "School"): type, then take the closest suggestion. */
async function pickPrompt(page: Page, id: string, value: string): Promise<boolean> {
  const el = page.locator(`[id="${id}"]`);
  if (!(await el.count())) return false;
  await el.click({ force: true, timeout: 3000 }).catch(() => null);
  await el.fill(value, { timeout: 3000 }).catch(() => null);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const opts = page.locator('[data-automation-id="promptOption"]:visible');
  const texts = (await opts.allInnerTexts().catch(() => [] as string[])).map((t) => t.trim());
  const want = value.toLowerCase();
  // Exact, or a suggestion that contains the whole thing ("Python" -> "Python (Programming Language)"); never the other way
  // round, which once turned "Systems Design Engineering" into "Aerospace Engineering".
  const exact = texts.findIndex((t) => t.toLowerCase() === want);
  const i = exact >= 0 ? exact : texts.findIndex((t) => t.toLowerCase().includes(want));
  if (i >= 0) {
    await opts.nth(i).click({ force: true, timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(600);
    return true;
  }
  await page.keyboard.press("Escape").catch(() => null);
  await el.fill("", { timeout: 2000 }).catch(() => null);
  return false;
}

// Best first. Never an option that names some other program ("Bachelor of Science, Nanotechnology").
const DEGREES = [/^bachelor of applied science/i, /^bachelor of engineering/i, /^bachelor.?s( degree)?$/i, /^bachelor of science\b[^,]*$/i, /^bachelor[^,]*$/i];

async function pickButton(page: Page, id: string, wanted: RegExp[]): Promise<boolean> {
  const btn = page.locator(`[id="${id}"]`);
  if (!(await btn.count())) return false;
  await btn.click({ force: true, timeout: 3000 }).catch(() => null);
  await page.waitForTimeout(800);
  const opts = page.locator('[role="option"]:visible');
  const texts = await opts.allInnerTexts().catch(() => [] as string[]);
  for (const re of wanted) {
    const i = texts.findIndex((t) => re.test(t));
    if (i >= 0) {
      // A real click: a forced one lands on the list without choosing anything.
      await opts.nth(i).scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => null);
      await opts.nth(i).click({ timeout: 3000 }).catch(() => opts.nth(i).click({ force: true, timeout: 3000 }).catch(() => null));
      await page.waitForTimeout(500);
      return (await btn.innerText().catch(() => "")).trim() === texts[i].trim();
    }
  }
  await page.keyboard.press("Escape").catch(() => null);
  return false;
}

/** The job's history (work, education, skills) from its tailored resume and the experience bank; cached per job. */
export async function loadHistory(o: { jobDir: string; model: string; cwd: string }): Promise<{ h: History | null; costUsd: number; why?: string }> {
  const cache = path.join(o.jobDir, "workday-history.json");
  const cached = existsSync(cache) ? parseHistory(readFileSync(cache, "utf8")) : null;
  if (cached) return { h: cached, costUsd: 0 };
  const tex = path.join(o.jobDir, "resume.tex");
  if (!existsSync(tex)) return { h: null, costUsd: 0, why: "no tailored resume.tex to fill Work Experience / Education from" };
  const run = await runClaude({ cwd: o.cwd, prompt: historyPrompt(readFileSync(tex, "utf8"), existsSync(EXPERIENCE) ? readFileSync(EXPERIENCE, "utf8") : ""), allowedTools: [], model: o.model, extraArgs: ["--tools", '""', "--strict-mcp-config"], timeoutMs: 3 * 60_000 });
  const h = run.ok ? parseHistory(run.result) : null;
  if (h) writeFileSync(cache, JSON.stringify(h));
  return { h, costUsd: run.costUsd, why: h ? undefined : "couldn't read the resume for Work Experience / Education" };
}

/**
 * Fills Work Experience, Education, Websites and Skills on a Workday "My Experience" page when they're empty.
 * Lists that already have entries (an earlier draft) are left as they are. Returns what it couldn't do.
 */
export async function fillWorkdayHistory(page: Page, o: { jobDir: string; website?: string; model: string; cwd: string }): Promise<{ costUsd: number; notes: string[] }> {
  const notes: string[] = [];
  if (!(await page.locator('[aria-labelledby="Work-Experience-section"]').count())) return { costUsd: 0, notes };
  const loaded = await loadHistory(o);
  const costUsd = loaded.costUsd;
  const h = loaded.h;
  if (!h) return { costUsd, notes: [loaded.why ?? "no history"] };

  const titles = page.locator('input[id^="workExperience-"][id$="--jobTitle"]');
  // Entries already there (an earlier draft): bring each description up to date, matched by company.
  for (let i = 0; i < (await titles.count()); i++) {
    const id = (await titles.nth(i).getAttribute("id").catch(() => null))?.replace(/--jobTitle$/, "");
    const company = id ? await page.locator(`[id="${id}--companyName"]`).inputValue().catch(() => "") : "";
    const w = h.work.find((x) => company && x.company.toLowerCase() === company.toLowerCase());
    if (id && w?.description) await fillText(page, `${id}--roleDescription`, w.description);
  }
  if (!(await titles.count())) {
    for (const [i, w] of h.work.entries()) {
      if (!(await addEntry(page, "Work-Experience-section"))) break;
      const title = page.locator('input[id^="workExperience-"][id$="--jobTitle"]').nth(i);
      const id = (await title.getAttribute("id").catch(() => null))?.replace(/--jobTitle$/, "");
      if (!id) break;
      await fillText(page, `${id}--jobTitle`, w.title);
      await fillText(page, `${id}--companyName`, w.company);
      await fillText(page, `${id}--location`, w.location);
      if (w.current) await page.locator(`[id="${id}--currentlyWorkHere"]`).check({ force: true, timeout: 2000 }).catch(() => null);
      await setDate(page, `${id}--startDate`, w.from);
      if (!w.current) await setDate(page, `${id}--endDate`, w.to);
      await fillText(page, `${id}--roleDescription`, w.description);
    }
  }

  // Education is added when empty, and an entry already there (an earlier draft) is checked and corrected too.
  const schools = page.locator('[id^="education-"][id$="--schoolName"]');
  const had = await schools.count();
  for (const [i, e] of h.education.entries()) {
    if (i >= had && !(await addEntry(page, "Education-section"))) break;
    const id = (await schools.nth(i).getAttribute("id").catch(() => null))?.replace(/--schoolName$/, "");
    if (!id) break;
    const fresh = i >= had;
    // Some tenants make School a free-text box, others a search: try the search, fall back to typing it.
    if (fresh && !(await pickPrompt(page, `${id}--schoolName`, e.school))) await fillText(page, `${id}--schoolName`, e.school);
    const bachelor = /bachelor|b\.?a\.?sc|undergrad/i.test(e.degree);
    const wanted = bachelor ? DEGREES : [new RegExp(e.degree.split(/\s+/)[0], "i")];
    const shown = (await page.locator(`[id="${id}--degree"]`).innerText().catch(() => "")).trim();
    if (!wanted.slice(0, 2).some((re) => re.test(shown)) && !(await pickButton(page, `${id}--degree`, wanted))) notes.push(`Education: pick the degree (${e.degree})`);
    // Field of Study: drop a wrong pick, then only the program itself or a close name ("Systems Design"); a loose
    // match once turned "Systems Design Engineering" into "Aerospace Engineering".
    const chips = page.locator(`[data-automation-id="multiSelectContainer"]:has([id="${id}--fieldOfStudy"]) [data-automation-id="selectedItem"]`);
    const field = (e.field ?? "").toLowerCase();
    const picked = (await chips.allInnerTexts().catch(() => [] as string[])).map((t) => t.toLowerCase());
    if (field && !picked.some((t) => t.includes(field.replace(/\s+engineering$/, "")))) {
      for (let n = 0; n < 4 && (await chips.count()); n++) {
        await chips.first().locator('[data-automation-id="DELETE_charm"]').click({ force: true, timeout: 2000 }).catch(() => null);
        await page.waitForTimeout(400);
      }
      if (!(await pickPrompt(page, `${id}--fieldOfStudy`, e.field!))) await pickPrompt(page, `${id}--fieldOfStudy`, e.field!.replace(/\s+engineering$/i, ""));
    }
    if (/YYYY/.test(await page.locator(`[id="${id}--firstYearAttended-dateSectionYear-display"]`).innerText().catch(() => ""))) await setDate(page, `${id}--firstYearAttended`, e.from);
    if (/YYYY/.test(await page.locator(`[id="${id}--lastYearAttended-dateSectionYear-display"]`).innerText().catch(() => ""))) await setDate(page, `${id}--lastYearAttended`, e.to);
  }

  if (o.website && !(await page.locator('[id^="webAddress-"][id$="--url"]').count()) && (await addEntry(page, "Websites-section"))) {
    const url = page.locator('[id^="webAddress-"][id$="--url"]').first();
    await url.fill(o.website, { timeout: 3000 }).catch(() => null);
  }

  const skills = page.locator('[id="skills--skills"]');
  if (h.skills.length && (await skills.count())) {
    // Only skills not already picked: choosing a picked one again un-picks it.
    const chosen = page.locator('[data-automation-id="multiSelectContainer"]:has([id="skills--skills"]) [data-automation-id="selectedItem"]');
    for (const s of h.skills) {
      const have = (await chosen.allInnerTexts().catch(() => [] as string[])).map((t) => t.toLowerCase());
      if (!have.some((t) => t.includes(s.toLowerCase()))) await pickPrompt(page, "skills--skills", s);
    }
  }
  return { costUsd, notes };
}
