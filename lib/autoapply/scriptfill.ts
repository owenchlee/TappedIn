// Scripted prefill for Greenhouse, Lever and Ashby forms. A Claude Code worker driving Chrome one click at a
// time takes minutes per job; these three forms are plain enough for a script to read every field, ask the
// model ONE question (all the answers at once, no browser tools), and type them in. Anything unfamiliar
// returns { fallback: true } before touching the form, and scripts/prefill.ts hands the job to the worker.
//
// The script drives its own Chrome window (profile private/browser-profile, remote debugging on a local
// port) and leaves the tab open when it exits, so Owen reviews it like any other prefilled tab.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { runClaude } from "./claude";
import { waitForMailLink } from "./maillink";
import { reviewProblems } from "./reviewcheck";
import { atsOf, fillPrompt, formUrl, isCoverLetterField, isPortfolioField, isResumeField, isTranscriptField, matchOption, parseFillReply, roleOnPage, savedAnswerFor, selfId, trimFields, wrongTerm, offTermTitle, type FormField } from "./formfill";
import type { Job } from "./job";
import { longInPerson } from "./queue";
import { PRIVATE_DIR } from "./job";
import { fillWorkdayHistory, loadHistory, type History } from "./workday";
import { checkResume, readAccounts, readAnswerBank, saveAccount, type PendingQuestion, type ReportedResume, type Timing } from "./prefill";

const TRANSCRIPT = path.join(PRIVATE_DIR, "Owen_Lee_Transcript.pdf");
// One page linking to owenchlee.me, for upload boxes labelled portfolio / work samples.
const PORTFOLIO = path.join(PRIVATE_DIR, "Owen_Lee_Portfolio.pdf");

const PORT = Number(process.env.PREFILL_CDP_PORT) || 9333;
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
].filter((p): p is string => Boolean(p));

let browserPromise: Promise<Browser> | null = null;

/**
 * A tab whose page has frozen (a Workday sign-in page did, overnight 2026-11-04) blocks Playwright from attaching
 * to the whole browser, so every later run would fail. Ask each tab for 1+1 over its own socket; close any that
 * doesn't answer in 5 s. Does nothing when Chrome isn't running.
 */
async function closeHungTabs(url: string): Promise<void> {
  let list: { id: string; type: string; url: string; webSocketDebuggerUrl?: string }[];
  try {
    list = await (await fetch(`${url}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
  } catch {
    return;
  }
  await Promise.all(
    list
      .filter((t) => t.type === "page" && t.webSocketDebuggerUrl)
      .map(async (t) => {
        const alive = await new Promise<boolean>((done) => {
          const ws = new WebSocket(t.webSocketDebuggerUrl!);
          const resolve = (v: boolean) => {
            try {
              ws.close();
            } catch {}
            done(v);
          };
          const timer = setTimeout(() => resolve(false), 5000);
          ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "1+1" } }));
          ws.onmessage = (e) => {
            if (JSON.parse(String(e.data)).id === 1) {
              clearTimeout(timer);
              resolve(true);
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve(true); // can't tell: leave it
          };
        }).finally(() => null);
        if (!alive) {
          await fetch(`${url}/json/close/${t.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
          console.log(`  closed a frozen tab: ${t.url.slice(0, 80)}`);
        }
      }),
  );
}

/** Connects to the script's own Chrome, starting it (detached, so it outlives this process) if it isn't up. */
function connect(): Promise<Browser> {
  browserPromise ??= (async () => {
    const url = `http://127.0.0.1:${PORT}`;
    await closeHungTabs(url);
    try {
      return await chromium.connectOverCDP(url, { timeout: 8000 });
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
  const clean = (s) => (s || "").replace(/[âœ±*]+/g, " ").replace(/\s+/g, " ").trim();
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
    // Workday's "Select One" dropdowns are <button type="button" aria-haspopup="listbox">: keep those.
    const listbox = el.tagName === "BUTTON" && el.getAttribute("aria-haspopup") === "listbox";
    if (!listbox && ["hidden", "submit", "button", "image", "reset", "file", "search"].includes(el.type)) return false;
    // Workday's experience lists are filled from the resume (lib/autoapply/workday.ts), not by the model.
    if (/^(workExperience|education|webAddress|language|skills)-/.test(el.id || "")) return false;
    if (el.tabIndex === -1 && el.type !== "radio" && el.type !== "checkbox") return false;
    if (el.closest("header, nav, footer")) return false;
    if (vis(el)) return true;
    // Styled radios and checkboxes (Workday) hide the real input at zero opacity and draw their own: its label shows.
    if (el.type === "radio" || el.type === "checkbox") {
      const l = (el.labels && el.labels[0]) || el.closest("label");
      return !!l && vis(l) && !el.closest("[aria-hidden=true], [hidden]");
    }
    return false;
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
    // Workday questions: the field's own label / legend ("6). Do you own... intellectual property"), never the
    // button's "Select One Required".
    const ff = el.closest('[data-automation-id^="formField"]');
    if (ff) {
      const l = ff.querySelector("label, legend");
      const t = l ? txt(l) : "";
      if (t && !/^select one/i.test(t)) return t;
    }
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
    else if (el.type === "checkbox") {
      // Same name, else the same question box: Workday's "select all that apply" boxes share no name (Revvity notice period).
      const box = el.closest('fieldset, [data-automation-id^="formField"]');
      const same = el.name ? raw.filter((o) => o.type === "checkbox" && o.name === el.name) : box ? raw.filter((o) => o.type === "checkbox" && box.contains(o)) : [];
      if (same.length > 1) own = same;
    }
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
    fields.push({ key: ids[0], ids, kind, label, required: req(own) || /[âœ±*]/.test(rawLabel), options, maxLength: el.maxLength > 0 && el.maxLength < 100000 ? el.maxLength : undefined });
  }
  for (const g of btnGroups) {
    if (g.kids.some((k) => k.hasAttribute("data-tf"))) continue;
    const ids = g.kids.map(tag);
    const options = g.kids.map(txt);
    const root = questionRoot(g.kids);
    const lines = root ? (root.innerText || "").split("\n").map(clean).filter((l) => l && !options.includes(l)) : [];
    fields.push({ key: ids[0], ids, kind: "buttons", label: lines[0] || "", required: !!root && /[âœ±*]/.test(root.innerText || ""), options });
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
      if (clean(best.replace(/upload file|drag and drop here|drag and drop|accepted file types:?[a-z, ]*|attach|upload|drop files here|select files|browse|or|enter manually|dropbox|google drive|max(imum)? file size[^a-z]*/gi, "")).length > 12) break;
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
  const clean = (s) => (s || "").replace(/[âœ±*]+/g, " ").replace(/\s+/g, " ").trim();
  const bad = [];
  const seenRadio = new Set();
  for (const el of document.querySelectorAll("[data-tf]")) {
    if (el.type === "file") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const rawLabel = (el.labels && el.labels[0] ? el.labels[0].innerText : "") || "";
    const required = el.required || el.getAttribute("aria-required") === "true" || /[*âœ±]/.test(rawLabel);
    const ffl = el.closest('[data-automation-id^="formField"]')?.querySelector("label, legend");
    const label = clean(rawLabel || (ffl ? ffl.innerText : "") || el.getAttribute("aria-label") || el.name || el.id);
    if (el.getAttribute("aria-invalid") === "true") { bad.push(label + " (the page flags it)"); continue; }
    if (!required) continue;
    if (el.type === "radio") {
      if (seenRadio.has(el.name)) continue;
      seenRadio.add(el.name);
      if (![...document.querySelectorAll("input[type=radio]")].filter((o) => o.name === el.name).some((o) => o.checked)) bad.push(clean(el.name));
    } else if (el.type === "checkbox") {
      // A group of boxes ("3 / 6 / 9 / 12 months"): one ticked answers it; report the group once, not each box.
      const box = el.closest('fieldset, [data-automation-id^="formField"]');
      const group = el.name ? [...document.querySelectorAll("input[type=checkbox]")].filter((o) => o.name === el.name) : box ? [...box.querySelectorAll("input[type=checkbox]")] : [el];
      if (group.length > 1) {
        const gk = "cb:" + (el.name || (box && (box.getAttribute("data-automation-id") || box.id)) || label);
        if (seenRadio.has(gk)) continue;
        seenRadio.add(gk);
        if (!group.some((o) => o.checked)) bad.push(clean(box?.querySelector("legend, label")?.innerText || el.name || label));
      } else if (!el.checked) bad.push(label);
    }
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

const OPEN_OPTIONS = '[role="option"]:visible:not([data-automation-id="selectedItem"]), [data-automation-id="promptOption"]:visible:not([data-automation-id="selectedItem"] *), .cx-select__list-item:visible';

/**
 * Closes every open dropdown list. A Workday list left open lies over the NEXT field, so a click meant for that
 * field picks one of its options instead (that is how "Gay" and "Non-binary" got onto OLG's form). Escape, then
 * a click on the page's heading (nothing clickable there). Returns false if a list is still open: don't click then.
 */
async function closeLists(page: Page): Promise<boolean> {
  const open = page.locator(OPEN_OPTIONS);
  for (let i = 0; i < 10; i++) {
    if (!(await open.count().catch(() => 0))) return true;
    await page.keyboard.press("Escape").catch(() => null);
    if (i % 2 === 1) {
      const heading = page.locator("h1:visible, h2:visible, h3:visible").first();
      if (await heading.count()) await heading.click({ timeout: 1500, position: { x: 2, y: 2 } }).catch(() => null);
    }
    await page.waitForTimeout(250);
  }
  return !(await open.count().catch(() => 0));
}

async function comboOptions(page: Page, loc: Locator): Promise<string[] | undefined> {
  try {
    // Never the chips of what other fields hold (role=option too), and never with the last field's list still open.
    const shown = page.locator(OPEN_OPTIONS);
    if (!(await closeLists(page))) return undefined;
    await loc.click({ timeout: 2000 });
    await page.waitForTimeout(400);
    const listId = await loc.getAttribute("aria-controls").catch(() => null);
    const own = listId ? page.locator(`[id="${listId}"]`).locator('[role="option"]:visible') : shown;
    const seen = [...new Set((await own.allInnerTexts()).map((s) => s.trim()).filter(Boolean))];
    await closeLists(page);
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
  const opts = page.locator('[role="option"]:visible:not([data-automation-id="selectedItem"]), [data-automation-id="promptOption"]:visible:not([data-automation-id="selectedItem"] *), .cx-select__list-item:visible');
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

/** Words that mean the same source on different sites' "how did you hear" lists. */
const SOURCE_SYNONYMS: [RegExp, RegExp][] = [
  [/career|company (web)?site|corporate|website/i, /career|corporate web|company web|^(our |company )?web ?site$/i],
  [/linkedin/i, /linkedin/i],
  [/job board|indeed|glassdoor/i, /job board|indeed|glassdoor/i],
  [/campus|university|school|co-?op/i, /campus|university|school|co-?op/i],
  [/referr/i, /referr/i],
];

/** Picks a "how did you hear" answer from a Workday category list, going one level deeper when the pick opens one. */
async function pickSource(page: Page, loc: Locator, value: string, loose = true): Promise<boolean> {
  const field = loc.locator('xpath=ancestor::*[contains(translate(@data-automation-id,"MULTISELECT","multiselect"),"multiselect")][1]');
  const chosen = async () => (await field.locator('[data-automation-id="selectedItem"]').count().catch(() => 0)) > 0;
  // The list's options, never the "selected" pills other fields show (they also carry role=option).
  const opts = page.locator('[role="option"]:visible:not([data-automation-id="selectedItem"]), [data-automation-id="promptOption"]:visible:not([data-automation-id="selectedItem"] *)');
  const syn = SOURCE_SYNONYMS.find(([want]) => want.test(value))?.[1];
  // The previous field's list lingers open (Sexual Orientation's options showed under Gender Identity):
  // close it and wait for it to go before opening this one.
  if (!(await closeLists(page))) return false;
  await loc.click({ timeout: 3000 }).catch(() => null);
  for (let level = 0; level < 3; level++) {
    await opts.first().waitFor({ timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(400);
    const names = [...new Set((await opts.allInnerTexts().catch(() => [] as string[])).map((s) => s.trim()).filter(Boolean))];
    if (process.env.PREFILL_DEBUG) console.log(`  [multi] level ${level} for "${value}": ${JSON.stringify(names.slice(0, 20))}`);
    if (!names.length) break;
    let pick = matchOption(names, value);
    if (!pick && syn) pick = names.find((n) => syn.test(n));
    // One level down the list is the site's own names for it ("OLG.ca"): any one of them answers truthfully.
    // Only for "how did you hear": a near-enough answer is fine there, never for a question about Owen himself.
    if (loose && !pick && level > 0) pick = names.find((n) => !/^back$/i.test(n));
    if (loose && !pick) pick = names.find((n) => /^other\b/i.test(n));
    if (!pick) break;
    await opts.filter({ hasText: new RegExp(`^\\s*${pick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first().click({ timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(700);
    if (await chosen()) {
      await page.keyboard.press("Escape").catch(() => null);
      return true;
    }
  }
  await page.keyboard.press("Escape").catch(() => null);
  return chosen();
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
  // A list still open from the last field lies over this one: a click now would pick from it.
  if (!(await closeLists(page))) return false;
  await loc.click({ timeout: 3000, force: true });
  const name = await loc.evaluate((el) => `${el.id} ${(el as HTMLInputElement).labels?.[0]?.innerText ?? ""} ${el.getAttribute("aria-label") ?? ""}`).catch(() => "");
  if (/address|street/i.test(name) && /^\d+\s/.test(value)) return fillAddress(page, loc, value);
  // A button that opens a list (Workday): nothing to type into, so pick from what it shows.
  if ((await loc.evaluate((el) => el.tagName)) === "BUTTON") {
    // The forced click above can open Workday's list without wiring it to this button (a pick then doesn't take):
    // close it and open the list with a real click.
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(300);
    await loc.click({ timeout: 3000 }).catch(() => loc.click({ timeout: 3000, force: true }).catch(() => null));
    // Only the list this button opened (aria-controls), not one from the previous dropdown that's still closing.
    const listId = await loc.getAttribute("aria-controls").catch(() => null);
    const scope = listId ? page.locator(`[id="${listId}"]`) : page;
    const shown = scope.locator('[role="option"]:visible:not([data-automation-id="selectedItem"]), [data-automation-id="promptOption"]:visible:not([data-automation-id="selectedItem"] *), .cx-select__list-item:visible');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) {
        await page.keyboard.press("Escape").catch(() => null);
        await page.waitForTimeout(600);
        await loc.click({ timeout: 3000 }).catch(() => loc.click({ timeout: 3000, force: true }).catch(() => null));
      }
      await shown.first().waitFor({ timeout: 3500 }).catch(() => null);
      // The previous dropdown's list can linger for a moment (Workday): wait up to ~3 s for one that has the answer.
      let names: string[] = [];
      let pick = -1;
      for (let w = 0; w < 12 && pick < 0; w++) {
        if (w) await page.waitForTimeout(250);
        names = (await shown.allInnerTexts()).map((s) => s.trim());
        pick = names.findIndex((n) => n === matchOption(names, value));
      }
      if (pick < 0) {
        await page.keyboard.press("Escape");
        return false;
      }
      await shown.nth(pick).click({ timeout: 3000 }).catch(() => null);
      // Workday shows the choice on the button itself; make sure it took before moving on.
      for (let w = 0; w < 6; w++) {
        await page.waitForTimeout(250);
        if (norm(await loc.innerText().catch(() => "")) === norm(names[pick])) return true;
      }
    }
    return false;
  }
  // Workday multiselects keep every chip ever clicked (a lingering list once left "Heterosexual, Asexual, Gay").
  // Exactly the answer already there: done. Anything else there: clear it first, and after picking, check that
  // the field holds the answer and nothing else.
  const multi = await loc.evaluate((el) => !!el.closest('[data-automation-id="multiSelectContainer"]')).catch(() => false);
  if (multi) {
    const chips = loc.locator('xpath=ancestor::*[@data-automation-id="multiSelectContainer"][1]').locator('[data-automation-id="selectedItem"]');
    const held = (await chips.allInnerTexts().catch(() => [] as string[])).map((s) => s.trim());
    if (held.length === 1 && matchOption(held, value)) return true;
    // "How did you hear": one answer already there is a fine answer (the model words it differently each run).
    const isSource = /hear about|how did you (hear|find|learn)|source/i.test(name);
    if (isSource && held.length === 1) return true;
    for (let i = 0; i < 8 && (await chips.count().catch(() => 0)); i++) await dropChip(page, chips.first());
    const ok = await fillMultiOnce(page, loc, value, name);
    const after = (await chips.allInnerTexts().catch(() => [] as string[])).map((s) => s.trim());
    if (process.env.PREFILL_DEBUG) console.log(`  [multi] "${name.trim().slice(0, 40)}" holds ${JSON.stringify(after)}`);
    // Extra chips from a stray click: drop every one that isn't the answer.
    const keep = matchOption(after, value) ?? (after.length === 1 && ok ? after[0] : undefined);
    for (let i = after.length - 1; i >= 0; i--) if (after[i] !== keep) await dropChip(page, chips.nth(i));
    await closeLists(page);
    const final = (await chips.allInnerTexts().catch(() => [] as string[])).map((s) => s.trim());
    return final.length === 1;
  }
  return fillComboText(page, loc, value, name);
}

/** Removes one Workday chip: its own hint says "press delete to clear value"; the × is the fallback. */
async function dropChip(page: Page, chip: Locator): Promise<void> {
  const before = await chip.locator("xpath=ancestor::*[@data-automation-id='multiSelectContainer'][1]").locator('[data-automation-id="selectedItem"]').count().catch(() => 0);
  const gone = async () => (await chip.locator("xpath=ancestor::*[@data-automation-id='multiSelectContainer'][1]").locator('[data-automation-id="selectedItem"]').count().catch(() => 0)) < before;
  await chip.focus({ timeout: 2000 }).catch(() => null);
  await page.keyboard.press("Delete").catch(() => null);
  await page.waitForTimeout(350);
  if (await gone().catch(() => true)) return;
  await chip.locator('[data-automation-id="DELETE_charm"]').click({ timeout: 2000 }).catch(() => chip.locator('[data-automation-id="DELETE_charm"]').click({ force: true, timeout: 2000 }).catch(() => null));
  await page.waitForTimeout(350);
  if (await gone().catch(() => true)) return;
  await chip.click({ timeout: 2000 }).catch(() => null);
  await page.keyboard.press("Backspace").catch(() => null);
  await page.waitForTimeout(350);
}

/** One attempt at a Workday multiselect: the category walk for "how did you hear", else search then walk. */
async function fillMultiOnce(page: Page, loc: Locator, value: string, name: string): Promise<boolean> {
  if (/hear about|how did you (hear|find|learn)|source/i.test(name)) {
    if (await pickSource(page, loc, value)) return true;
  }
  await loc.fill("").catch(() => null);
  await loc.pressSequentially(value.slice(0, 40), { delay: 15, timeout: 6000 }).catch(() => null);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  if (await loc.evaluate((el) => !!el.closest('[data-automation-id="multiSelectContainer"]')?.querySelector('[data-automation-id="selectedItem"]'))) return true;
  await loc.fill("").catch(() => null);
  await page.keyboard.press("Escape").catch(() => null);
  return pickSource(page, loc, value, false);
}

/** Type-to-search comboboxes (Greenhouse's react-select, a city or school search, Oracle). */
async function fillComboText(page: Page, loc: Locator, value: string, name: string): Promise<boolean> {
  void name;
  await loc.fill("").catch(() => null);
  await loc.pressSequentially(value.slice(0, 40), { delay: 15, timeout: 6000 }).catch(() => null);
  if (await loc.evaluate((el) => !!el.closest('[data-automation-id*="multiselect" i]'))) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    if (await loc.evaluate((el) => !!el.closest('[data-automation-id*="multiselect" i]')?.querySelector('[data-automation-id="selectedItem"]'))) return true;
    // The search found nothing under that wording ("Male" on a list that says "Man"): walk the list itself,
    // and only call it done when this field shows the pick.
    await loc.fill("").catch(() => null);
    await page.keyboard.press("Escape").catch(() => null);
    return pickSource(page, loc, value, false);
  }
  // Never the "selected" chips other fields show: they carry role=option too.
  const opts = page.locator('[role="option"]:visible:not([data-automation-id="selectedItem"]), [data-automation-id="promptOption"]:visible:not([data-automation-id="selectedItem"] *), .cx-select__list-item:visible');
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
              const box = at(f.options.indexOf(pick));
              await box.evaluate((el) => !(el as HTMLInputElement).checked && (el as HTMLElement).click());
              // Some React boxes (Workday "Language Preference") ignore a synthetic click: retry with a real one.
              if (!(await box.isChecked().catch(() => true))) await box.check({ force: true, timeout: 3000 }).catch(() => null);
              any = (await box.isChecked().catch(() => true)) || any;
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

/** The text a checkbox is labelled with: aria-labelledby, label[for], a wrapping label, else its row. Runs in the page. */
const CHECKBOX_LABEL = (el: Element): string => {
  const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  let t = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
  if (!t.trim() && el.id) t = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent || "";
  if (!t.trim()) t = el.closest("label")?.textContent || el.getAttribute("aria-label") || "";
  if (!t.trim()) t = el.parentElement?.parentElement?.textContent || "";
  return t.replace(/\s+/g, " ").trim().slice(0, 400);
};

/**
 * A box Owen would tick on any application: terms, privacy, data processing, a background-check consent,
 * or "the information I gave is true". Not marketing / SMS / job-alert opt-ins, and not a claim about
 * himself that the profile has to answer.
 */
export function isConsent(label: string): boolean {
  if (!label) return false;
  if (/\b(newsletter|marketing|promotional|text messages?|sms|job alerts?|talent (community|network)|future (opportunities|openings|roles)|keep me (informed|updated))\b/i.test(label)) return false;
  if (/\b(i (am|have|hold|possess|will be)|i'?m (legally|currently|eligible|authorized)|years? of experience|degree in)\b/i.test(label) && !/\b(true|accurate|complete|correct|consent|agree|acknowledge)\b/i.test(label)) return false;
  return /\b(terms|privacy|policy|consent|agree|acknowledge|authori[sz]e|background (check|screening)|data (processing|protection)|personal (data|information)|true|accurate|complete|correct|certify|attest|gdpr)\b/i.test(label);
}

/**
 * The date a question asks for, as MM/DD/YYYY: a start / availability date is the first Monday of the Summer 2027
 * term (May 3, 2027); "today's date" or a signature date is today. Anything else: null (Owen answers it).
 */
export function dateAnswer(label: string, today = new Date(), grad = profileGrad()): string | null {
  // Graduation (CAE: "When are you expected to graduate?"): the profile's YYYY-MM, as the 1st of that month.
  if (/graduat|diplôm|completion of (your )?(degree|studies|program)/i.test(label)) {
    const m = grad?.match(/^(\d{4})-(\d{2})/);
    return m ? `${m[2]}/01/${m[1]}` : null;
  }
  if (/\b(start|begin|commenc|available|availability|disponib|earliest|join)/i.test(label)) return "05/03/2027";
  if (/\b(today|signature|signed|date of (application|submission))\b|aujourd/i.test(label) || /^\s*date\s*\*?\s*$/i.test(label)) {
    return `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
  }
  return null;
}

function profileGrad(): string | undefined {
  try {
    return JSON.parse(readFileSync(path.join(PRIVATE_DIR, "profile.json"), "utf8")).graduationDate;
  } catch {
    return undefined;
  }
}

/** Workday's MM/DD/YYYY question boxes (spinbuttons the field scan doesn't see): fill the ones dateAnswer knows. */
async function fillWorkdayDates(page: Page) {
  const boxes = page.locator('[data-automation-id="dateInputWrapper"]:visible');
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    const month = box.locator('[data-automation-id="dateSectionMonth-display"]');
    if (!(await month.count()) || !/^MM$/i.test((await month.innerText().catch(() => "")).trim())) continue;
    // Experience / education dates belong to workday.ts.
    const label = ((await box.evaluate((el) => (el.closest("fieldset")?.querySelector("legend") as HTMLElement | null)?.innerText ?? "").catch(() => "")) as string).trim();
    const v = dateAnswer(label);
    if (process.env.PREFILL_DEBUG) console.log(`  [date] "${label.slice(0, 50)}" <- ${v ?? "(unknown, left)"}`);
    if (!v) continue;
    await month.click({ timeout: 3000 }).catch(() => month.click({ force: true, timeout: 3000 }).catch(() => null));
    await page.keyboard.type(v.replace(/\//g, ""), { delay: 60 });
    await page.waitForTimeout(400);
  }
}

/**
 * Conflict-of-interest / disclosure questions (IP ownership, outside job, board seats, relatives at the company,
 * government officials, non-competes). Owen's rule (2026-11-04): answer No unless he said otherwise; a saved
 * answer in answers.json reaches the model first, so this only covers questions nobody answered.
 */
export function isDisclosure(label: string): boolean {
  return /\b(intellectual property|patents?|trademarks?|copyrights?|secondary (employment|job|work)|outside (employment|business|activit)|other employment|non-[a-z]+ (employment|business)|business activit|board of (directors|advisors)|advisory board|governing body|conflicts? of interest|relatives?|family members?|related to (an?|any) (employee|director|officer)|government (official|employee|entity)|public official|foreign official|politically exposed|non-?compete|non-?solicit|restrictive covenant|debarred|excluded from|(citizen|national|resident) (or dual citizen )?of (cuba|iran|north korea|syria)|sanctioned (countr|region))\b/i.test(label);
}

/**
 * "How did you hear about us?" never goes to Owen: the company's careers site if the list has one, else a job
 * posting site he'd plausibly have used (LinkedIn), else "Other". AtkinsRéalis 2026-11-04 had no careers option.
 */
export function heardAboutPick(label: string, options?: string[]): string | null {
  if (!/how did you (first )?hear|hear about (us|this)|source of (this )?(application|referral)|where did you (find|see|learn)/i.test(label)) return null;
  const opts = (options ?? []).filter((o) => o.trim() && !/^select one$/i.test(o.trim()));
  if (!opts.length) return null;
  for (const re of [/career(s)? (site|page|website)|company (web)?site|corporate (web)?site|our website|company career|\bwebsite\b|careers?\b/i, /linkedin job/i, /linkedin/i, /job board|online job|internet|indeed/i, /^other\b/i]) {
    const hit = opts.find((o) => re.test(o));
    if (hit) return hit;
  }
  return null;
}

/** The "No" option of a yes/no disclosure field, or null if it has none. */
export function disclosureNo(label: string, options?: string[]): string | null {
  if (!isDisclosure(label)) return null;
  if (!options?.length) return null;
  return options.find((o) => /^\s*no\b/i.test(o)) ?? null;
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
  // A real click first: Workday ignores forced clicks on some buttons (Lumentum's "Sign in with email" was
  // pressed 8 times without opening). Forced only when something covers it.
  const real = await loc.click({ timeout: 2500 }).then(() => true).catch(() => false);
  if (!real) await loc.click({ timeout: 4000, force: true }).catch(() => null);
  if (process.env.PREFILL_DEBUG) console.log("  [click]", re.source.slice(0, 40), real ? "real" : "forced", (await loc.evaluate((e) => e.outerHTML.slice(0, 160)).catch(() => "(gone)")));
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
  // Workday keeps the sign-in AND create-account forms in the page together: fill only the one whose button we press.
  const go = page.locator(`[data-automation-id="${creating ? "createAccountSubmitButton" : "signInSubmitButton"}"]`).first();
  const scope = (await go.count()) ? go.locator('xpath=ancestor::*[.//input[@type="password"]][1]') : page.locator("body");
  const emailBox = scope.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[data-automation-id="email"]:visible').first();
  // Typed key by key: Workday's sign-in ignores a value set in one go (its button then sends nothing).
  const type = async (box: Locator, v: string) => {
    await box.click({ timeout: 4000 }).catch(() => null);
    await box.fill("", { timeout: 4000 }).catch(() => null);
    await box.pressSequentially(v, { delay: 25, timeout: 15_000 });
    await box.dispatchEvent("blur").catch(() => null);
  };
  await type(await emailBox.count() ? emailBox : scope.locator('input[type="text"]:visible').first(), login.email);
  const pws = scope.locator('input[type="password"]:visible');
  for (let i = 0; i < (await pws.count()); i++) await type(pws.nth(i), login.password);
  if (creating) {
    // The terms box: Workday draws its own box over the input, and a forced check() changes the input without
    // Workday noticing, so the account was never made (Aptiv, Siemens Healthineers 2026-11-04). Click its label
    // (a real click), then the input itself; force only as the last resort.
    const boxes = scope.locator('input[type="checkbox"]');
    for (let i = 0; i < (await boxes.count()); i++) {
      const box = boxes.nth(i);
      const id = await box.getAttribute("id").catch(() => null);
      const label = id ? page.locator(`label[for="${id}"]`).first() : null;
      if (label && (await label.count())) await label.click({ timeout: 2000 }).catch(() => null);
      if (!(await box.isChecked().catch(() => false))) await box.click({ timeout: 2000 }).catch(() => null);
      if (!(await box.isChecked().catch(() => false))) await box.check({ timeout: 2000, force: true }).catch(() => null);
    }
  }
  if (await go.count()) await go.click({ timeout: 4000, force: true }).catch(() => null);
  else await clickText(page, creating ? /^create account$/i : /^sign in$/i);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(2500);
  // Workday draws an invisible "click_filter" over its buttons, so a click on the button itself can do nothing.
  // Still on the same screen after a moment? Press Enter in the password box, then click the overlay, then a real mouse click.
  const posts: string[] = [];
  if (process.env.PREFILL_DEBUG) {
    page.on("request", (r) => { if (!/\.(png|svg|css|woff2?|js)(\?|$)/.test(r.url())) posts.push(`${r.method()} ${r.url().replace(/^https:\/\/[^/]+/, "").slice(0, 70)}`); });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") posts.push(`console ${m.text().slice(0, 100)}`); });
  }
  const stillHere = async () => (await page.locator('input[type="password"]:visible').count()) > 0 && !(await page.locator('[data-automation-id="errorMessage"]:visible').count());
  const tries: (() => Promise<unknown>)[] = [
    () => pws.last().press("Enter", { timeout: 3000 }),
    () => go.locator('xpath=..').locator('[data-automation-id="click_filter"]').first().click({ timeout: 3000 }),
    // Only this screen's own button: on the create screen, "Already have an account? Sign In" has a "Sign In"
    // overlay too, and clicking it flipped Varian (Siemens Healthineers) to an empty sign-in form (2026-11-05).
    () => page.locator(`[data-automation-id="click_filter"][aria-label="${creating ? "Create Account" : "Sign In"}" i]:visible`).first().click({ timeout: 3000 }),
    async () => {
      const box = await go.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    },
  ];
  for (const attempt of tries) {
    await page.waitForTimeout(2500);
    if (!(await stillHere())) break;
    await attempt().catch(() => null);
  }
  // Workday can take several more seconds to leave the sign-in screen: give it up to 12 s before judging.
  for (let i = 0; i < 12 && (await page.locator('input[type="password"]:visible').count()); i++) {
    if (/(incorrect|invalid|did not match|wrong|already (exists|in use)|not (been )?(verified|activated)|verify)/i.test(await page.locator('[data-automation-id="errorMessage"], [role="alert"]').allInnerTexts().then((t) => t.join(" ")).catch(() => ""))) break;
    await page.waitForTimeout(1000);
  }
  const body = await page.locator("body").innerText().catch(() => "");
  // The account is saved only once Workday took it: the form went away, or it says a verification email is on its
  // way. A save before that (as it used to be) left a password for an account that doesn't exist, and every later
  // run tried it, failed, and asked for a reset email that never comes for an unknown address.
  // Aptiv and Siemens Healthineers flip straight to the Sign In screen once the account is made (no message): that counts
  // too. Before, the password was dropped there, and every later run hit "account exists" with no password (2026-11-06).
  const flipped = creating && (await page.locator('[data-automation-id="signInSubmitButton"]:visible').count()) > 0 && !(await page.locator('[data-automation-id="verifyPassword"]:visible').count()) && !(await page.locator('[data-automation-id="errorMessage"]:visible').count());
  const created = creating && (flipped || !(await page.locator('input[type="password"]:visible').count()) || /verify your (account|email)|verification (link|email)|email has been sent|check your email|confirm your email/i.test(body));
  if (created) saveAccount({ site: host, email: login.email, password: login.password, createdAt: new Date().toISOString() });
  if (flipped) return null; // the loop signs in with the saved account next
  if (process.env.PREFILL_DEBUG) {
    console.log(`  [signin] ${creating ? "create" : "sign in"} ${host} -> pw ${await page.locator('input[type="password"]:visible').count()} | go ${await go.count()} | scope inputs ${await scope.locator("input:visible").count()} | email box "${(await emailBox.inputValue().catch(() => "?")).replace(/@.*/, "@…")}" | alerts ${JSON.stringify(await page.locator('[data-automation-id="errorMessage"], [role="alert"]').allInnerTexts().catch(() => []))} | posts ${JSON.stringify(posts.slice(-8))} | pwlen ${(await pws.first().inputValue().catch(() => "")).length}/${login.password.length}`);
    await page.screenshot({ path: path.join(PRIVATE_DIR, "nightly", `signin-${host}.png`) }).catch(() => null);
  }
  if (await page.locator('input[type="password"]:visible').count()) {
    if (/already (exists|in use|registered|associated)|account with this email/i.test(body)) {
      // An account Owen (or an earlier run) made, with a password we don't have: reset it by email.
      return await resetPassword(page, host, login.email, touch);
    }
    if (/verify your (account|email)|verification (link|email)|email has been sent|check your email|confirm your email|not (been )?(verified|activated)/i.test(body)) {
      // Workday's links last 24 hours, and the account may predate a password reset: take the newest from the last day.
      return await verifyByEmail(page, host, new Date(Date.now() - 24 * 3600_000));
    }
    if (!creating && /(incorrect|invalid|did not match|wrong|not found|locked)/i.test(body)) return await resetPassword(page, host, login.email, touch);
    // No error at all: the page itself is stuck (Workday's sign-in page after an activation link doesn't answer
    // its button). Load it fresh once and let the caller sign in again.
    if (!mailTried.has(`reload:${host}`)) {
      mailTried.add(`reload:${host}`);
      const back = new URL(page.url()).searchParams.get("redirect");
      await page.goto(back ? new URL(back, page.url()).toString() : page.url(), { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(2000);
      return null;
    }
    return `Couldn't sign in on ${host} (${(body.match(/(incorrect|invalid|did not match|not found)[^.\n]{0,60}/i) ?? ["the form is still showing"])[0]}). Sign in by hand, then hit Finish.`;
  }
  return null;
}

/** Hosts this process already verified or reset, so a bad link can't loop. */
const mailTried = new Set<string>();

/** Opens the "verify your candidate account" link from Owen's inbox (same site only), then carries on to sign in. */
async function verifyByEmail(page: Page, host: string, since: Date): Promise<string | null> {
  const key = `verify:${host}`;
  if (mailTried.has(key)) return `Made an account on ${host}, but its verification link didn't take. Click the link in your email, then hit Finish.`;
  mailTried.add(key);
  const link = await waitForMailLink(host, "verify", since, process.env.PREFILL_DEBUG ? console.log : undefined);
  if (!link) return `Made an account on ${host}. Its verification email hadn't arrived after 4 minutes: click the link in it, then hit Finish.`;
  // Open it in a tab of its own: the page Workday lands on after activating froze the tab it was opened in
  // (NAV Canada, 2026-11-04), so the application's own tab only reloads once the account is active.
  const side = await page.context().newPage();
  await side.goto(link, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  for (let i = 0; i < 20; i++) {
    if (/activated|verified|confirmed|sign in/i.test(await side.locator("body").innerText({ timeout: 2000 }).catch(() => ""))) break;
    await side.waitForTimeout(500);
  }
  await side.close({ runBeforeUnload: false }).catch(() => null);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
  await page.waitForTimeout(2000);
  return null;
}

/** Workday's "Forgot your password?": reset by the emailed link, save the new password, then carry on to sign in. */
async function resetPassword(page: Page, host: string, email: string, touch: () => void): Promise<string | null> {
  const key = `reset:${host}`;
  if (mailTried.has(key)) return `Couldn't sign in on ${host}, even after resetting the password. Sign in by hand, then hit Finish.`;
  mailTried.add(key);
  touch();
  // The reset lives on the sign-in screen.
  if (!(await page.locator('[data-automation-id="signInSubmitButton"]:visible').count())) await clickText(page, /^sign in$/i);
  const forgot = page.locator('[data-automation-id="forgotPasswordLink"]:visible').first();
  if (await forgot.count()) await forgot.click({ timeout: 4000 }).catch(() => null);
  else if (!(await clickText(page, /forgot (your )?password/i))) return `Couldn't sign in on ${host} and found no "Forgot password" link. Sign in by hand, then hit Finish.`;
  await page.waitForTimeout(2000);
  const box = page.locator('input[type="email"]:visible, input[data-automation-id="email"]:visible, input[type="text"]:visible').first();
  await box.fill(email, { timeout: 4000 }).catch(() => null);
  const since = new Date(Date.now() - 60_000);
  const send = page.locator('[data-automation-id="resetPasswordSubmitButton"]:visible, [data-automation-id="forgotPasswordSubmitButton"]:visible').first();
  if (await send.count()) await send.click({ timeout: 4000, force: true }).catch(() => null);
  else await clickText(page, /^(submit|reset password|send|continue|next)$/i);
  await page.waitForTimeout(2500);
  const link = await waitForMailLink(host, "reset", since, process.env.PREFILL_DEBUG ? console.log : undefined);
  if (!link) return `Couldn't sign in on ${host}; asked for a password reset but the email hadn't arrived after 4 minutes. Sign in by hand, then hit Finish.`;
  // In a tab of its own, like the activation link, so the application's tab can't be left frozen.
  const side = await page.context().newPage();
  await side.goto(link, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await side.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
  await side.waitForTimeout(2500);
  const pws = side.locator('input[type="password"]:visible');
  if (!(await pws.count())) {
    await side.close({ runBeforeUnload: false }).catch(() => null);
    return `Opened ${host}'s password reset link but no new-password boxes showed. Sign in by hand, then hit Finish.`;
  }
  const password = `Ti${randomBytes(6).toString("hex")}#9a`;
  for (let i = 0; i < (await pws.count()); i++) {
    await pws.nth(i).click({ timeout: 4000 }).catch(() => null);
    await pws.nth(i).pressSequentially(password, { delay: 25, timeout: 15_000 });
  }
  const save = side.locator('[data-automation-id*="ubmit"]:visible, button[type="submit"]:visible').first();
  if (await save.count()) await save.click({ timeout: 4000, force: true }).catch(() => null);
  else await clickText(side, /^(submit|reset password|change password|save|continue)$/i);
  await side.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
  await side.waitForTimeout(3000);
  await side.close({ runBeforeUnload: false }).catch(() => null);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(2500);
  saveAccount({ site: host, email, password, createdAt: readAccounts().find((a) => a.site === host)?.createdAt ?? new Date().toISOString() });
  if (process.env.PREFILL_DEBUG) console.log(`  [mail] reset ${host}: new password set and saved`);
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
  // Workday alone can take Apply, Apply Manually, Create Account, sign-up, then sign-in: leave room for all of them.
  for (let i = 0; i < 10; i++) {
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
      if (/email has been sent|verify your account|not (been )?(verified|activated)/i.test(await page.locator("body").innerText().catch(() => ""))) {
        touch();
        const host = new URL(page.url()).hostname;
        const why = await verifyByEmail(page, host, new Date(Date.now() - 24 * 3600_000));
        if (why) return { stuck: why };
        continue;
      }
      const why = await signIn(page, email, touch);
      if (why) return { stuck: why };
      continue;
    }
    // Workday sometimes shows "Something went wrong. Please refresh the page": refresh, as it says. Before the
    // step checks below: its error page keeps the "step 1 of 6" bar, and CAE was taken for a form with no fields (2026-11-07).
    if (/something went wrong|please refresh the page/i.test(await page.locator("body").innerText().catch(() => ""))) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(3000);
      continue;
    }
    // A step that IS the sign-in (Trimble: "current step 1 of 6 | Create Account/Sign In") whose password boxes
    // draw a moment later: wait for them. Read as the form, it sent "Password" to Owen as a question.
    const stepText = await page.locator("body").innerText().catch(() => "");
    const signInStep = /current step \d+ of \d+\s*\n?\s*(create account|sign in)/i.test(stepText);
    if (signInStep && !(await page.locator('input[type="password"]:visible').count())) {
      // Lumentum, CAE, MLSE: the step first offers Apple / Google / LinkedIn / "Sign in with email"; the boxes only come after that click.
      if (!(await clickText(page, /^sign in with email$/i))) await page.waitForTimeout(1000);
      continue;
    }
    const inputs = await page.locator('input:visible:not([type="hidden"]):not([type="search"]), textarea:visible, select:visible, button[aria-haspopup="listbox"]:visible').count();
    if ((await page.locator('input[type="file"]').count()) || inputs >= 3) return {};
    // Already inside a multi-step application (Workday's "current step 5 of 5 Review" has no boxes at all).
    if (/current step \d+ of \d+/i.test(stepText) && !signInStep && !(await page.locator('input[type="password"]:visible').count())) return {};
    // Workday and the like draw the page a few seconds after it loads: keep looking before calling it stuck.
    let moved = false;
    for (let wait = 0; wait < 20 && !moved; wait++) {
      if (wait) await page.waitForTimeout(500);
      const fields = page.locator('input:visible:not([type="hidden"]):not([type="search"]), textarea:visible, select:visible, button[aria-haspopup="listbox"]:visible');
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
  // The last step (often making the account) may have been the one that opened the form: look once more.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
  for (let wait = 0; wait < 10; wait++) {
    if (!(await page.locator('input[type="password"]:visible').count())) {
      const inputs = await page.locator('input:visible:not([type="hidden"]):not([type="search"]), textarea:visible, select:visible, button[aria-haspopup="listbox"]:visible').count();
      if ((await page.locator('input[type="file"]').count()) || inputs >= 3) return {};
    }
    await page.waitForTimeout(500);
  }
  return { stuck: "couldn't get past the landing pages" };
}

const CLOSED = /no longer (accepting|available|open)|position (has been |is )?(filled|closed)|job (not found|has expired)|this job (is|has been) (closed|removed)|page (you(['’]re| are) looking for )?(not found|doesn['’]t exist|does not exist)|posting (is )?(closed|no longer)/i;

export async function scriptFill(
  job: Job,
  o: { resume: string; coverLetter?: string; profile: string; experience: string; model: string; submit?: { resumeSize: number }; cwd: string; waitForYou?: (why: string) => void },
): Promise<ScriptResult> {
  let ats = atsOf(job.applyUrl);
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
  let embeddedById = false;
  let touched = false; // after this the tab holds Owen's data; falling back would leave a half-filled tab behind
  const give = async (why: string): Promise<ScriptResult> => {
    if (!touched) await page.close().catch(() => null);
    return { fallback: true, why };
  };

  try {
    let t = Date.now();
    // A reused tab already inside the application stays where it is (going back to the posting can restart it).
    // It's reloaded first: a tab left for hours keeps drawing the form after the site's session expired, and
    // Submit on it fails on the server ("Something went wrong", Corpay 2026-11-04). The reload shows the sign-in
    // if the session is gone, and reachForm signs in again; Workday keeps the saved pages.
    if (reused && /apply|application|candidate|section/i.test(page.url())) {
      await page.bringToFront().catch(() => null);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
      // Workday draws the form seconds after "loaded": wait for the step bar, a sign-in or real inputs.
      for (let w = 0; w < 40; w++) {
        const drawn = await page.evaluate(() => /current step \d+ of \d+/i.test(document.body.innerText) || !!document.querySelector('input[type="password"]') || document.querySelectorAll("input:not([type=hidden]), textarea, button[aria-haspopup=listbox]").length >= 3).catch(() => false);
        if (drawn) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1500);
    } else {
      // Workday pages can be slow to report "loaded" though they've drawn: a timeout alone isn't a failure.
      const target = ats ? formUrl(ats, job.applyUrl) : job.applyUrl;
      const ok = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 }).then(() => true).catch(() => false);
      if (!ok && !(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""))) await page.goto(target, { waitUntil: "commit", timeout: 45_000 });
    }
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
    // An in-person 8+ month placement whose length only shows in the posting's own title (SOTI's Workday titles:
    // "Software Developer Intern - Server (May 2027 - 12 Months)"). Owen can't leave school for it: skip.
    const pageTitle = await page.title().catch(() => "");
    if (longInPerson(job.region ?? null, pageTitle)) {
      if (!reused) await page.close().catch(() => null);
      return { r: { state: "needs_you", note: `Skipped: the posting is an in-person placement longer than 4 months ("${pageTitle.slice(0, 90)}").`, url: job.applyUrl }, timing: timing(), costUsd: 0 };
    }
    // The term can live only in the title too (Geotab: "... (Winter/January 2027, 4 Months)"; the form body never says).
    const titleTerm = job.termConfirmed ? null : offTermTitle(pageTitle);
    if (titleTerm) {
      if (!reused) await page.close().catch(() => null);
      return { r: { state: "needs_you", note: `Skipped: the posting's title says ${titleTerm}, not Summer 2027 ("${pageTitle.slice(0, 90)}").`, url: job.applyUrl }, timing: timing(), costUsd: 0 };
    }
    if (ats === "greenhouse") {
      // A closed Greenhouse posting bounces to the company's board with ?error=true.
      if (/greenhouse\.io\/[^/]+\/?\?error=true/i.test(page.url())) return { r: { state: "failed", closed: true, note: "Greenhouse says the posting is closed (it sends the link to the job board).", url: page.url() }, timing: timing(), costUsd: 0 };
      // Some companies send Greenhouse links to their own careers page, with the form in a frame the script
      // can't fill (Lyft): open Greenhouse's own copy of the form instead.
      const m = job.applyUrl.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
      if (m && !/greenhouse\.io/i.test(new URL(page.url()).hostname)) {
        embeddedById = true;
        await page.goto(`https://job-boards.greenhouse.io/embed/job_app?for=${m[1]}&token=${m[2]}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
      }
    }
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
      // "The page you are looking for doesn't exist" (Workday's taken-down posting) is a closed job, not a stuck one.
      const bodyNow = await page.locator("body").innerText().catch(() => "");
      if (CLOSED.test(bodyNow)) return { r: { state: "failed", closed: true, note: "The employer's page says the posting no longer exists.", url: page.url() }, timing: timing(), costUsd: 0 };
      if (!touched) return await give(gate.stuck);
      return { r: { state: "needs_you", note: gate.stuck, url: page.url() }, timing: timing(), costUsd: 0 };
    }

    let ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
    const firstText = ex.text;
    if (!ex.fields.length && CLOSED.test(ex.text)) {
      return { r: { state: "failed", closed: true, note: "The employer's form says the posting is closed.", url: page.url() }, timing: timing(), costUsd: 0 };
    }
    // A step page with no boxes (Workday's Review, or a page already done) is still the form: carry on to its buttons.
    const midApplication = /current step \d+ of \d+/i.test(ex.text);
    if (ex.fields.length < 3 && !ex.files.length && !midApplication) return await give(`couldn't read the form (${ex.fields.length} fields)`);
    if (/captcha|verify you are human|are you a robot/i.test(ex.text.slice(0, 2000)) && ex.fields.length < 5) return await give("a human check is in the way");

    const saved = readAnswerBank();
    const savedJson = saved.length ? JSON.stringify(saved.map(({ q, a }) => ({ q, a }))) : "none yet";
    const savedFor = (label: string, options?: string[]) => savedAnswerFor(label, options, saved);
    let costUsd = 0;
    let resume: ReportedResume | undefined;
    let uploaded = false;
    const expected = statSync(o.resume).size;
    const questions: PendingQuestion[] = [];
    const unfilledAll: string[] = [];
    const consented: string[] = [];
    const infoNotes: string[] = [];
    const saidNo: string[] = [];
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
    let sameStep = 0;
    const retried = new Set<string>();
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
      // Workday's header search box is always there, so the waits can end before the questions are drawn
      // (Revvity 2026-11-04: read 0 fields after a slow save, clicked Next, 5 required questions left empty;
      // SOTI: 0 fields on the first page right after sign-in). A page that says it has required fields but
      // showed none: read it again until they appear.
      // A file box doesn't count: the previous page's hidden resume input stays in Workday's DOM, and that stopped
      // the wait on Trimble's questions page (read as empty, every question left blank, 2026-11-05).
      // A page still saying "Loading" (MLSE 2026-11-07, after a "Something went wrong" reload) gets the same wait.
      for (let i = 0; i < 40 && !ex.fields.filter((f) => f.label).length; i++) {
        const body = await page.locator("body").innerText().catch(() => "");
        const loading = /(^|\n)\s*Loading\s*(\n|$)/.test(body);
        if (!loading && (!/indicates a required field/i.test(body) || /current step (\d+) of \1\b/i.test(body))) break;
        await page.waitForTimeout(500);
        ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
      }
      // Workday's My Experience draws its resume box last (Lumentum 2026-11-06: read before it showed, no resume sent).
      for (let i = 0; i < 20 && !uploaded && !ex.files.length && /current step \d+ of \d+\s*\n?\s*my experience/i.test(await page.locator("body").innerText().catch(() => "")); i++) {
        await page.waitForTimeout(500);
        ex = JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted;
      }
      // Files first: the sites parse the resume and may fill fields, which the answers below then overwrite.
      t = Date.now();
      touched = true;
      const resumeInput = ex.files.find((f) => isResumeField(f.label)) ?? (ex.files.length === 1 && !isTranscriptField(ex.files[0].label) && !isPortfolioField(ex.files[0].label) ? ex.files[0] : undefined);
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
      const portfolioInput = existsSync(PORTFOLIO) ? ex.files.find((f) => isPortfolioField(f.label)) : undefined;
      if (portfolioInput && (await empty(portfolioInput.id))) {
        await page.locator(`[data-tf="${portfolioInput.id}"]`).setInputFiles(PORTFOLIO);
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
        // "Filled with the closest match, check it" is news, not a blank: it doesn't hold the application back.
        for (const n of wd.notes) (/check it\.?$/i.test(n) ? infoNotes : emptyAll).push(n);
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
        let limitHit = "";
        for (let attempt = 0; attempt < 3 && !reply; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 15_000 * attempt)); // the model call fails now and then (RSM, Semtech, Aptiv 2026-11-06); a pause usually clears it
          const run = await runClaude({ cwd: o.cwd, prompt, allowedTools: [], model: o.model, extraArgs: ["--tools", '""', "--strict-mcp-config"], timeoutMs: 4 * 60_000 });
          costUsd += run.costUsd;
          if (process.env.PREFILL_DEBUG && !(run.ok && parseFillReply(run.result))) console.log(`  [answers] attempt ${attempt} failed: ok=${run.ok} err=${String(run.error ?? "").slice(0, 300)} tail=${JSON.stringify(String(run.result ?? "").slice(-300))} prompt=${prompt.length} chars`);
          reply = run.ok ? parseFillReply(run.result) : null;
          // The 5-hour limit is what "answers couldn't be generated" really was (2026-11-06): no point retrying.
          const lim = `${run.error ?? ""} ${run.ok ? "" : run.result ?? ""}`.match(/hit your [^.\n]*limit[^\n]*/i);
          if (!reply && lim) { limitHit = lim[0].slice(0, 80); break; }
        }
        if (!reply && limitHit) return { r: { state: "needs_you", note: `Paused: Claude's usage limit ran out (${limitHit}). Nothing is wrong with this job; run it again after the reset.`, url: page.url() }, timing: timing(), costUsd };
        if (!reply) return { r: { state: "needs_you", note: `${step ? `Filled through page ${step}. ` : "Resume attached, but "}the answers couldn't be generated. Fill the rest by hand.`, url: page.url() }, timing: timing(), costUsd };
      } else reply = { answers: {}, ask: [] };
      lap(`answers${step || ""}`, t);
      // Disclosure questions nobody answered get "No" (Owen's rule), instead of stopping the job.
      for (const f of fields) {
        const v = reply.answers[f.key];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) continue;
        // A saved answer to this exact question wins even when the model held back (Verkada's GPA, saved as N/A, went to Owen 3 times).
        const saved = f.required || reply.ask.includes(f.key) ? savedFor(f.label, f.options) : null;
        if (saved) {
          reply.answers[f.key] = saved;
          reply.ask = reply.ask.filter((k) => k !== f.key);
          continue;
        }
        // Sponsorship on a Canadian job: Owen is a Canadian citizen, so No (Astera Labs asked "at any time in the
        // future" with no country and the model held back). U.S. jobs stay with the model and the profile's rule.
        if (job.region === "canada" && /sponsor/i.test(f.label) && !/united states|u\.s\.|\busa?\b|america/i.test(f.label)) {
          const no = f.options?.find((o) => /^\s*no\b/i.test(o));
          if (no) {
            reply.answers[f.key] = no;
            reply.ask = reply.ask.filter((k) => k !== f.key);
            continue;
          }
        }
        // Voluntary self-identification the profile doesn't cover never goes to Owen: the decline option (MLSE asked about gender assigned at birth).
        if (selfId(f.label) && f.options?.length) {
          const decline = matchOption(f.options, "I don't wish to answer");
          if (decline) {
            reply.answers[f.key] = decline;
            reply.ask = reply.ask.filter((k) => k !== f.key);
            continue;
          }
        }
        const heard = heardAboutPick(f.label, f.options);
        if (heard) {
          reply.answers[f.key] = heard;
          reply.ask = reply.ask.filter((k) => k !== f.key);
          continue;
        }
        const no = disclosureNo(f.label, f.options);
        if (!no) continue;
        reply.answers[f.key] = no;
        reply.ask = reply.ask.filter((k) => k !== f.key);
        saidNo.push(f.label.replace(/^\d+\)\.?\s*/, "").slice(0, 60));
      }

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
        // Country goes first: Workday redraws the whole form when it changes and wipes everything typed before it
        // (Teledyne 2026-11-04: names, address and phone all came back empty).
        const isCountry = (f: ScriptField) => /^country\b/i.test(f.label) && !/phone|code|citizenship|residence/i.test(f.label);
        const order = [...fields.filter(isCountry), ...fields.filter((f) => !isCountry(f))];
        for (const f of order) {
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
        // Anything a later answer wiped (a redraw after a dropdown pick): type it again, once.
        await page.waitForTimeout(800);
        const again = (JSON.parse((await page.evaluate(EXTRACT)) as string) as Extracted).fields;
        for (const f of order) {
          const v = answered[f.label];
          // Checkbox groups too (TMX "Language Preference" 2026-11-07: ticked, then a redraw cleared it). Re-ticking is a no-op when still checked.
          const box = f.kind === "checkbox" && !!f.options;
          if (!v || (typeof v !== "string" && !(box && Array.isArray(v))) || (!box && !["text", "textarea", "email", "tel"].includes(f.kind))) continue;
          const m = again.find((x) => x.label === f.label && x.kind === f.kind);
          if (!m) continue;
          if (!box && (await page.locator(`[data-tf="${m.ids[0]}"]`).inputValue().catch(() => null)) !== "") continue;
          f.ids = m.ids;
          f.key = m.key;
          const ok = await applyAnswer(page, f, v);
          if (process.env.PREFILL_DEBUG) console.log(`  [refill] ${ok ? "ok " : "FAIL"} "${f.label.slice(0, 50)}"`);
        }
        await fillWorkdayDates(page);
      });
      lap(`fill${step || ""}`, t);
      // Required consent boxes (terms, privacy) are often drawn as invisible inputs the field scan skips.
      // Only boxes that are consent or "my answers are true" get ticked: never marketing / SMS opt-ins, and
      // never a factual claim ("I hold a degree", "I am authorized"), which the profile answers instead.
      await inFront(page, async () => {
        const boxes = page.locator('input[type="checkbox"][aria-required="true"]:not(:checked)');
        for (let i = 0; i < (await boxes.count()); i++) {
          const box = boxes.nth(i);
          const label = (await box.evaluate(CHECKBOX_LABEL).catch(() => "")) as string;
          if (!isConsent(label)) {
            if (process.env.PREFILL_DEBUG) console.log(`  [consent] skipped "${label.slice(0, 80)}"`);
            continue;
          }
          await box.click({ force: true, timeout: 2000 }).catch(() => null);
          if (!(await box.isChecked().catch(() => false))) await box.evaluate((el) => (el as HTMLInputElement).click()).catch(() => null);
          if (await box.isChecked().catch(() => false)) consented.push(label.slice(0, 90));
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
      // A required question the model neither answered nor asked about (Altera's conflict-of-interest questions)
      // goes to Owen as a question too: answered once, saved, and every later form fills it.
      for (const f of fields) {
        const flagged = here.some((l) => l === f.label || l.startsWith(f.label));
        if (!(f.required || flagged) || f.kind === "file" || f.key in reply.answers || reply.ask.includes(f.key) || questions.some((q) => q.q === f.label)) continue;
        if (answered[f.label] !== undefined) continue;
        if (/^(select one|search)\b/i.test(f.label) || f.label.length < 4) continue;
        questions.push({ q: f.label, ...(f.options && { options: f.options.filter((o) => !/^select one$/i.test(o)) }) });
      }
      // A password box is never a question for Owen (the sign-in handles accounts); one left on a page means the
      // sign-in step was missed, which the page check below reports.
      // Optional extras (Address Line 2, middle name, extension) stay blank instead of becoming questions (GE Vernova).
      for (let i = questions.length - 1; i >= 0; i--) if (/password|address line 2|^apt|suite|middle name|phone extension|^extension/i.test(questions[i].q)) questions.splice(i, 1);
      // A blank that's now a question for Owen isn't also listed as "still empty".
      for (let i = emptyAll.length - 1; i >= 0; i--) if (questions.some((q) => emptyAll[i].startsWith(q.q))) emptyAll.splice(i, 1);
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
      // An open dropdown eats a click (it just closes; OLG's diversity page stuck twice on that), and a forced click
      // can land on whatever lies over the button: close lists first, click for real, force only as a fallback.
      const stepOf = (s: string) => s.match(/current step \d+ of \d+/i)?.[0];
      const press = () =>
        inFront(page, async () => {
          await closeLists(page);
          const real = await nav.loc.click({ timeout: 4000 }).then(() => true).catch(() => false);
          if (!real) await nav.loc.click({ timeout: 4000, force: true }).catch(() => null);
          await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => null);
          await page.waitForTimeout(1500);
        });
      await press();
      let after = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
      for (let w = 0; w < 40 && after === sig; w++) {
        await page.waitForTimeout(500);
        after = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
      }
      // Still on the same step with no error showing: one more real click before calling it stuck.
      if (stepOf(after) && stepOf(after) === stepOf(sig) && !(await page.locator('[data-automation-id="errorMessage"]:visible, [data-automation-id="errorHeading"]:visible').count())) {
        await press();
        for (let w = 0; w < 16; w++) {
          after = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
          if (stepOf(after) !== stepOf(sig)) break;
          await page.waitForTimeout(500);
        }
      }
      // Workday also announces "Owen_Lee_Resume.pdf successfully uploaded" as an alert: that one isn't an error.
      const alerts = await page.locator('[role="alert"]:visible, [data-automation-id="errorMessage"]:visible, [data-automation-id="errorHeading"]:visible').allInnerTexts().catch(() => [] as string[]);
      const showsErrors = alerts.filter((a) => a.trim() && !/successfully|uploaded|saved/i.test(a)).length;
      // Same "current step N of M" twice running: the page took the click but isn't moving on.
      sameStep = stepOf(after) && stepOf(after) === stepOf(sig) ? sameStep + 1 : 0;
      // Errors after the click usually mean the page was read before Workday drew it (Revvity, Trimble, McKesson
      // 2026-11-06: questions page read as empty, every question flagged): read and fill this page once more.
      const stepKey = stepOf(after) ?? "page";
      if (showsErrors && !retried.has(stepKey)) {
        retried.add(stepKey);
        sameStep = 0;
        continue;
      }
      if (after === sig || showsErrors || sameStep >= 2) {
        const errs = (JSON.parse((await page.evaluate(CHECK)) as string) as string[]).filter(Boolean);
        emptyAll.push(...(errs.length ? errs : ["the page wouldn't move on (check the tab for errors)"]));
        stoppedOn = ` on page ${pages}`;
        break;
      }
      if (step === 11) stoppedOn = " (stopped after 12 pages)";
    }

    if (saidNo.length) infoNotes.push(`Answered No to: ${[...new Set(saidNo)].join("; ")}`);
    const resumeCheck = checkResume(resume, expected);
    const fields = allFields;
    const unfilled = unfilledAll;
    const missing = [...new Set([...emptyAll, ...unfilled.filter((l) => fields.find((f) => f.label === l)?.required)])];
    const url = page.url();
    const base = { url, resume, questions: questions.length ? questions : undefined };
    const pageNote = pages > 1 ? ` (${pages} pages)` : "";
    ex = { ...ex, text: firstText };

    // What this run did, for Owen and for me to check: run-report.json in the job's folder (every field typed,
    // the resume that went up, consent boxes, the Review page's text and a screenshot, timings, the outcome).
    let reviewText = "";
    let reviewIssues: string[] | undefined;
    let confirmationText: string | null = null;
    const jobDir = path.dirname(path.dirname(o.resume));
    const finish = async (res: ScriptResult): Promise<ScriptResult> => {
      try {
        const shot = path.join(jobDir, "run-screenshot.png");
        const shotOk = await page.screenshot({ path: shot, timeout: 8000, animations: "disabled" }).then(() => true).catch(() => false);
        const r = "r" in res ? res.r : undefined;
        writeFileSync(
          path.join(jobDir, "run-report.json"),
          JSON.stringify(
            {
              at: new Date().toISOString(),
              company: job.company,
              role: job.role,
              mode: o.submit ? (process.env.PREFILL_SUBMIT_DRYRUN === "1" ? "submit (dry run)" : "submit") : "fill",
              outcome: r?.state,
              note: r?.note,
              confirmation: confirmationText,
              url: page.url(),
              resume: { expectedBytes: expected, attached: resume ?? null, check: resumeCheck.status, detail: resumeCheck.detail },
              pages,
              answered,
              notFilled: unfilled,
              stillEmpty: missing,
              questionsForOwen: questions.map((q) => q.q),
              consentTicked: consented,
              reviewCheck: reviewIssues === undefined ? "not run" : reviewIssues.length ? reviewIssues : "passed",
              reviewText: reviewText.slice(0, 20_000),
              screenshot: shotOk ? shot : null,
              timing: "timing" in res ? res.timing : undefined,
              costUsd: "costUsd" in res ? res.costUsd : undefined,
            },
            null,
            2,
          ),
        );
      } catch {
        // a report that can't be written never changes the outcome
      }
      return res;
    };

    if (resumeCheck.status === "mismatch") return finish({ r: { ...base, state: "needs_you", note: `${resumeCheck.detail} Swap in the right one.` }, timing: timing(), costUsd });
    const essays = Object.values(answered).filter((v) => typeof v === "string" && v.length > 120).length;
    const essayNote =
      (essays ? ` I drafted ${essays} written answer${essays > 1 ? "s" : ""}; read ${essays > 1 ? "them" : "it"}.` : "") +
      (consented.length ? ` Ticked ${consented.length} consent box${consented.length > 1 ? "es" : ""}: ${consented.map((c) => `"${c}"`).join("; ")}.` : "") +
      (infoNotes.length ? ` ${infoNotes.join(". ")}.` : "");
    if (questions.length) return finish({ r: { ...base, state: "needs_you", note: `Filled${stoppedOn || " the rest"}. ${questions.length} question${questions.length > 1 ? "s" : ""} need${questions.length > 1 ? "" : "s"} your answer${missing.length ? `; also still empty: ${missing.slice(0, 4).join("; ")}` : ""}.${essayNote}` }, timing: timing(), costUsd });
    if (missing.length) return finish({ r: { ...base, state: "needs_you", note: `Filled most of it${stoppedOn}. Still empty: ${missing.slice(0, 5).join("; ")}.${essayNote}` }, timing: timing(), costUsd });
    // The resume can already be attached from an earlier pass (the page lists it by name and the upload box is gone).
    if (!uploaded && firstText.includes("Owen_Lee_Resume.pdf")) uploaded = true;
    if (!uploaded && (await page.locator("body").innerText().catch(() => "")).includes("Owen_Lee_Resume.pdf")) uploaded = true;
    // A run that picks up mid-application (the resume went up on an earlier page in an earlier run): the page
    // listing this job's tailored file by name is the check the submit gate needs.
    if (!resume && uploaded && (firstText.includes("Owen_Lee_Resume.pdf") || (await page.locator("body").innerText().catch(() => "")).includes("Owen_Lee_Resume.pdf"))) resume = { name: "Owen_Lee_Resume.pdf", size: null };
    if (!uploaded) return finish({ r: { ...base, state: "needs_you", note: `Filled${pageNote}, but I never found a resume upload. Attach it by hand.${essayNote}` }, timing: timing(), costUsd });
    // Qualcomm (Eightfold) 2026-11-06: a resume drop box on the job page, no form behind it, was reported as "filled".
    if (!Object.keys(answered).length && !atsOf(page.url()) && !/myworkdayjobs\.com|myworkdaysite\.com|\.workday\.com/i.test(page.url())) return finish({ r: { ...base, state: "needs_you", note: "Never reached the application form (only a resume box on the job page). Click Apply on the page and fill it by hand, or use Fill." }, timing: timing(), costUsd });

    if (!o.submit) return finish({ r: { ...base, state: "ready", note: `Filled and the tailored resume is attached.${essayNote} Review and submit.` }, timing: timing(), costUsd });

    // ---- Submit gates (all must hold; otherwise stop at ready)
    const stop = (why: string): Promise<ScriptResult> => finish({ r: { ...base, state: "ready", note: `Not submitted: ${why}.${essayNote}` }, timing: timing(), costUsd });
    // Greenhouse, Lever, Ashby and Workday auto-submit (Owen's call, 2026-11-04). Workday only from its Review
    // page with no error banner; other sites stop filled for Owen to review.
    const workday = /myworkdayjobs\.com|myworkdaysite\.com|\.workday\.com/i.test(page.url());
    // The ATS by where the form actually is: a company link that forwards to Ashby (TELUS Digital) counts.
    if (!ats && !workday && atsOf(page.url())) ats = atsOf(page.url());
    if (!ats && !workday) return stop("auto-submit is only on for Greenhouse, Lever, Ashby and Workday; review this one and submit it yourself");
    if (workday) {
      const body = await page.locator("body").innerText().catch(() => "");
      reviewText = body;
      if (!/current step (\d+) of \1\b[\s\S]{0,40}review/i.test(body)) return stop("Workday didn't reach its Review page");
      if (await page.locator('[data-automation-id="errorMessage"]:visible, [data-automation-id="errorBanner"]:visible').count()) return stop("Workday is showing an error on the page");
      // Every answer on the Review page, checked against the profile. No verdict (the check failed) means no submit.
      const rv = await reviewProblems({ reviewText: body, profile: o.profile, savedAnswers: JSON.stringify(readAnswerBank().map(({ q, a }) => ({ q, a }))), company: job.company, role: job.role });
      costUsd += rv.costUsd;
      if (!rv.error) reviewIssues = rv.problems;
      if (rv.error) return stop(`couldn't run the final check of the Review page (${rv.error.slice(0, 80)})`);
      if (rv.problems.length) return stop(`the Review page has answers that don't match your profile: ${rv.problems.slice(0, 4).join("; ")}`);
    }
    // Greenhouse / Lever / Ashby have no Review page: check every typed answer against the profile the same way.
    if (ats) {
      const typed = Object.entries(answered).map(([q, a]) => `${q}: ${Array.isArray(a) ? a.join(", ") : String(a)}`).join("\n");
      reviewText = typed;
      const rv = await reviewProblems({ reviewText: typed, profile: o.profile, savedAnswers: JSON.stringify(readAnswerBank().map(({ q, a }) => ({ q, a }))), company: job.company, role: job.role });
      costUsd += rv.costUsd;
      if (!rv.error) reviewIssues = rv.problems;
      if (rv.error) return stop(`couldn't run the final check of the answers (${rv.error.slice(0, 80)})`);
      if (rv.problems.length) return stop(`some answers don't match your profile: ${rv.problems.slice(0, 4).join("; ")}`);
    }
    if (resumeCheck.status !== "verified" && !(resume?.name === "Owen_Lee_Resume.pdf")) return stop("couldn't confirm the attached resume is the tailored one");
    // Greenhouse's own copy of the form, opened by this posting's id, is this job even without its title on the page.
    if (!embeddedById && !roleOnPage(job.role, ex.text)) return stop(`the page doesn't look like the ${job.role} posting`);
    const term = job.termConfirmed ? null : wrongTerm(ex.text);
    if (term) return stop(`the posting mentions ${term}, not Summer 2027`);
    if (/captcha/i.test(await page.content()) && (await page.locator('iframe[src*="bframe"]:visible, iframe[title*="challenge" i]:visible').count())) return stop("a human check is showing"); // invisible reCAPTCHA (Ashby, Lever) keeps a hidden bframe on every page: only a shown challenge counts

    // PREFILL_SUBMIT_DRYRUN=1: every gate above ran and passed; stop one step short of the real click.
    if (process.env.PREFILL_SUBMIT_DRYRUN === "1") return stop("dry run: every submit check passed, and this is where it would click Submit");
    t = Date.now();
    if (!reviewText) reviewText = await page.locator("body").innerText().catch(() => "");
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
    confirmationText = confirmation;
    if (confirmation) return finish({ r: { ...base, url: page.url(), state: "submitted", note: `Submitted. Confirmation: "${confirmation}". Resume ${resume?.name ?? "Owen_Lee_Resume.pdf"}${resume?.size ? ` (${(resume.size / 1024).toFixed(1)} KB)` : ""}, uploaded by script.${essayNote}` }, timing: timing(), costUsd });
    const after = await page.locator("body").innerText().catch(() => "");
    const why = /security code|verification code/i.test(after)
      ? "The site emailed a security code; enter it in the tab to finish"
      : /something went wrong/i.test(after)
        ? "Clicked Submit and the site answered \"Something went wrong\" (it was not accepted). Running it again reloads and retries"
        : "Clicked Submit, no confirmation seen";
    return finish({ r: { ...base, url: page.url(), state: "needs_you", note: `${why}. Do not submit twice: check the tab.` }, timing: timing(), costUsd });
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    if (!touched) return give(why);
    return { r: { state: "needs_you", note: `The script stopped partway (${why.slice(0, 120)}). The tab is open as it was left.`, url: page.url() }, timing: timing(), costUsd: 0 };
  }
}
