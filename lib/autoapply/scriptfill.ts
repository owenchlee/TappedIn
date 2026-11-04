// Scripted prefill for Greenhouse, Lever and Ashby forms. A Claude Code worker driving Chrome one click at a
// time takes minutes per job; these three forms are plain enough for a script to read every field, ask the
// model ONE question (all the answers at once, no browser tools), and type them in. Anything unfamiliar
// returns { fallback: true } before touching the form, and scripts/prefill.ts hands the job to the worker.
//
// The script drives its own Chrome window (profile private/browser-profile, remote debugging on a local
// port) and leaves the tab open when it exits, so Owen reviews it like any other prefilled tab.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { runClaude } from "./claude";
import { atsOf, fillPrompt, formUrl, isCoverLetterField, isResumeField, isTranscriptField, matchOption, parseFillReply, roleOnPage, trimFields, wrongTerm, type FormField } from "./formfill";
import type { Job } from "./job";
import { PRIVATE_DIR } from "./job";
import { fillWorkdayHistory, loadHistory, type History } from "./workday";
import { checkResume, readAccounts, readAnswerBank, saveAccount, type PendingQuestion, type ReportedResume, type Timing } from "./prefill";

const TRANSCRIPT = path.join(PRIVATE_DIR, "Owen_Lee_Transcript.pdf");

const PORT = Number(process.env.PREFILL_CDP_PORT) || 9333;
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
].filter((p): p is string => Boolean(p));

let browserPromise: Promise<Browser> | null = null;

/** Connects to the script's own Chrome, starting it (detached, so it outlives this process) if it isn't up. */
function connect(): Promise<Browser> {
  browserPromise ??= (async () => {
    const url = `http://127.0.0.1:${PORT}`;
    try {
      return await chromium.connectOverCDP(url, { timeout: 2000 });
    } catch {
      // not running yet
    }
    const exe = CHROME_PATHS.find((p) => existsSync(p));
    if (!exe) throw new Error("Chrome isn't installed where expected (set CHROME_PATH)");
    spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(PRIVATE_DIR, "browser-profile")}`, "--no-first-run", "--no-default-browser-check",
      // Several tabs are worked on at once, mostly behind each other: without these Chrome throttles the hidden ones to a crawl.
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-features=CalculateNativeWinOcclusion",
      "about:blank"], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 500));
      try {
        return await chromium.connectOverCDP(url, { timeout: 2000 });
      } catch {
        // keep waiting
      }
    }
    throw new Error("Chrome didn't open its debugging port");
  })();
  browserPromise.catch(() => (browserPromise = null));
  return browserPromise;
}

type ScriptField = FormField & { ids: string[] };

// Clicking through dropdowns needs the tab in front (focus, animations), and only one tab can be. So the
// click-heavy phases take turns; the waits (page loads, the model call) still overlap across jobs.
let turn: Promise<unknown> = Promise.resolve();
function inFront<T>(page: Page, work: () => Promise<T>): Promise<T> {
  const run = turn.then(async () => {
    await page.bringToFront().catch(() => null);
    return work();
  });
  turn = run.catch(() => null);
  return run;
}
type Extracted = { fields: ScriptField[]; files: { id: string; label: string }[]; text: string };

// Runs inside the page. A string (not a function) so the bundler can't inject helpers that don't exist there.
// Every control it reports gets a data-tf attribute the rest of the script uses to find it again.
const EXTRACT = String.raw`(() => {
  const clean = (s) => (s || "").replace(/[✱*]+/g, " ").replace(/\s+/g, " ").trim();
  const txt = (el) => clean(el.innerText || el.textContent);
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    return !el.closest("[aria-hidden=true], [hidden]");
  };
  document.querySelectorAll("[data-tf]").forEach((e) => e.removeAttribute("data-tf"));
  let n = 0;
  const tag = (el) => { const k = "f" + n++; el.setAttribute("data-tf", k); return k; };

  const raw = [...document.querySelectorAll("input, textarea, select, button[aria-haspopup='listbox']")].filter((el) => {
    if (["hidden", "submit", "button", "image", "reset", "file", "search"].includes(el.type)) return false;
    // Workday's experience lists are filled from the resume (lib/autoapply/workday.ts), not by the model.
    if (/^(workExperience|education|webAddress|language|skills)-/.test(el.id || "")) return false;
    if (el.tabIndex === -1 && el.type !== "radio" && el.type !== "checkbox") return false;
    if (el.closest("header, nav, footer")) return false;
    return vis(el);
  });
  const btnGroups = [];
  for (const b of document.querySelectorAll("button")) {
    if (b.type === "submit" || !vis(b) || b.closest("header, nav, footer")) continue;
    const p = b.parentElement;
    if (!p || btnGroups.some((g) => g.p === p)) continue;
    const kids = [...p.children];
    if (kids.length >= 2 && kids.length <= 6 && kids.every((k) => k.tagName === "BUTTON" && k.type !== "submit" && txt(k).length > 0 && txt(k).length <= 30)) btnGroups.push({ p, kids });
  }
  const everyControl = raw.concat(btnGroups.flatMap((g) => g.kids));

  // The smallest-to-largest ancestor that holds only this question's controls: its text is the question.
  const questionRoot = (own) => {
    let node = own[0], best = null;
    for (let i = 0; i < 7 && node.parentElement; i++) {
      const p = node.parentElement;
      if (p.tagName === "FORM" || p === document.body) break;
      if (everyControl.some((o) => p.contains(o) && !own.includes(o))) break;
      node = p; best = p;
    }
    return best;
  };
  const optionLabel = (el) => {
    const l = (el.labels && el.labels[0]) || el.closest("label");
    if (l) return txt(l);
    if (el.nextElementSibling) return txt(el.nextElementSibling);
    return txt(el.parentElement);
  };
  const labelFor = (own, optTexts) => {
    const el = own[0];
    if (own.length === 1 && el.tagName !== "BUTTON" && el.type !== "radio" && el.type !== "checkbox") {
      const direct = el.labels && el.labels[0] ? txt(el.labels[0]) : "";
      if (direct) return direct;
      const lb = el.getAttribute("aria-labelledby");
      if (lb) { const t = lb.split(" ").map((id) => document.getElementById(id)).filter(Boolean).map(txt).join(" "); if (t) return t; }
      const al = el.getAttribute("aria-label");
      if (al) return clean(al);
    }
    const root = questionRoot(own);
    if (root) {
      const lines = (root.innerText || "").split("\n").map(clean).filter((l) => l && !optTexts.includes(l) && !/^(required|optional|\(optional\)|\(required\))$/i.test(l));
      if (lines.length) return lines[0];
    }
    if (el.type === "checkbox") return optionLabel(el);
    return clean(el.getAttribute("placeholder") || el.name || "");
  };
  const req = (own) => own.some((el) => el.required || el.getAttribute("aria-required") === "true");

  const fields = [];
  const done = new Set();
  for (const el of raw) {
    if (done.has(el)) continue;
    let own = [el];
    if (el.type === "radio") own = raw.filter((o) => o.type === "radio" && o.name === el.name && o.name);
    else if (el.type === "checkbox" && el.name) { const same = raw.filter((o) => o.type === "checkbox" && o.name === el.name); if (same.length > 1) own = same; }
    if (!own.length) own = [el];
    own.forEach((o) => done.add(o));
    const ids = own.map(tag);
    let kind = "text", options;
    if (el.tagName === "TEXTAREA") kind = "textarea";
    else if (el.tagName === "SELECT") {
      kind = "select";
      options = [...el.options].filter((o) => o.value !== "" && o.text.trim()).map((o) => o.text.trim());
    } else if (el.type === "radio") { kind = "radio"; options = own.map(optionLabel); }
    else if (el.type === "checkbox") { kind = "checkbox"; if (own.length > 1) options = own.map(optionLabel); }
    else if (el.closest('[data-automation-id*="multiselect" i], [data-uxi-widget-type="multiselect"]') || el.getAttribute("data-uxi-widget-type") === "selectinput" || el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute("aria-autocomplete") === "list") kind = "combobox";
    const label = labelFor(own, options || []);
    if (!label && kind === "text") continue;
    const rawLabel = (el.labels && el.labels[0] ? el.labels[0].innerText : "") || "";
    fields.push({ key: ids[0], ids, kind, label, required: req(own) || /[✱*]/.test(rawLabel), options, maxLength: el.maxLength > 0 && el.maxLength < 100000 ? el.maxLength : undefined });
  }
  for (const g of btnGroups) {
    if (g.kids.some((k) => k.hasAttribute("data-tf"))) continue;
    const ids = g.kids.map(tag);
    const options = g.kids.map(txt);
    const root = questionRoot(g.kids);
    const lines = root ? (root.innerText || "").split("\n").map(clean).filter((l) => l && !options.includes(l)) : [];
    fields.push({ key: ids[0], ids, kind: "buttons", label: lines[0] || "", required: !!root && /[✱*]/.test(root.innerText || ""), options });
  }
  const allFiles = [...document.querySelectorAll("input[type=file]")];
  // The question ("Please attach a copy of your transcript") often sits a few levels above an input whose own
  // label is just "Attach": climb until there's real text, but never into a box that holds another upload.
  const fileQuestion = (el) => {
    let node = el, best = "";
    for (let i = 0; i < 8 && node.parentElement && node.parentElement !== document.body; i++) {
      node = node.parentElement;
      if (allFiles.some((o) => o !== el && node.contains(o))) break;
      best = node.innerText || "";
      if (clean(best.replace(/accepted file types:?[a-z, ]*|attach|upload|drop files here|select files|browse|or|enter manually|dropbox|google drive|max(imum)? file size[^a-z]*/gi, "")).length > 12) break;
    }
    return best;
  };
  const files = allFiles.map((el) => {
    const around = [el.id, el.name, el.getAttribute("aria-label"), el.labels && el.labels[0] ? el.labels[0].innerText : "", fileQuestion(el)];
    return { id: tag(el), label: clean(around.join(" ")).slice(0, 240) };
  });
  return JSON.stringify({ fields, files, text: (document.body.innerText || "").slice(0, 30000) });
})()`;

/** Required fields with nothing in them, and fields the page itself marks invalid. Runs in the page. */
const CHECK = String.raw`(() => {
  const clean = (s) => (s || "").replace(/[✱*]+/g, " ").replace(/\s+/g, " ").trim();
  const bad = [];
  const seenRadio = new Set();
  for (const el of document.querySelectorAll("[data-tf]")) {
    if (el.type === "file") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const rawLabel = (el.labels && el.labels[0] ? el.labels[0].innerText : "") || "";
    const required = el.required || el.getAttribute("aria-required") === "true" || /[*✱]/.test(rawLabel);
    const label = clean(rawLabel || el.getAttribute("aria-label") || el.name || el.id);
    if (el.getAttribute("aria-invalid") === "true") { bad.push(label + " (the page flags it)"); continue; }
    if (!required) continue;
    if (el.type === "radio") {
      if (seenRadio.has(el.name)) continue;
      seenRadio.add(el.name);
      if (![...document.querySelectorAll("input[type=radio]")].filter((o) => o.name === el.name).some((o) => o.checked)) bad.push(clean(el.name));
    } else if (el.type === "checkbox") { if (!el.checked) bad.push(label); }
    else if (el.closest('[data-automation-id*="multiselect" i]')) { if (!el.closest('[data-automation-id*="multiselect" i]').querySelector('[data-automation-id="selectedItem"]')) bad.push(label); }
    else if (el.getAttribute("role") === "combobox") {
      let p = el.parentElement, has = !!el.value;
      for (let i = 0; i < 5 && p && !has; i++, p = p.parentElement) has = !!p.querySelector('[class*="single-value"],[class*="singleValue"],[class*="multi-value"],[class*="multiValue"]');
      if (!has) bad.push(label);
    } else if (!String(el.value || "").trim()) bad.push(label);
  }
  return JSON.stringify(bad);
})()`;

const FILE_SIZES = `[...document.querySelectorAll('input[type=file]')].map((i) => [...i.files].map((f) => ({ name: f.name, size: f.size })))`;

export type ScriptResult =
  | { fallback: true; why: string }
  | {
      fallback?: false;
      r: { state: "ready" | "submitted" | "needs_you" | "failed"; note: string; url: string; closed?: boolean; resume?: ReportedResume; questions?: PendingQuestion[] };
      timing: Timing;
      costUsd: number;
    };

/** Every site with an apply link goes through the script. If it cannot read the form it hands the job to the Chrome worker. PREFILL_GENERIC=0 limits it to Greenhouse, Lever and Ashby. */
export function scriptable(job: Job): boolean {
  return Boolean(job.applyUrl) && (atsOf(job.applyUrl) !== null || process.env.PREFILL_GENERIC !== "0");
}

async function comboOptions(page: Page, loc: Locator): Promise<string[] | undefined> {
  try {
    await loc.click({ timeout: 2000 });
    await page.waitForTimeout(250);
    const seen = [...new Set((await page.locator('[role="option"]:visible, [data-automation-id="promptOption"]:visible, .cx-select__list-item:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean))];
    await page.keyboard.press("Escape");
    return seen.length && seen.length <= 60 ? seen : undefined;
  } catch {
    return undefined;
  }
}

/** Owen's city and postal code (set per run from the profile), to pick the right street from an address lookup. */
let home = { city: "", postal: "" };

/**
 * An address lookup ("200 University Avenue" exists in a dozen cities): only ever take a suggestion in Owen's city,
 * typing the city along (and the short street form) until one shows up. Never the first hit; Orillia went in once.
 */
async function fillAddress(page: Page, loc: Locator, value: string): Promise<boolean> {
  const short = value.replace(/\bavenue\b/i, "Ave").replace(/\bstreet\b/i, "St").replace(/\broad\b/i, "Rd").replace(/\bdrive\b/i, "Dr").replace(/\b(west|east|north|south)\b/i, (d) => d[0].toUpperCase());
  const opts = page.locator('[role="option"]:visible, [data-automation-id="promptOption"]:visible, .cx-select__list-item:visible');
  for (const q of [`${value} ${home.city}`, `${short} ${home.city}`, value]) {
    await loc.fill("").catch(() => null);
    await loc.pressSequentially(q.slice(0, 60), { delay: 20 });
    await opts.first().waitFor({ timeout: 3500 }).catch(() => null);
    const texts = (await opts.allInnerTexts().catch(() => [] as string[])).map((s) => s.toUpperCase());
    const prefix = home.postal.replace(/\s+/g, "").slice(0, 3).toUpperCase();
    const at = texts.findIndex((t) => home.city && t.includes(home.city.toUpperCase()) && (!prefix || t.includes(prefix) || !/[A-Z]\d[A-Z]/.test(t)));
    if (at >= 0) {
      await opts.nth(at).click({ timeout: 3000 });
      // The pick fills Postal Code, City and Province a few seconds later; let it land before those get looked at.
      await page.waitForTimeout(4000);
      return true;
    }
  }
  // No suggestion in his city: leave the street typed as free text rather than a wrong match.
  await loc.fill(value).catch(() => null);
  await page.keyboard.press("Escape").catch(() => null);
  return false;
}

async function fillCombo(page: Page, loc: Locator, value: string): Promise<boolean> {
  // Already holds it (an address pick fills Postal Code, City and Province): retyping would only break the pick.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // The page may still be filling it in from that pick: give it a few seconds before typing over it.
  for (let i = 0; i < 6; i++) {
    const now = await loc.inputValue().catch(() => "");
    if (now && norm(now) === norm(value)) return true;
    if (now || !(await loc.isDisabled().catch(() => false))) break;
    await page.waitForTimeout(1000);
  }
  if (/postal|zip|city|province|state|region/i.test(await loc.getAttribute("id").catch(() => "") ?? "")) {
    for (let i = 0; i < 6; i++) {
      const now = await loc.inputValue().catch(() => "");
      if (now && norm(now) === norm(value)) return true;
      await page.waitForTimeout(1000);
    }
  }
  await loc.click({ timeout: 3000, force: true });
  const name = await loc.evaluate((el) => `${el.id} ${(el as HTMLInputElement).labels?.[0]?.innerText ?? ""} ${el.getAttribute("aria-label") ?? ""}`).catch(() => "");
  if (/address|street/i.test(name) && /^\d+\s/.test(value)) return fillAddress(page, loc, value);
  // A button that opens a list (Workday): nothing to type into, so pick from what it shows.
  if ((await loc.evaluate((el) => el.tagName)) === "BUTTON") {
    const shown = page.locator('[role="option"]:visible, [data-automation-id="promptOption"]:visible, .cx-select__list-item:visible');
    await shown.first().waitFor({ timeout: 3500 }).catch(() => null);
    const names = (await shown.allInnerTexts()).map((s) => s.trim());
    const pick = names.findIndex((n) => n === matchOption(names, value));
    if (pick < 0) {
      await page.keyboard.press("Escape");
      return false;
    }
    await shown.nth(pick).click({ timeout: 3000 });
    return true;
  }
  await loc.fill("").catch(() => null);
  await loc.pressSequentially(value.slice(0, 40), { delay: 15, timeout: 6000 }).catch(() => null);
  if (await loc.evaluate((el) => !!el.closest('[data-automation-id*="multiselect" i]'))) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    if (await loc.evaluate((el) => !!el.closest('[data-automation-id*="multiselect" i]')?.querySelector('[data-automation-id="selectedItem"]'))) return true;
  }
  const opts = page.locator('[role="option"]:visible, [data-automation-id="promptOption"]:visible, .cx-select__list-item:visible');
  await opts.first().waitFor({ timeout: 3500 }).catch(() => null);
  // A big search list (every school in the world) shows everything first and narrows a moment later: wait for it.
  const settle = async () => {
    let prev = -1;
    for (let i = 0; i < 8; i++) {
      const n = await opts.count().catch(() => 0);
      if (n === prev && n < 60) break;
      prev = n;
      await page.waitForTimeout(500);
    }
    return (await opts.allInnerTexts().catch(() => [] as string[])).map((s) => s.trim());
  };
  let texts = await settle();
  let at = texts.findIndex((t) => t === matchOption(texts, value));
  // Nothing for the whole name: search by its most telling word ("Waterloo") and look for the full name in that.
  const key = value.split(/[\s,]+/).filter((w) => w.length > 3 && !/^(university|college|institute|school|the)$/i.test(w)).at(-1);
  if (at < 0 && key && key.length < value.length) {
    await loc.fill("").catch(() => null);
    await loc.pressSequentially(key, { delay: 15, timeout: 6000 }).catch(() => null);
    await opts.first().waitFor({ timeout: 3500 }).catch(() => null);
    texts = await settle();
    at = texts.findIndex((t) => t.toLowerCase() === value.toLowerCase());
    if (at < 0) at = texts.findIndex((t) => t === matchOption(texts, value));
  }
  // Searchable lists (a city, a school) return the first hit for what was typed.
  if (at < 0 && texts.length && texts[0].toLowerCase().includes(value.toLowerCase().split(/[ ,]/)[0])) at = 0;
  if (at >= 0) {
    await opts.nth(at).click({ timeout: 3000 });
    return true;
  }
  // Nothing matched what was typed (a "how did you hear" list with no "careers page"): look at the whole list
  // and take the answer's closest option, or the catch-all "Other".
  await loc.fill("").catch(() => null);
  await page.waitForTimeout(500);
  const all = (await opts.allInnerTexts()).map((s) => s.trim());
  const other = all.findIndex((t) => matchOption(all, value) === t);
  const fallback = other >= 0 ? other : all.findIndex((t) => /^other\b/i.test(t));
  if (fallback >= 0) {
    await opts.nth(fallback).click({ timeout: 3000 });
    return true;
  }
  await page.keyboard.press("Escape");
  return false;
}

/** Types one answer into one field. Returns false when the field couldn't take it. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Forms with "ADD EDUCATION" / "ADD EXPERIENCE" buttons that open a small sub-form per entry (Oracle and the like):
 * add each entry from the tailored resume. A section that already lists the school or employer is left alone.
 */
async function fillAddLists(page: Page, h: History): Promise<string[]> {
  const notes: string[] = [];
  const body = async () => (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  const fresh = async (before: string[]) => {
    const ids = await page.evaluate((b) => [...document.querySelectorAll("input, textarea, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && e.id && !b.includes(e.id); }).map((e) => e.id), before);
    return (re: RegExp) => ids.find((id) => re.test(id));
  };
  const allIds = () => page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((e) => e.id).filter(Boolean));
  const setText = async (id: string | undefined, v: string | undefined) => {
    if (id && v) await page.locator(`[id="${id}"]`).fill(v, { timeout: 4000 }).catch(() => null);
  };
  const setCombo = async (id: string | undefined, v: string | undefined) => {
    if (id && v) await fillCombo(page, page.locator(`[id="${id}"]`), v).catch(() => false);
  };
  const setDate = async (find: (re: RegExp) => string | undefined, key: string, mmYYYY: string | undefined) => {
    const m = mmYYYY?.match(/^(\d{1,2})\/(\d{4})$/);
    if (!m) return;
    await setCombo(find(new RegExp(`^month-${key}`, "i")), MONTHS[Number(m[1]) - 1]);
    await setCombo(find(new RegExp(`^year-${key}`, "i")), m[2]);
  };
  const add = async (label: RegExp, fill: (find: (re: RegExp) => string | undefined) => Promise<void>) => {
    const before = await allIds();
    const open = page.getByRole("button", { name: label }).filter({ visible: true }).first();
    if (!(await open.count())) return false;
    await open.click({ timeout: 4000 }).catch(() => null);
    await page.waitForTimeout(2000);
    const find = await fresh(before);
    await fill(find);
    // The sub-form's own button carries the same name ("ADD EDUCATION"): it saves the entry.
    await page.getByRole("button", { name: label }).filter({ visible: true }).last().click({ timeout: 4000 }).catch(() => null);
    await page.waitForTimeout(2000);
    return true;
  };

  if (await page.getByRole("button", { name: /^add education$/i }).filter({ visible: true }).count()) {
    for (const e of h.education) {
      if ((await body()).includes(e.school.toLowerCase())) continue;
      await add(/^add education$/i, async (find) => {
        await setCombo(find(/^educationalEstablishment|school/i), e.school);
        await setText(find(/^major|fieldOfStudy/i), e.field);
        await setCombo(find(/^degree/i), e.degree);
        // Some forms show the degree as a row of buttons ("Bachelor's Degree").
        if (/bachelor/i.test(e.degree)) await page.getByRole("radio", { name: /^bachelor/i }).filter({ visible: true }).last().click({ timeout: 3000 }).catch(() => null);
        if (process.env.PREFILL_DEBUG) console.log("  [lists] school box:", find(/^educationalEstablishment|school/i), "value:", await page.locator(`[id="${find(/^educationalEstablishment|school/i)}"]`).inputValue().catch(() => "?"));
        await setDate(find, "startDate", e.from);
        await setDate(find, "dateAcquired|endDate|graduation", e.to);
      });
      if (!(await body()).includes(e.school.toLowerCase())) notes.push(`Education: add ${e.school} by hand`);
    }
  }
  if (await page.getByRole("button", { name: /^add experience$/i }).filter({ visible: true }).count()) {
    for (const w of h.work) {
      if ((await body()).includes(w.company.toLowerCase())) continue;
      await add(/^add experience$/i, async (find) => {
        await setText(find(/^employerName|company/i), w.company);
        await setText(find(/^jobTitle|title/i), w.title);
        await setDate(find, "startDate", w.from);
        if (w.current) {
          const cur = find(/current/i);
          if (cur) await page.locator(`[id="${cur}"]`).check({ force: true, timeout: 2000 }).catch(() => null);
        } else await setDate(find, "endDate", w.to);
        await setCombo(find(/^countryCode|country/i), "Canada");
        await setText(find(/^employerCity|city/i), w.location?.split(",")[0]);
        await setText(find(/^responsibilities|description/i), w.description);
      });
      if (!(await body()).includes(w.company.toLowerCase())) notes.push(`Experience: add ${w.company} by hand`);
    }
  }
  return notes;
}

async function applyAnswer(page: Page, f: ScriptField, value: string | boolean | string[]): Promise<boolean> {
  const at = (i: number) => page.locator(`[data-tf="${f.ids[i]}"]`);
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  try {
    switch (f.kind) {
      case "text":
      case "textarea":
        try {
          await at(0).fill(f.maxLength ? text.slice(0, f.maxLength) : text, { timeout: 4000 });
        } catch (err) {
          // A number input (Ashby's phone) won't take "+1 289 ...": give it the digits.
          if (!/^[+\d\s().-]+$/.test(text)) throw err;
          await at(0).fill(text.replace(/\D/g, ""), { timeout: 4000 });
        }
        return true;
      case "select": {
        const pick = matchOption(f.options ?? [], text);
        if (!pick) return false;
        await at(0).selectOption({ label: pick }, { timeout: 4000 });
        return true;
      }
      case "combobox":
        return await fillCombo(page, at(0), f.options ? matchOption(f.options, text) ?? text : text);
      case "radio":
      case "buttons": {
        const pick = matchOption(f.options ?? [], text);
        const i = pick ? (f.options ?? []).indexOf(pick) : -1;
        if (i < 0) return false;
        await at(i).evaluate((el) => (el as HTMLElement).click());
        return true;
      }
      case "checkbox": {
        if (f.options) {
          const wanted = Array.isArray(value) ? value : [text];
          let any = false;
          for (const w of wanted) {
            const pick = matchOption(f.options, w);
            if (pick) {
              await at(f.options.indexOf(pick)).evaluate((el) => !(el as HTMLInputElement).checked && (el as HTMLElement).click());
              any = true;
            }
          }
          return any;
        }
        const want = value === true || /^(true|yes)$/i.test(text);
        await at(0).evaluate((el, w) => (el as HTMLInputElement).checked !== w && (el as HTMLElement).click(), want);
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ---- Getting to the form, signing in, and moving between pages (the three plain ATSs skip all of this)

/** Tags the page's Submit or Next / Continue button with data-nav and says which one it is. Runs in the page. */
const NAV = String.raw`(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden" && !el.disabled; };
  const text = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/[^A-Za-z& ]/g, " ").replace(/  +/g, " ").trim();
  document.querySelectorAll("[data-nav]").forEach((e) => e.removeAttribute("data-nav"));
  const els = [...document.querySelectorAll("button, input[type=submit], [role=button]")].filter(vis);
  const sub = els.find((e) => /^submit( application)?$/i.test(text(e)));
  const nxt = els.find((e) => /^(save (and|&) continue|next|continue|review( and submit)?)$/i.test(text(e)));
  const pick = sub || nxt;
  if (!pick) return "";
  pick.setAttribute("data-nav", "1");
  return sub ? "submit" : "next";
})()`;

async function navButton(page: Page): Promise<{ kind: "submit" | "next"; loc: Locator } | null> {
  const kind = (await page.evaluate(NAV).catch(() => "")) as string;
  return kind === "submit" || kind === "next" ? { kind, loc: page.locator('[data-nav="1"]').first() } : null;
}

async function clickText(page: Page, re: RegExp): Promise<boolean> {
  // By text, then by accessible name: Oracle's "APPLY NOW" carries hidden text, so the text match misses it.
  let loc = page.locator('a:visible, button:visible, [role="button"]:visible').filter({ hasText: re }).first();
  if (!(await loc.count())) loc = page.getByRole("button", { name: re }).filter({ visible: true }).first();
  if (!(await loc.count())) loc = page.getByRole("link", { name: re }).filter({ visible: true }).first();
  if (!(await loc.count())) {
    // Last resort: what the button visibly says (innerText, or its aria-label), matched in the page itself.
    const found = await page
      .evaluate(
        ([src, flags]) => {
          const r = new RegExp(src, flags);
          document.querySelectorAll("[data-click]").forEach((e) => e.removeAttribute("data-click"));
          const el = [...document.querySelectorAll("a, button, [role=button]")].find((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 1 && b.height > 1 && (r.test(((e as HTMLElement).innerText || "").trim()) || r.test((e.getAttribute("aria-label") || "").trim()));
          });
          el?.setAttribute("data-click", "1");
          return Boolean(el);
        },
        [re.source, re.flags] as const,
      )
      .catch(() => false);
    if (!found) return false;
    loc = page.locator('[data-click="1"]').first();
  }
  await loc.click({ timeout: 4000, force: true }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => null);
  await page.waitForTimeout(1200);
  return true;
}

/** Signs in with the saved account for this site, or makes one. Returns why it couldn't, or null to carry on. */
async function signIn(page: Page, email: string, touch: () => void): Promise<string | null> {
  const host = new URL(page.url()).hostname;
  const acct = readAccounts().find((a) => a.site === host);
  // Workday keeps the other screen's boxes in the page, so its own Sign In button decides which screen this is.
  const onSignIn = (await page.locator('[data-automation-id="signInSubmitButton"]:visible').count()) > 0;
  const creating = !onSignIn && (await page.locator('input[type="password"]:visible').count()) >= 2;
  if (creating && acct) return (await clickText(page, /^sign in$/i)) ? null : "This site wants a sign-in and I couldn't find the Sign In button.";
  if (!creating && !acct) return (await clickText(page, /^create account$/i)) ? null : `${host} needs an account and I couldn't find where to make one.`;
  const login = { email: acct?.email ?? email, password: acct?.password ?? `Ti${randomBytes(6).toString("hex")}#9a` };
  touch();
  const emailBox = page.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[data-automation-id="email"]:visible').first();
  await (await emailBox.count() ? emailBox : page.locator('input[type="text"]:visible').first()).fill(login.email, { timeout: 4000 });
  const pws = page.locator('input[type="password"]:visible');
  for (let i = 0; i < (await pws.count()); i++) await pws.nth(i).fill(login.password, { timeout: 4000 });
  if (creating) {
    const boxes = page.locator('input[type="checkbox"]:visible');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check({ timeout: 2000, force: true }).catch(() => null);
    saveAccount({ site: host, email: login.email, password: login.password, createdAt: new Date().toISOString() });
  }
  const go = page.locator(`[data-automation-id="${creating ? "createAccountSubmitButton" : "signInSubmitButton"}"]`).first();
  if (await go.count()) await go.click({ timeout: 4000, force: true }).catch(() => null);
  else await clickText(page, creating ? /^create account$/i : /^sign in$/i);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText().catch(() => "");
  if (await page.locator('input[type="password"]:visible').count()) {
    if (/verify|verification|check your email|confirm your email/i.test(body)) return `Made an account on ${host}. It emailed a verification link: click it, then hit Finish.`;
    return `Couldn't sign in on ${host} (${(body.match(/(incorrect|invalid|did not match|not found)[^.\n]{0,60}/i) ?? ["the form is still showing"])[0]}). Sign in by hand, then hit Finish.`;
  }
  return null;
}

/** Clicks through landing pages and sign-in until a form with fields is showing. */
function profileEmail(profile: string): string {
  try {
    return String(JSON.parse(profile).email || "itsowenchlee@gmail.com");
  } catch {
    return "itsowenchlee@gmail.com";
  }
}

/** A screen asking for a code the site emailed or texted ("Confirm your identity", "Enter the 6-digit code"). */
async function codeScreen(page: Page): Promise<boolean> {
  const text = await page.locator("body").innerText().catch(() => "");
  if (!/confirm your identity|verification code|enter the code|one-time (pass)?code|6-digit|we (sent|emailed) (you )?a code|security code/i.test(text)) return false;
  return (await page.locator('input:visible:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').count()) > 0;
}

/**
 * Owen types the code himself (reading his inbox and signing in for him is off-limits): bring the tab up, tell him,
 * and wait right here, up to 15 minutes, for the page to move past the code screen. Other jobs keep going meanwhile.
 */
async function waitForCode(page: Page, waitForYou?: (why: string) => void): Promise<boolean> {
  await page.bringToFront().catch(() => null);
  waitForYou?.(`${new URL(page.url()).hostname} emailed you a code. Type it into its tab in the fill window; this job carries on by itself.`);
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(3000);
    if (!(await codeScreen(page))) return true;
  }
  return false;
}

async function reachForm(page: Page, email: string, touch: () => void, waitForYou?: (why: string) => void): Promise<{ stuck?: string }> {
  // A cookie banner sits over the Apply button on some sites.
  await page.getByText(/^(accept cookies|accept all cookies|accept all|accept)$/i).first().click({ timeout: 1500 }).catch(() => null);
  for (let i = 0; i < 6; i++) {
    // "Get started with just your email" (Oracle and the like): type it, tick the terms, Next. A code screen follows.
    const emailOnly = page.locator('input[type="email"]:visible, input[name*="email" i]:visible, input[aria-label*="email" i]:visible').first();
    const fieldsHere = await page.locator('input:visible:not([type="hidden"]):not([type="checkbox"]), textarea:visible, select:visible').count();
    if (!(await codeScreen(page)) && fieldsHere <= 2 && (await emailOnly.count()) && !(await page.locator('input[type="password"]:visible').count())) {
      touch();
      await emailOnly.fill(email, { timeout: 4000 }).catch(() => null);
      // The terms box is often drawn over a zero-size input: tick it, else click its label.
      const boxes = page.locator('input[type="checkbox"]');
      for (let b = 0; b < (await boxes.count()); b++) {
        const box = boxes.nth(b);
        if (await box.isChecked().catch(() => true)) continue;
        await box.check({ force: true, timeout: 2000 }).catch(() => null);
        const id = await box.getAttribute("id").catch(() => null);
        if (!(await box.isChecked().catch(() => true)) && id) await page.locator(`label[for="${id}"]`).first().click({ timeout: 2000 }).catch(() => null);
        if (!(await box.isChecked().catch(() => true))) await box.evaluate((el) => (el as HTMLInputElement).click()).catch(() => null);
      }
      // Ticking it can open the terms in a window with its own "Agree" button (Oracle does): press it.
      await clickText(page, /^(agree|i agree|accept|i accept)$/i);
      for (let b = 0; b < (await boxes.count()); b++) {
        const box = boxes.nth(b);
        if (!(await box.isChecked().catch(() => true))) await box.evaluate((el) => (el as HTMLInputElement).click()).catch(() => null);
      }
      if (process.env.PREFILL_DEBUG) console.log("  [gate] email screen, terms ticked:", await boxes.first().isChecked().catch(() => null));
      if (!(await clickText(page, /^(next|continue|submit)$/i))) return { stuck: "couldn't get past the email screen" };
      await page.waitForTimeout(2500);
      continue;
    }
    if (await codeScreen(page)) {
      touch();
      if (!(await waitForCode(page, waitForYou))) return { stuck: "The site's emailed code wasn't entered within 15 minutes. Type it into the tab, then hit Finish." };
      await page.waitForTimeout(2000);
      continue;
    }
    if (process.env.PREFILL_DEBUG) console.log("  [gate]", i, page.url().slice(-50), "| pw", await page.locator('input[type="password"]:visible').count(), "|", (await page.locator("body").innerText().catch(() => "")).slice(-260).split("\n").join(" "));
    if (await page.locator('input[type="password"]:visible').count()) {
      // A brand-new account lands back here until the link in its welcome email is clicked.
      if (/email has been sent|verify your account/i.test(await page.locator("body").innerText().catch(() => ""))) {
        touch();
        return { stuck: `Made an account on ${new URL(page.url()).hostname}. It emailed a verification link to ${email}: click it, then hit Finish.` };
      }
      const why = await signIn(page, email, touch);
      if (why) return { stuck: why };
      continue;
    }
    const inputs = await page.locator('input:visible:not([type="hidden"]):not([type="search"]), textarea:visible, select:visible').count();
    if ((await page.locator('input[type="file"]').count()) || inputs >= 3) return {};
    // Workday sometimes shows "Something went wrong. Please refresh the page": refresh, as it says.
    if (/something went wrong|please refresh the page/i.test(await page.locator("body").innerText().catch(() => ""))) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(3000);
      continue;
    }
    // Workday and the like draw the page a few seconds after it loads: keep looking before calling it stuck.
    let moved = false;
    for (let wait = 0; wait < 20 && !moved; wait++) {
      if (wait) await page.waitForTimeout(500);
      const fields = page.locator('input:visible:not([type="hidden"]):not([type="search"]), textarea:visible, select:visible');
      if ((await fields.count()) >= 3 || (await page.locator('input[type="password"]:visible').count())) {
        moved = true;
        break;
      }
      for (const re of [/^apply manually$/i, /^sign in with email$/i, /^(continue application|start your application|start application|apply now|apply for this job|apply)$/i]) {
        if (await clickText(page, re)) {
          moved = true;
          break;
        }
      }
    }
    if (!moved) return { stuck: "couldn't find the application form or an Apply button" };
  }
  return { stuck: "couldn't get past the landing pages" };
}

const CLOSED = /no longer (accepting|available|open)|position (has been |is )?(filled|closed)|job (not found|has expired)|this job (is|has been) (closed|removed)|page (you('re| are) looking for )?(not found|doesn't exist)|posting (is )?(closed|no longer)/i;

export async function scriptFill(
  job: Job,
  o: { resume: string; coverLetter?: string; profile: string; experience: string; model: string; submit?: { resumeSize: number }; cwd: string; waitForYou?: (why: string) => void },
): Promise<ScriptResult> {
  const ats = atsOf(job.applyUrl);
  if (!job.applyUrl) return { fallback: true, why: "no application URL" };
  const t0 = Date.now();
  const phases: Record<string, number> = {};
  const lap = (name: string, from: number) => (phases[name] = Math.round((Date.now() - from) / 100) / 10);
  const tools: Record<string, number> = { script: 1 };
  const timing = (extra?: Partial<Timing>): Timing => ({ secs: Math.round((Date.now() - t0) / 100) / 10, toolCalls: 0, tools, phases, ...extra });

  let context: BrowserContext;
  let page: Page;
  let reused = false;
  try {
    context = (await connect()).contexts()[0];
    // The same posting's tab, however the site rewrote its address since (Workday adds /en-US/ and /apply/..., Oracle
    // keeps the job in the #hash, a sign-in page keeps it in ?redirect=): same host and the same posting number.
    const here = (u: string) => {
      try {
        const url = new URL(u);
        const all = decodeURIComponent(url.pathname + url.hash + url.search);
        const id = all.match(/[0-9]{4,}/)?.[0];
        const parts = decodeURIComponent(url.pathname).split("/").filter((s) => s && !/^(apply|application|applymanually|autofillwithresume|useMyLastApplication|en-us|login)$/i.test(s));
        return `${url.hostname}|${id ?? (parts.at(-1) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      } catch {
        return u;
      }
    };
    // Sites with a sign-in (Workday, Oracle...) keep it in the open tab: carry on in that tab instead of closing it,
    // or Owen gets signed out and asked for another emailed code. The three plain ATSs start from a fresh form.
    const olds = context.pages().filter((p) => here(p.url()) === here(job.applyUrl ?? ""));
    const keep = ats ? undefined : olds.pop();
    for (const old of olds) await old.close().catch(() => null);
    page = keep ?? (await context.newPage());
    reused = Boolean(keep);
  } catch (err) {
    return { fallback: true, why: `couldn't start the script's Chrome (${err instanceof Error ? err.message : err})` };
  }
  let touched = false; // after this the tab holds Owen's data; falling back would leave a half-filled tab behind
  const give = async (why: string): Promise<ScriptResult> => {
    if (!touched) await page.close().catch(() => null);
    return { fallback: true, why };
  };

  try {
    let t = Date.now();
    // A reused tab already inside the application stays where it is (going back to the posting can restart it).
    if (reused && /apply|application|candidate|section/i.test(page.url())) await page.bringToFront().catch(() => null);
    else await page.goto(ats ? formUrl(ats, job.applyUrl) : job.applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
    if (ats === "greenhouse" && !(await page.locator("input[type=file]").count())) {
      await page.locator('a:has-text("Apply"), button:has-text("Apply")').first().click({ timeout: 3000 }).catch(() => null);
      await page.waitForTimeout(1500);
    }
    lap("open", t);

    // Get to the form itself: click through an "Apply" landing page, sign in (or make an account) when asked.
    t = Date.now();
    const gate = await reachForm(page, profileEmail(o.profile), () => (touched = true), o.waitForYou);
    lap("gate", t);
    if (gate.stuck) {
      if (!touched) return await give(gate.stuck);
      return { r: { state: "needs_you", note: gate.stuck, url: page.url() }, timing: timing(), costUsd: 0 };
    }

    let ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
    const firstText = ex.text;
    if (!ex.fields.length && CLOSED.test(ex.text)) {
      return { r: { state: "failed", closed: true, note: "The employer's form says the posting is closed.", url: page.url() }, timing: timing(), costUsd: 0 };
    }
    if (ex.fields.length < 3 && !ex.files.length) return await give(`couldn't read the form (${ex.fields.length} fields)`);
    if (/captcha|verify you are human|are you a robot/i.test(ex.text.slice(0, 2000)) && ex.fields.length < 5) return await give("a human check is in the way");

    const saved = readAnswerBank();
    const savedJson = saved.length ? JSON.stringify(saved.map(({ q, a }) => ({ q, a }))) : "none yet";
    let costUsd = 0;
    let resume: ReportedResume | undefined;
    let uploaded = false;
    const expected = statSync(o.resume).size;
    const questions: PendingQuestion[] = [];
    const unfilledAll: string[] = [];
    const emptyAll: string[] = [];
    const allFields: ScriptField[] = [];
    const answered: Record<string, string | boolean | string[]> = {};
    let pages = 0;
    let stoppedOn = "";

    try {
      const pr = JSON.parse(o.profile);
      home = { city: String(pr.city ?? ""), postal: String(pr.postalCode ?? "") };
    } catch {
      home = { city: "", postal: "" };
    }
    let samePageAgain = 0;
    for (let step = 0; step < 12; step++) {
      pages++;
      if (step > 0) {
        // The next page renders a moment after the click: wait for a form or a button before reading it.
        for (let i = 0; i < 20; i++) {
          if ((await page.locator('input:visible, textarea:visible, select:visible, input[type="file"]').count()) && (await navButton(page))) break;
          await page.waitForTimeout(500);
        }
        ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
      }
      // Files first: the sites parse the resume and may fill fields, which the answers below then overwrite.
      t = Date.now();
      touched = true;
      const resumeInput = ex.files.find((f) => isResumeField(f.label)) ?? (ex.files.length === 1 && !isTranscriptField(ex.files[0].label) ? ex.files[0] : undefined);
      const letterInput = o.coverLetter ? ex.files.find((f) => isCoverLetterField(f.label)) : undefined;
      const already = async () => /successfully uploaded/i.test(await page.locator("body").innerText().catch(() => ""));
      const empty = async (id: string) => (await page.locator(`[data-tf="${id}"]`).evaluate((el) => !(el as HTMLInputElement).files?.length).catch(() => false));
      let sent = false;
      if (resumeInput && (await empty(resumeInput.id)) && !(await already())) {
        await page.locator(`[data-tf="${resumeInput.id}"]`).setInputFiles(o.resume);
        sent = uploaded = true;
      } else if (resumeInput && (await already())) uploaded = true;
      if (letterInput && o.coverLetter && (await empty(letterInput.id))) {
        await page.locator(`[data-tf="${letterInput.id}"]`).setInputFiles(o.coverLetter);
        sent = true;
      }
      const transcriptInput = existsSync(TRANSCRIPT) ? ex.files.find((f) => isTranscriptField(f.label)) : undefined;
      if (transcriptInput && (await empty(transcriptInput.id))) {
        await page.locator(`[data-tf="${transcriptInput.id}"]`).setInputFiles(TRANSCRIPT);
        sent = true;
      }
      if (sent) await page.waitForTimeout(ats === "ashby" ? 3500 : 2500);
      // Workday keeps every file ever uploaded to a draft, with its size: keep one copy of this job's resume
      // (which also proves it's the right one) and delete the rest, so an old run's resume can't go out.
      const items = page.locator('[data-automation-id="file-upload-item"]');
      if (resumeInput && (await items.count())) {
        const want = `${(expected / 1024).toFixed(2)} KB`;
        for (let n = 0; n < 8; n++) {
          const texts = await items.allInnerTexts().catch(() => [] as string[]);
          const keep = texts.findIndex((x) => x.includes(want));
          const drop = texts.findIndex((x, i) => i !== keep && /resume|cv/i.test(x) && !/transcript/i.test(x));
          if (drop < 0) break;
          await items.nth(drop).locator('[data-automation-id="delete-file"]').click({ force: true, timeout: 3000 }).catch(() => null);
          await page.waitForTimeout(1200);
        }
        if (!(await items.allInnerTexts().catch(() => [] as string[])).some((x) => x.includes(want))) {
          await page.locator(`[data-tf="${resumeInput.id}"]`).setInputFiles(o.resume).catch(() => null);
          await page.waitForTimeout(2500);
        }
        if ((await items.allInnerTexts().catch(() => [] as string[])).filter((x) => x.includes(want)).length === 1) {
          uploaded = true;
          resume = { name: "Owen_Lee_Resume.pdf", size: expected };
        }
      }
      if (process.env.PREFILL_DEBUG) console.log("  [files]", ex.files.map((f) => f.label.slice(-70)), "resume:", resumeInput?.id, "transcript:", transcriptInput?.id);
      lap(`upload${step || ""}`, t);

      // Workday's My Experience: add the work, education, website and skills entries from the tailored resume.
      t = Date.now();
      let history = false;
      if (await page.locator('[aria-labelledby="Work-Experience-section"]').count()) {
        history = true;
        let website: string | undefined;
        try {
          website = JSON.parse(o.profile).website || undefined;
        } catch {
          // no website
        }
        const wd = await inFront(page, () => fillWorkdayHistory(page, { jobDir: path.dirname(path.dirname(o.resume)), website, model: o.model, cwd: o.cwd }));
        costUsd += wd.costUsd;
        emptyAll.push(...wd.notes);
      }
      // Other sites' "ADD EDUCATION" / "ADD EXPERIENCE" buttons (Oracle and the like): same history, one sub-form per entry.
      if (!history && (await page.getByRole("button", { name: /^add (education|experience)$/i }).filter({ visible: true }).count())) {
        history = true;
        const loaded = await loadHistory({ jobDir: path.dirname(path.dirname(o.resume)), model: o.model, cwd: o.cwd });
        costUsd += loaded.costUsd;
        if (loaded.h) emptyAll.push(...(await inFront(page, () => fillAddLists(page, loaded.h!))));
      }
      lap(`history${step || ""}`, t);

      // Read the fields again (an upload can add or change them), and look inside each dropdown for its choices.
      t = Date.now();
      if (sent || step === 0 || history) ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
      const fields = ex.fields.filter((f) => f.label);
      await inFront(page, async () => {
        for (const f of fields) if (f.kind === "combobox") f.options = await comboOptions(page, page.locator(`[data-tf="${f.key}"]`));
      });
      lap(`read${step || ""}`, t);

      // One model call for every answer on the page.
      t = Date.now();
      let reply = null as ReturnType<typeof parseFillReply>;
      if (fields.length) {
        const asked = trimFields(fields.map(({ ids: _ids, ...f }) => f));
        const prompt = fillPrompt(job, asked, o.profile, savedJson, o.experience, step);
        for (let attempt = 0; attempt < 2 && !reply; attempt++) {
          const run = await runClaude({ cwd: o.cwd, prompt, allowedTools: [], model: o.model, extraArgs: ["--tools", '""', "--strict-mcp-config"], timeoutMs: 4 * 60_000 });
          costUsd += run.costUsd;
          reply = run.ok ? parseFillReply(run.result) : null;
        }
        if (!reply) return { r: { state: "needs_you", note: `${step ? `Filled through page ${step}. ` : "Resume attached, but "}the answers couldn't be generated. Fill the rest by hand.`, url: page.url() }, timing: timing(), costUsd };
      } else reply = { answers: {}, ask: [] };
      lap(`answers${step || ""}`, t);

      // Type them in.
      t = Date.now();
      await inFront(page, async () => {
        // Answers are keyed by the field's first tag; a page that rebuilds fields (an address pick redraws Postal Code,
        // City and Province) drops the tags, so find those fields again by their label before typing.
        // A phone's country-code box carries the same "Phone Number" label as the number itself, so the model can't
        // tell them apart: set it to Canada here, and the number field gets the 10 digits.
        const codeBox = page.locator('input[role="combobox"][id*="country-code" i]:visible').first();
        if ((await codeBox.count()) && !(await codeBox.inputValue().catch(() => "")).trim()) await fillCombo(page, codeBox, "Canada").catch(() => false);
        const isCodeBox = async (f: ScriptField) => /country-code/i.test((await page.locator(`[data-tf="${f.ids[0]}"]`).getAttribute("id").catch(() => "")) ?? "");
        const answerOf = new Map(fields.map((f) => [f, reply!.answers[f.key]]));
        for (const f of fields) if (f.kind === "combobox" && (await isCodeBox(f))) answerOf.delete(f);
        for (const f of fields) {
          const v = answerOf.get(f);
          if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
          if (!(await page.locator(`[data-tf="${f.ids[0]}"]`).count())) {
            const again = (JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted).fields;
            for (const g of fields) {
              const m = again.find((x) => x.label === g.label && x.kind === g.kind);
              g.ids = m ? m.ids : [];
              g.key = m ? m.key : g.key;
            }
            if (!f.ids.length) continue;
          }
          const t1 = Date.now();
          const ok = await applyAnswer(page, f, v);
          if (process.env.PREFILL_DEBUG) console.log(`  [fill] ${ok ? "ok " : "FAIL"} ${Date.now() - t1}ms ${f.kind} "${f.label.slice(0, 50)}" <- ${String(v).slice(0, 40)}`);
          if (!ok) unfilledAll.push(f.label);
          else answered[f.label] = v;
        }
      });
      lap(`fill${step || ""}`, t);
      // Required consent boxes (terms, privacy) are often drawn as invisible inputs the field scan skips.
      await inFront(page, async () => {
        const boxes = page.locator('input[type="checkbox"][aria-required="true"]:not(:checked)');
        for (let i = 0; i < (await boxes.count()); i++) {
          const box = boxes.nth(i);
          await box.click({ force: true, timeout: 2000 }).catch(() => null);
          if (!(await box.isChecked().catch(() => false))) await box.evaluate((el) => (el as HTMLInputElement).click()).catch(() => null);
        }
      });
      allFields.push(...fields);

      if ((sent || uploaded) && !resume) {
        const sizes = (await page.evaluate(FILE_SIZES)) as { name: string; size: number }[][];
        const held = sizes.flat().find((f) => f.size === expected) ?? sizes.flat().find((f) => /resume/i.test(f.name));
        // Some forms clear the input once the file is sent; then the filename the page shows has to do.
        const shown = !held && (await page.locator("body").innerText()).includes("Owen_Lee_Resume.pdf");
        resume = held ? { name: held.name, size: held.size } : shown ? { name: "Owen_Lee_Resume.pdf", size: null } : undefined;
      }

      // Nothing required left empty, and nothing for Owen to answer, on this page.
      const here = (JSON.parse((await page.evaluate(CHECK)) as string) as string[]).filter((l) => l && !reply!.ask.some((k) => fields.find((f) => f.key === k)?.label === l));
      // Answers can make new fields appear (Country -> Address, Province...). Go over the same page once more for those.
      const fresh = (JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted).fields.filter((f) => f.label && !fields.some((g) => g.label === f.label));
      if (fresh.length && samePageAgain < 3) {
        samePageAgain++;
        ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
        step--;
        pages--;
        continue;
      }
      samePageAgain = 0;
      emptyAll.push(...here);
      for (const k of reply.ask) {
        const f = fields.find((x) => x.key === k);
        if (f) questions.push({ q: f.label, ...(f.options && { options: f.options }) });
      }
      const blocked = questions.length > 0 || here.length > 0 || unfilledAll.some((l) => fields.find((f) => f.label === l)?.required);
      if (blocked) {
        stoppedOn = step ? ` on page ${pages}` : "";
        break;
      }

      // More pages? Click through; the last page has Submit instead.
      const nav = await navButton(page);
      if (process.env.PREFILL_DEBUG) console.log("  [page]", step, ex.fields.length, "fields,", ex.files.length, "files, nav:", nav?.kind ?? "none", "blocked:", blocked);
      if (!nav || nav.kind === "submit") break;
      const sig = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
      await inFront(page, async () => {
        await nav.loc.click({ timeout: 4000, force: true }).catch(() => null);
        await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => null);
        await page.waitForTimeout(1500);
      });
      let after = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
      for (let w = 0; w < 40 && after === sig; w++) {
        await page.waitForTimeout(500);
        after = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
      }
      // Workday also announces "Owen_Lee_Resume.pdf successfully uploaded" as an alert: that one isn't an error.
      const alerts = await page.locator('[role="alert"]:visible, [data-automation-id="errorMessage"]:visible, [data-automation-id="errorHeading"]:visible').allInnerTexts().catch(() => [] as string[]);
      const showsErrors = alerts.filter((a) => a.trim() && !/successfully|uploaded|saved/i.test(a)).length;
      if (after === sig || showsErrors) {
        const errs = (JSON.parse((await page.evaluate(CHECK)) as string) as string[]).filter(Boolean);
        emptyAll.push(...(errs.length ? errs : ["the page wouldn't move on (check the tab for errors)"]));
        stoppedOn = ` on page ${pages}`;
        break;
      }
      if (step === 11) stoppedOn = " (stopped after 12 pages)";
    }

    const resumeCheck = checkResume(resume, expected);
    const fields = allFields;
    const unfilled = unfilledAll;
    const missing = [...new Set([...emptyAll, ...unfilled.filter((l) => fields.find((f) => f.label === l)?.required)])];
    const url = page.url();
    const base = { url, resume, questions: questions.length ? questions : undefined };
    const pageNote = pages > 1 ? ` (${pages} pages)` : "";
    ex = { ...ex, text: firstText };

    if (resumeCheck.status === "mismatch") return { r: { ...base, state: "needs_you", note: `${resumeCheck.detail} Swap in the right one.` }, timing: timing(), costUsd };
    const essays = Object.values(answered).filter((v) => typeof v === "string" && v.length > 120).length;
    const essayNote = essays ? ` I drafted ${essays} written answer${essays > 1 ? "s" : ""}; read ${essays > 1 ? "them" : "it"}.` : "";
    if (questions.length) return { r: { ...base, state: "needs_you", note: `Filled${stoppedOn || " the rest"}. ${questions.length} question${questions.length > 1 ? "s" : ""} need${questions.length > 1 ? "" : "s"} your answer${missing.length ? `; also still empty: ${missing.slice(0, 4).join("; ")}` : ""}.${essayNote}` }, timing: timing(), costUsd };
    if (missing.length) return { r: { ...base, state: "needs_you", note: `Filled most of it${stoppedOn}. Still empty: ${missing.slice(0, 5).join("; ")}.${essayNote}` }, timing: timing(), costUsd };
    // The resume can already be attached from an earlier pass (the page lists it by name and the upload box is gone).
    if (!uploaded && firstText.includes("Owen_Lee_Resume.pdf")) uploaded = true;
    if (!uploaded && (await page.locator("body").innerText().catch(() => "")).includes("Owen_Lee_Resume.pdf")) uploaded = true;
    if (!uploaded) return { r: { ...base, state: "needs_you", note: `Filled${pageNote}, but I never found a resume upload. Attach it by hand.${essayNote}` }, timing: timing(), costUsd };

    if (!o.submit) return { r: { ...base, state: "ready", note: `Filled and the tailored resume is attached.${essayNote} Review and submit.` }, timing: timing(), costUsd };

    // ---- Submit gates (all must hold; otherwise stop at ready)
    const stop = (why: string): ScriptResult => ({ r: { ...base, state: "ready", note: `Not submitted: ${why}.${essayNote}` }, timing: timing(), costUsd });
    if (resumeCheck.status !== "verified" && !(resume?.name === "Owen_Lee_Resume.pdf")) return stop("couldn't confirm the attached resume is the tailored one");
    if (!roleOnPage(job.role, ex.text)) return stop(`the page doesn't look like the ${job.role} posting`);
    const term = job.termConfirmed ? null : wrongTerm(ex.text);
    if (term) return stop(`the posting mentions ${term}, not Summer 2027`);
    if (/captcha/i.test(await page.content()) && (await page.locator('iframe[src*="bframe"], iframe[title*="challenge" i]').count())) return stop("a human check is showing");

    t = Date.now();
    const before = /thank you|application (has been )?(received|submitted)|successfully submitted/i.test(await page.locator("body").innerText());
    const nav = await navButton(page);
    const button = nav?.kind === "submit" ? nav.loc : page.locator('button[type="submit"], input[type="submit"], #btn-submit, button:has-text("Submit application"), button:has-text("Submit Application")').last();
    await button.click({ timeout: 5000 });
    let confirmation: string | null = null;
    for (let i = 0; i < 30 && !confirmation; i++) {
      await page.waitForTimeout(1000);
      const body = await page.locator("body").innerText().catch(() => "");
      const hit = body.match(/(thank you[^.\n]{0,80}|application (has been )?(received|submitted)[^.\n]{0,60}|successfully submitted[^.\n]{0,60}|we('ve| have) received your application[^.\n]{0,40})/i);
      if (hit && (!before || /thank|confirm|submitted|success/i.test(page.url()))) confirmation = hit[0].trim();
      else if (/security code|verification code/i.test(body) && (await page.locator("input:visible").count())) break;
    }
    lap("submit", t);
    if (confirmation) return { r: { ...base, url: page.url(), state: "submitted", note: `Submitted. Confirmation: "${confirmation}". Resume ${resume?.name ?? "Owen_Lee_Resume.pdf"}${resume?.size ? ` (${(resume.size / 1024).toFixed(1)} KB)` : ""}, uploaded by script.` }, timing: timing(), costUsd };
    const after = await page.locator("body").innerText().catch(() => "");
    const why = /security code|verification code/i.test(after) ? "The site emailed a security code; enter it in the tab to finish" : "Clicked Submit, no confirmation seen";
    return { r: { ...base, url: page.url(), state: "needs_you", note: `${why}. Do not submit twice: check the tab.` }, timing: timing(), costUsd };
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    if (!touched) return give(why);
    return { r: { state: "needs_you", note: `The script stopped partway (${why.slice(0, 120)}). The tab is open as it was left.`, url: page.url() }, timing: timing(), costUsd: 0 };
  }
}
