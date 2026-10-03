// Deterministic guard against invented resume content. The tailoring prompt already forbids it;
// this checks the output anyway, so a hallucinated metric or skill never reaches an application.
// Pure module: used by the runner and by unit tests.

const BEGIN_DOC = "\\begin{document}";

/** Rough LaTeX → text: enough to compare facts, not to render. */
export function texToText(tex: string): string {
  return tex
    .replace(/(?<!\\)%.*$/gm, "") // comments never render
    .replace(/\\href\{[^}]*\}/g, "") // keep the link text, drop the URL
    .replace(/\$\\sim\$/g, "~")
    .replace(/\$\|\$/g, "|")
    .replace(/\\textbar\\?/g, "|")
    .replace(/\\([%$&#_{}])/g, "$1")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ") // drop commands, keep their {arguments}
    .replace(/[{}]/g, " ")
    .replace(/--+/g, "-")
    .replace(/[ \t]+/g, " ");
}

/** experience.md minus anything under an "Unconfirmed" heading, which must never be claimed. */
export function confirmedExperience(md: string): string {
  const out: string[] = [];
  let skipLevel = 0;
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#+)\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && /unconfirmed/i.test(h[2])) {
        skipLevel = level;
        continue;
      }
    }
    if (!skipLevel) out.push(line);
  }
  return out.join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every number written in the text, normalized ("1,800" → "1800", "98.2%" → "98.2"). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, "").replace(/\.0+$/, ""));
  return out;
}

/** Comma-separated items from the Skills section ("\textbf{Languages}{: Python, Java}") and project tech lines (\emph{...}). */
function claimedSkills(body: string): string[] {
  const items: string[] = [];
  const skills = /\\section\{[^}]*Skills[^}]*\}\}?([\s\S]*?)(\\section|\\end\{document\})/i.exec(body)?.[1] ?? "";
  for (const m of skills.matchAll(/\{:\s*([^}]*)\}/g)) items.push(...m[1].split(","));
  for (const m of body.matchAll(/\\emph\{([^}]*)\}/g)) items.push(...m[1].split(","));
  return items.map((s) => texToText(s).trim()).filter((s) => s.length > 1);
}

/** Bold names in entry headings: projects, employers, organizations, schools. */
function claimedEntries(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\\resume(?:Project|Sub)[Hh]eading\s*\{\s*\\textbf\{([^}]*)\}/g)) out.push(texToText(m[1]).trim());
  return out.filter(Boolean);
}

/**
 * Lists every fact in the tailored resume body that none of the sources back up: numbers, skills,
 * and entry names (projects / employers / organizations). Sources are the base .tex resumes and
 * experience.md. Rewording is fine; new facts are not.
 */
export function factProblems(tailoredTex: string, sources: { tex: string[]; experienceMd: string }): string[] {
  const body = tailoredTex.slice(Math.max(0, tailoredTex.indexOf(BEGIN_DOC)));
  const sourceText = norm(
    [...sources.tex.map((t) => texToText(t.slice(Math.max(0, t.indexOf(BEGIN_DOC))))), confirmedExperience(sources.experienceMd)].join("\n"),
  );
  const sourceNumbers = numbersIn(sourceText);
  const problems: string[] = [];

  const badNumbers = [...numbersIn(texToText(body))].filter((n) => !sourceNumbers.has(n));
  if (badNumbers.length) problems.push(`uses numbers that are not in the base resumes or experience.md: ${badNumbers.join(", ")}`);

  const backed = (s: string) => sourceText.includes(norm(s));
  // "TypeScript/JavaScript" is a fine reordering of "JavaScript/TypeScript": check each half.
  const badSkills = [...new Set(claimedSkills(body))].filter((s) => !backed(s) && !s.split("/").every((part) => part.trim() && backed(part)));
  if (badSkills.length) problems.push(`lists skills or tools that are not in the base resumes or experience.md: ${badSkills.join(", ")}`);

  const badEntries = [...new Set(claimedEntries(body))].filter((s) => !sourceText.includes(norm(s)));
  if (badEntries.length) problems.push(`has entries (projects, employers or organizations) that are not in the base resumes or experience.md: ${badEntries.join(", ")}`);

  return problems;
}

/** Numbers in a plain-text cover letter that no source backs up. Years are allowed ("Summer 2027"). */
export function letterNumberProblems(letter: string, sources: { tex: string[]; experienceMd: string }): string[] {
  const sourceNumbers = numbersIn(
    [...sources.tex.map((t) => texToText(t.slice(Math.max(0, t.indexOf(BEGIN_DOC))))), confirmedExperience(sources.experienceMd)].join("\n"),
  );
  return [...numbersIn(letter)].filter((n) => !sourceNumbers.has(n) && !/^20\d\d$/.test(n));
}
