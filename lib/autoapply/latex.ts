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
