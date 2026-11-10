import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Overleaf builds these resumes with pdfLaTeX, so we do too (MiKTeX locally). XeTeX/Tectonic can't
// run Jake's template (\pdfgentounicode is pdfTeX-only) and would reflow the text anyway.

const MIKTEX_USER_BIN = path.join(os.homedir(), "AppData", "Local", "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe");

export function pdflatexPath(): string {
  if (process.env.PDFLATEX_PATH) return process.env.PDFLATEX_PATH;
  if (existsSync(MIKTEX_USER_BIN)) return MIKTEX_USER_BIN;
  return "pdflatex";
}

export type CompileResult = { ok: boolean; pages: number | null; error?: string };

export function compileTex(dir: string, texFile: string): Promise<CompileResult> {
  return new Promise((resolve) => {
    execFile(
      pdflatexPath(),
      ["-interaction=nonstopmode", "-halt-on-error", texFile],
      { cwd: dir, timeout: 180_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        const pages = /Output written on [\s\S]*?\((\d+) pages?/.exec(stdout)?.[1];
        if (err || !pages) {
          // pdfTeX errors start with "!" and the next couple of lines carry the context.
          const bang = stdout.indexOf("\n!");
          const detail = bang >= 0 ? stdout.slice(bang + 1, bang + 600) : (err?.message ?? "no PDF produced");
          resolve({ ok: false, pages: null, error: detail.trim() });
          return;
        }
        resolve({ ok: true, pages: Number(pages) });
      },
    );
  });
}

const BEGIN_DOC = "\\begin{document}";

/**
 * The formatting contract: the tailored file must keep the base template's preamble byte for byte
 * (margins, fonts, section styles, custom commands). The model is only allowed to change what's
 * between \begin{document} and \end{document}; if it touched the preamble anyway, put it back.
 */
export function enforcePreamble(baseTex: string, tailoredTex: string): { tex: string; restored: boolean } {
  const baseIdx = baseTex.indexOf(BEGIN_DOC);
  const tailIdx = tailoredTex.indexOf(BEGIN_DOC);
  if (baseIdx < 0) throw new Error("Base template has no \\begin{document}");
  if (tailIdx < 0) throw new Error("Tailored resume has no \\begin{document}");
  const basePre = baseTex.slice(0, baseIdx);
  const tailPre = tailoredTex.slice(0, tailIdx);
  if (basePre === tailPre) return { tex: tailoredTex, restored: false };
  return { tex: basePre + tailoredTex.slice(tailIdx), restored: true };
}

/** Body-only checks the model must pass: no em dashes (Owen's standing rule), no leftover TODOs. */
export function bodyProblems(tex: string): string[] {
  // Drop real comments (unescaped %) first: they never render. An escaped \% does render, which is
  // exactly how the hardware template's "\% TODO" notes leak into its PDF.
  const body = tex.slice(Math.max(0, tex.indexOf(BEGIN_DOC))).replace(/(?<!\\)%.*$/gm, "");
  const problems: string[] = [];
  if (body.includes("—") || /(?<!-)---(?!-)/.test(body)) problems.push("contains an em dash");
  if (/TODO/i.test(body)) problems.push("contains a TODO note");
  return problems;
}

/** Escape plain text (cover letter paragraphs) for LaTeX. */
export function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/** Pulls the resume's centered name/links header so the cover letter matches it exactly. */
export function extractHeader(baseTex: string): string | null {
  const m = /\\begin\{center\}[\s\S]*?\\end\{center\}/.exec(baseTex);
  return m ? m[0] : null;
}

export function readText(file: string): string {
  return readFileSync(file, "utf8");
}

/** The Type 1 fonts pdfTeX embedded, read from the compile log ("<.../sfrm1000.pfb>"). Each file is one face at one size. */
export function fontsFromLog(dir: string, texFile: string): Set<string> {
  const log = path.join(dir, texFile.replace(/\.tex$/, ".log"));
  if (!existsSync(log)) return new Set();
  // pdfTeX hard-wraps its log at 79 columns, which can split a font path; unwrap first.
  const text = readFileSync(log, "utf8").replace(/\r?\n/g, "");
  return new Set([...text.matchAll(/([A-Za-z0-9-]+)\.pfb/g)].map((m) => m[1]));
}

/** pdftotext ships next to pdflatex in MiKTeX (and TeX Live); it reads the PDF roughly the way an ATS parser does. */
function pdftotextPath(): string {
  const exe = path.join(path.dirname(pdflatexPath()), process.platform === "win32" ? "pdftotext.exe" : "pdftotext");
  return existsSync(exe) ? exe : "pdftotext";
}

export type PageSpace = { linesOver: number; freeLines: number };

/**
 * How far a resume is from exactly filling page 1, in text lines: `linesOver` counts lines spilled onto
 * later pages, `freeLines` the empty lines left above page 1's bottom margin. Lets a trim cut the right
 * amount in one pass instead of guessing from "2 pages" (idea from pqthangv/AutoInternshipClaude).
 * Reads `pdftotext -bbox` output. Assumes equal top and bottom margins, as in Jake's template.
 */
export function pageSpaceFromBbox(html: string): PageSpace | null {
  const pages = html.split(/<page\b/).slice(1).map((chunk) => ({
    height: Number(/height="([\d.]+)"/.exec(chunk)?.[1]),
    words: [...chunk.matchAll(/<word[^>]*yMin="([\d.]+)"[^>]*yMax="([\d.]+)"/g)].map((m) => ({ top: Number(m[1]), bottom: Number(m[2]) })),
  }));
  const first = pages[0];
  if (!first?.words.length || !first.height) return null;
  // Words whose bottoms sit within 2pt of each other are one line.
  const lineCount = (words: { bottom: number }[]) => {
    const ys = [...new Set(words.map((w) => Math.round(w.bottom)))].sort((a, b) => a - b);
    return { ys, n: ys.filter((y, i) => i === 0 || y - ys[i - 1] > 2).length };
  };
  const { ys } = lineCount(first.words);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > 2).sort((a, b) => a - b);
  const lineHeight = Math.min(20, Math.max(8, gaps[Math.floor(gaps.length / 2)] ?? 12));
  const topMargin = Math.min(...first.words.map((w) => w.top));
  const lastLine = Math.max(...first.words.map((w) => w.bottom));
  const freeLines = Math.max(0, Math.floor((first.height - topMargin - lastLine) / lineHeight));
  const linesOver = pages.slice(1).reduce((sum, p) => sum + lineCount(p.words).n, 0);
  return { linesOver, freeLines };
}

/** {@link pageSpaceFromBbox} for a PDF file; null when pdftotext can't read it. */
export function pageSpace(pdfFile: string): Promise<PageSpace | null> {
  return new Promise((resolve) => {
    execFile(pdftotextPath(), ["-bbox", "-enc", "UTF-8", pdfFile, "-"], { timeout: 60_000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? null : pageSpaceFromBbox(stdout)),
    );
  });
}

/** The PDF's text: reading order by default, or `layout` to keep line wraps and indents. */
export function pdfToText(pdfFile: string, opts: { layout?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [...(opts.layout ? ["-layout"] : []), "-enc", "UTF-8", pdfFile, "-"];
    execFile(pdftotextPath(), args, { timeout: 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(new Error(`pdftotext failed: ${err.message}`));
      else resolve(stdout);
    });
  });
}
