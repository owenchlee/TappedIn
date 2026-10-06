// Prompts for the headless Claude Code runs. Each run's cwd is the job folder, which holds:
//   jd.txt, experience.md, software.tex, hardware.tex, pm.tex (and resume.tex once written)

import type { ResumeBase } from "./base";

const TRUTH_RULES = `Truthfulness is the hard rule. Every claim must be backed by experience.md. Never invent
projects, numbers, tools, titles, dates, or responsibilities. Only use a keyword from the job
posting if experience.md shows Owen really has that skill or did that work. If something in
experience.md is under "Unconfirmed", do not use it.

Style: plain, direct, specific. Never use em dashes (the "—" character or LaTeX "---"); use commas,
periods, or parentheses instead.`;

/**
 * What ATS keyword search and a recruiter's first pass reward (research notes in lib/autoapply/ats.ts):
 * literal keyword matches in context, a 7-second F-pattern skim of the top and the left edge, and
 * action-verb bullets with measured results.
 */
const SCAN_RULES = `How the resume gets read, so write for it:
- ATS keyword search: recruiters search the parsed text for the posting's terms, and some systems
  match literally. Use the posting's exact spelling for each skill Owen really has ("machine
  learning" vs "ML", "Node.js" vs "Node", "REST APIs"); when the posting uses an acronym and a
  spelled-out form, include both once. Show the most important skills inside bullets or project
  lines where he used them, not only in the Skills list. Never repeat a keyword just to repeat it.
- Recruiter's first pass (about 7 seconds, F-pattern): the eye reads across the top, then down the
  left edge. The first entry under Projects or Experience should be the one most relevant to this
  job. Each bullet opens with a strong past-tense action verb and gets the tech or the result into
  its first several words. Shape: action verb + what he built + with what + measured result.
- Keep bullets to one or two full lines (about 15 to 28 words). A bullet whose second line holds
  only a word or two wastes space: tighten it to one line or fill the second line.
- Dates: give both ends a year ("June 2025 -- Sep. 2025", not "June -- Sep. 2025").
- No filler ("responsible for", "worked on", "helped", "various", "passionate", "leveraged"), no "I"
  or "we".`;

function pickBaseStep(forced?: ResumeBase): string {
  if (forced) return `1) Use ${forced}.tex as the base resume. Owen chose it himself, so do not second-guess it.`;
  return `1) Pick the base resume from what the job mainly is, reading the posting, not just the title:
- pm.tex: product management, product owner, APM, product analyst, program or project management,
  or other non-coding roles where leading people, user feedback, and launches matter most.
- hardware.tex: mainly hardware, embedded, electrical, firmware, PCB, or robotics hardware.
- software.tex: everything else (software, web, mobile, data, ML, and engineering roles that are
  mostly code).`;
}

export function tailorPrompt(opts: { company: string; role: string; forcedBase?: ResumeBase }): string {
  return `You are tailoring Owen Lee's resume for: ${opts.role} at ${opts.company}.

Files in the current directory:
- jd.txt: the job posting text scraped from the page
- experience.md: everything true about Owen (source of truth)
- software.tex, hardware.tex and pm.tex: his three Overleaf resumes (Jake's Resume template); pm.tex is
  his product management resume

Do these two things, then reply with just DONE.

${pickBaseStep(opts.forcedBase)}

2) Write resume.tex: a copy of the chosen base with only the resume content edited to fit this job.
- Everything before \\begin{document} must stay byte for byte identical. Keep the header block,
  the section order, and the template's commands (\\resumeProjectHeading, \\resumeItem, etc.).
- It must still fit on ONE page. Keep the same number of projects or fewer, keep the same number of
  bullets per entry as the base, and keep each bullet about as long as the one it replaces.
- Allowed edits: reorder projects so the most relevant come first; swap a less relevant project
  for a more relevant one from experience.md; rephrase bullets to use the posting's own vocabulary
  for things Owen actually did; reorder or adjust the Skills line (only skills backed by
  experience.md); bold the key number in a bullet the way the template already does.
- Experience and Involvements: you may replace the least relevant entry with a more relevant one from
  experience.md's "University involvements" (e.g. a design team for robotics, embedded or autonomy
  roles), when it helps this job. Use its title, organization and dates exactly, its resume bullets
  as written there, and the same template commands; keep the same number of entries per section.
- Otherwise do not change facts in Education, Experience, Involvements, or Awards (light rewording is fine).
- Keep LaTeX escaping correct (\\%, \\&, \\$, \\#). Never leave a TODO in the output.
- If the base has "\\% TODO" notes in a bullet, remove the note text (and never carry it over).

${SCAN_RULES}

Also write notes.md. Its first line must be exactly "Base: software", "Base: hardware" or "Base: pm".
Its second line must be "Why: " followed by one plain sentence on why that base fits this job. Then:
the posting's key requirements and how the
resume now covers each; important keywords you could NOT add because Owen doesn't have them; a
short list of what you changed.

${TRUTH_RULES}`;
}

export function humanizeRetryPrompt(): string {
  return `You did not run the humanizer skill. Invoke it now with the Skill tool on the letter in
cover-letter.txt, check the result is still truthful, 250 to 350 words, and free of em dashes, then
overwrite cover-letter.txt with the humanized letter. Reply with just DONE.`;
}

export function trimPrompt(pages: number): string {
  return `resume.tex currently compiles to ${pages} pages. It must be exactly one page.
Edit resume.tex in place: shorten the least relevant bullets first, then drop the least relevant
project if you have to. Do not touch anything before \\begin{document}. Do not add new content.
Never use em dashes. Reply with just DONE.`;
}

export function fixPrompt(error: string): string {
  return `resume.tex fails to compile with pdfLaTeX. The error is:

${error}

Fix resume.tex in place with the smallest possible change (usually an unescaped %, &, $, #, or _,
or an unbalanced brace). Do not touch anything before \\begin{document}. Reply with just DONE.`;
}

export function problemsPrompt(problems: string[]): string {
  return `resume.tex has these problems: ${problems.join("; ")}.
Fix them in place without changing anything else (replace em dashes with commas or rewording;
delete any TODO note text). A number, skill, tool, project, employer or organization that is not in
the base resumes or experience.md was invented: put back the original wording from the base resume
(or remove the claim). Never add a different unbacked fact in its place. Reply with just DONE.`;
}

/**
 * Cover letter format, from research (Sept 2026): recruiters skim for 30 to 60 seconds; 250 to 400
 * words is the preferred range and ~250 words outperforms 500+; open with a company-specific hook,
 * lead with the strongest relevant project, map evidence to the posting's requirements, close by
 * asking for the interview. UW co-op guidance: paragraph 1 why this company, paragraph 2 technical
 * fit, paragraph 3 soft skills / ownership, keyword-tailored, submitted as a PDF.
 */
export const coverLetterGuide = (company: string) => `Format (research-backed; recruiters skim these in under a minute):
- 250 to 350 words total. Never over 400.
- Salutation: "Dear <name>," if the posting names a hiring manager or recruiter, otherwise
  "Dear ${company} Hiring Team,".
- Paragraph 1 (2 to 3 sentences): the role, and one specific, genuine reason this company or team
  interests him, taken from the posting itself (their product, mission, or a stated problem). No
  generic praise.
- Paragraph 2: his single most relevant project, told as problem, what he built, and the measured
  result, tied directly to the posting's top requirement.
- Paragraph 3: a second piece of evidence covering a different requirement (another project, or
  leadership/ownership from his councils or Catch 'Em Crate if the role values it).
- Closing (1 to 2 sentences): he's a 1A Systems Design Engineering student at the University of
  Waterloo, looking forward to talking about how he can help; thank them.
- Sign-off: "Sincerely," then "Owen Lee" on the next line.
- No bullet points, no headings, no restating the whole resume, no clichés ("I am writing to
  express", "passionate", "leverage", "fast-paced", "team player").`;

export function coverLetterPrompt(opts: { company: string; role: string }): string {
  return `Write Owen Lee's cover letter for: ${opts.role} at ${opts.company}.

Files in the current directory: jd.txt (the posting), experience.md (source of truth about Owen),
resume.tex (the resume already tailored for this job; the letter should complement it, not repeat it).

${coverLetterGuide(opts.company)}

${TRUTH_RULES}

Steps:
1) Draft the letter.
2) Run the humanizer skill on the draft with the Skill tool. This step is required, not optional.
3) Re-check the humanized version: still truthful to experience.md, still 250 to 350 words, no em
   dashes, still follows the format above.
4) Write the final letter to cover-letter.txt as plain text: the salutation line, the paragraphs
   separated by one blank line, then "Sincerely," and "Owen Lee" on separate lines. No date, no
   address block, no markdown.

Reply with just DONE.`;
}

export function letterFixPrompt(numbers: string[]): string {
  return `cover-letter.txt uses these numbers, which are not in experience.md or the resumes: ${numbers.join(", ")}.
They were invented. Edit cover-letter.txt in place: use the real figure from experience.md, or
drop the number and keep the sentence qualitative. Change nothing else. Reply with just DONE.`;
}

/**
 * A strict second reader. It sees the compiled PDF the way a recruiter does and writes review.json;
 * its score is part of the pass/fail gate and its fixes feed the next rewrite.
 */
export function reviewPrompt(opts: { company: string; role: string }): string {
  return `You are a strict technical recruiter screening co-op and intern applicants for: ${opts.role} at ${opts.company}.
You see hundreds of strong University of Waterloo co-op resumes each term.

Files: resume.pdf (read it as the page a recruiter sees), jd.txt (the posting), experience.md (everything
true about the candidate; anything under "Unconfirmed" is off limits).

1) First pass, about 7 seconds, F-pattern: read across the top, then down the left edge (entry names,
   titles, dates, first words of bullets). Note what you took away and whether this job's fit is
   obvious from that pass alone.
2) Second pass, 30 seconds: do the bullets show real, measured impact relevant to this posting? Is
   anything vague, cluttered, padded, repetitive, or keyword-stuffed?
3) Score 1 to 10 for "would I put this in the interview pile for THIS job":
   10 = obvious interview; 8 = strong shortlist; 6 = maybe pile; 4 or less = pass.
   Judge the presentation of what the candidate has, not experience he can't have as a first-year
   student. Be honest; do not inflate.
4) List up to 4 fixes that would raise the score, most important first. Every fix must be doable by
   rewording, reordering, or swapping in content from experience.md, must keep the resume to one
   page in the same template, and must never invent a skill, number, or project.

Write review.json, exactly this shape and nothing else:
{"score": 7, "first_impression": "one or two sentences", "fixes": ["...", "..."]}

Reply with just DONE.`;
}

/** One rewrite round, driven by the scorer's findings and the recruiter review. */
export function revisePrompt(opts: { company: string; role: string; round: number; scores: string; issues: string[]; reviewFixes: string[]; missing: string[] }): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  return `resume.tex (tailored for ${opts.role} at ${opts.company}) was scored and isn't good enough yet (round ${opts.round}).
Scores: ${opts.scores}

Problems the checker found:
${list(opts.issues) || "- none"}
${opts.reviewFixes.length ? `\nA recruiter reviewing the PDF suggested:\n${list(opts.reviewFixes)}\n` : ""}${opts.missing.length ? `\nPosting keywords that experience.md backs but the resume doesn't show yet (add the important ones where they're true): ${opts.missing.join(", ")}\n` : ""}
Edit resume.tex in place to fix as many of these as you can. Read jd.txt and experience.md first.

${SCAN_RULES}

Rules that still apply:
- Everything before \begin{document} stays byte for byte identical; keep the template's commands.
- It must still fit on ONE page; same number of bullets per entry as now; no new font size commands.
- You may reorder projects, swap in a more relevant project or involvement from experience.md, reword
  bullets, and adjust the Skills line, exactly as in the original tailoring rules.
- If fixing one problem would break a rule above or require inventing something, skip it.

${TRUTH_RULES}

Then append a short "Revision ${opts.round}:" section to notes.md listing what you changed. Reply with just DONE.`;
}
