import type { Frame, Page } from "playwright-core";

// Reads and fills application forms on arbitrary ATS pages (Greenhouse, Lever, Ashby, company
// sites, embedded iframes). Deliberately never: types into password fields, presses Enter, or
// clicks anything that could submit. Owen reviews and submits himself.

export type FieldKind = "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "combobox";

export type FormField = {
  key: string; // value of the data-aa attribute we stamp on the element (radio: on each option)
  frame: number;
  kind: FieldKind;
  label: string;
  required: boolean;
  options?: string[]; // select + radio
  inputType?: string;
};

/** Runs inside the page. Must be self-contained: Playwright serializes it. */
function scanFrame(frameIdx: number): FormField[] {
  // clean() keeps "*" so isRequired can spot asterisk-only required markers; noStar() strips it
  // for the label we store and show.
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const noStar = (s: string) => s.replace(/\s*\*\s*/g, " ").trim();
  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const cs = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const inChrome = (el: Element) => Boolean(el.closest("header, nav, footer, [role=navigation], [role=search]"));

  const labelOf = (el: HTMLElement): string => {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      if (clean(t)) return clean(t);
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && clean(l.textContent)) return clean(l.textContent);
    }
    const aria = el.getAttribute("aria-label");
    if (clean(aria)) return clean(aria);
    const wrap = el.closest("label");
    if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
    // Walk up a few levels looking for the question text that sits next to the control.
    let node: HTMLElement | null = el.parentElement;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      const q = node.querySelector("legend, label, [class*=label], [class*=question], [class*=Label], [class*=Question]");
      if (q && !q.contains(el) && clean(q.textContent)) return clean(q.textContent);
    }
    return clean(el.getAttribute("placeholder")) || clean(el.getAttribute("name")) || "";
  };

  const isRequired = (el: HTMLElement, label: string) =>
    (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true" || /\*/.test(label);

  const fields: FormField[] = [];
  let n = 0;
  const stamp = (el: Element) => {
    const key = `f${frameIdx}-${n++}`;
    el.setAttribute("data-aa", key);
    return key;
  };

  const radioGroups = new Map<string, HTMLInputElement[]>();
  const controls = Array.from(document.querySelectorAll("input, textarea, select")) as HTMLElement[];

  for (const el of controls) {
    if (inChrome(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (tag === "input" && ["hidden", "submit", "button", "reset", "image", "password", "search"].includes(type)) continue;
    // File inputs are usually hidden behind a styled "Attach" button, so they skip the visibility check.
    if (type !== "file" && !visible(el)) continue;

    if (tag === "input" && type === "radio") {
      const name = el.getAttribute("name") ?? `__radio${n}`;
      radioGroups.set(name, [...(radioGroups.get(name) ?? []), el as HTMLInputElement]);
      continue;
    }

    const rawLabel = labelOf(el);
    const label = noStar(rawLabel);
    if (/password/i.test(label)) continue;

    let kind: FieldKind = "text";
    if (tag === "textarea") kind = "textarea";
    else if (tag === "select") kind = "select";
    else if (type === "checkbox") kind = "checkbox";
    else if (type === "file") kind = "file";
    else if (el.getAttribute("role") === "combobox") kind = "combobox";

    const field: FormField = { key: stamp(el), frame: frameIdx, kind, label, required: isRequired(el, rawLabel), inputType: type };
    if (kind === "select") {
      field.options = Array.from((el as HTMLSelectElement).options)
        .map((o) => noStar(clean(o.textContent)))
        .filter((t) => t && !/^(select|choose|--)/i.test(t));
    }
    fields.push(field);
  }

  for (const radios of radioGroups.values()) {
    const first = radios[0];
    const group = first.closest("fieldset, [role=radiogroup]") as HTMLElement | null;
    let question = "";
    if (group) question = clean(group.querySelector("legend")?.textContent) || clean(group.getAttribute("aria-label"));
    if (!question) {
      let node: HTMLElement | null = first.parentElement;
      const optionText = new Set(radios.map((r) => labelOf(r)));
      for (let i = 0; i < 6 && node && !question; i++, node = node.parentElement) {
        const q = node.querySelector("legend, label, [class*=label], [class*=question]");
        const t = clean(q?.textContent);
        if (q && t && !optionText.has(t) && !radios.some((r) => q.contains(r))) question = t;
      }
    }
    const key = `f${frameIdx}-${n++}`;
    radios.forEach((r, i) => r.setAttribute("data-aa", `${key}-${i}`));
    fields.push({
      key,
      frame: frameIdx,
      kind: "radio",
      label: noStar(question),
      required: radios.some((r) => r.required) || /\*/.test(question),
      options: radios.map((r) => noStar(labelOf(r))),
    });
  }
  return fields;
}

export async function scanPage(page: Page): Promise<FormField[]> {
  const all: FormField[] = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    try {
      // tsx/esbuild wraps named functions in a __name() helper that doesn't exist in the page.
      await frames[i].evaluate("window.__name = window.__name || ((f) => f)");
      all.push(...(await frames[i].evaluate(scanFrame, i)));
    } catch (err) {
      // Frames still loading or detached mid-scan get skipped, but say so instead of hiding it.
      console.warn(`[autoapply] scan skipped frame ${i}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }
  return all;
}

export function hasApplicationForm(fields: FormField[]): boolean {
  return fields.some((f) => f.kind === "file") || fields.filter((f) => f.kind === "text").length >= 3;
}

/** Visible page text for the job description (capped so prompts stay small). */
export async function pageText(page: Page): Promise<string> {
  const text = await page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 20_000);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function bestOption(options: string[], wanted: string): string | null {
  const w = norm(wanted);
  if (!w) return null;
  return (
    options.find((o) => norm(o) === w) ??
    options.find((o) => norm(o).startsWith(w) || w.startsWith(norm(o))) ??
    options.find((o) => norm(o).includes(w) || w.includes(norm(o))) ??
    null
  );
}

export type FillValue = string | boolean | { file: string };

function frameFor(page: Page, field: FormField): Frame {
  return page.frames()[field.frame] ?? page.mainFrame();
}

/** Fills one field. Returns the value actually used, or null if it couldn't be filled. */
export async function fillField(page: Page, field: FormField, value: FillValue): Promise<string | null> {
  const frame = frameFor(page, field);
  const loc = frame.locator(`[data-aa="${field.key}"]`).first();
  const opts = { timeout: 5_000 };

  switch (field.kind) {
    case "file": {
      if (typeof value !== "object") return null;
      await loc.setInputFiles(value.file, opts);
      return value.file.split(/[\\/]/).pop() ?? value.file;
    }
    case "checkbox": {
      const on = value === true || (typeof value === "string" && /^(yes|true)$/i.test(value));
      await loc.setChecked(on, opts);
      return on ? "checked" : "unchecked";
    }
    case "select": {
      if (typeof value !== "string") return null;
      const match = bestOption(field.options ?? [], value);
      if (!match) return null;
      await loc.selectOption({ label: match }, opts).catch(async () => {
        // Some option labels carry extra whitespace; fall back to matching on the DOM text.
        const idx = await loc.evaluate(
          (el, m) => Array.from((el as HTMLSelectElement).options).findIndex((o) => o.textContent?.replace(/\s+/g, " ").trim() === m),
          match,
        );
        if (idx < 0) throw new Error("option not found");
        await loc.selectOption({ index: idx }, opts);
      });
      return match;
    }
    case "radio": {
      if (typeof value !== "string") return null;
      const match = bestOption(field.options ?? [], value);
      if (!match) return null;
      const i = (field.options ?? []).indexOf(match);
      await frame.locator(`[data-aa="${field.key}-${i}"]`).first().check({ ...opts, force: true });
      return match;
    }
    case "combobox": {
      if (typeof value !== "string" || !value) return null;
      await loc.click(opts);
      await loc.fill(value, opts);
      // Pick the matching option by clicking it. Never press Enter: on some forms that submits.
      const option = frame.getByRole("option", { name: new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click(opts);
        return value;
      }
      await loc.press("Escape").catch(() => {});
      return null;
    }
    default: {
      if (typeof value !== "string") return null;
      await loc.fill(value, opts);
      return value.length > 60 ? `${value.slice(0, 57)}...` : value;
    }
  }
}
