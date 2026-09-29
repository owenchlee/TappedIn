// Prompts for the headless Claude Code runs. Each run's cwd is the job folder, which holds:
//   jd.txt, experience.md, software.tex, hardware.tex, questions.json (and resume.tex once written)

const TRUTH_RULES = `Truthfulness is the hard rule. Every claim must be backed by experience.md. Never invent
projects, numbers, tools, titles, dates, or responsibilities. Only use a keyword from the job
posting if experience.md shows Owen really has that skill or did that work. If something in
experience.md is under "Unconfirmed", do not use it.

Style: plain, direct, specific. Never use em dashes (the "—" character or LaTeX "---"); use commas,
periods, or parentheses instead.`;

export function tailorPrompt(opts: { company: string; role: string }): string {
  return `You are tailoring Owen Lee's resume for: ${opts.role} at ${opts.company}.

Files in the current directory:
- jd.txt: the job posting text scraped from the page
- experience.md: everything true about Owen (source of truth)
- software.tex and hardware.tex: his two Overleaf resumes (Jake's Resume template)
- questions.json: application-form questions that still need an answer

Do these three things, then reply with just DONE.

1) Pick the base resume. Use hardware.tex only if the role is mainly hardware, embedded, electrical,
firmware, PCB, or robotics hardware. Otherwise use software.tex.

2) Write resume.tex: a copy of the chosen base with only the resume content edited to fit this job.
- Everything before \\begin{document} must stay byte for byte identical. Keep the header block,
  the section order, and the template's commands (\\resumeProjectHeading, \\resumeItem, etc.).
- It must still fit on ONE page. Keep the same number of projects or fewer, keep two bullets per
  entry, and keep each bullet about as long as the one it replaces.
- Allowed edits: reorder projects so the most relevant come first; swap a less relevant project
  for a more relevant one from experience.md; rephrase bullets to use the posting's own vocabulary
  for things Owen actually did; reorder or adjust the Skills line (only skills backed by
  experience.md); bold the key number in a bullet the way the template already does.
- Do not change facts in Education, Experience, Involvements, or Awards (light rewording is fine).
- Keep LaTeX escaping correct (\\%, \\&, \\$, \\#). Never leave a TODO in the output.
- If the base has "\\% TODO" notes in a bullet, remove the note text (and never carry it over).

3) Write answers.json: an object mapping each question "id" from questions.json to an answer.
- For "select"/"radio" questions the answer must be exactly one of that question's options.
- For "checkbox" questions answer true or false.
- Answer null when the question is about work authorization, visas or sponsorship, salary,
  demographics or self-identification, criminal history, or anything experience.md can't answer
  truthfully (for example specific availability dates). Owen will answer those himself.
- Free-text answers: first person, concise (under 120 words unless the question asks for more),
  specific to this company, grounded in experience.md. If a free-text answer is longer than two
  sentences, run the humanizer skill (Skill tool) on it and use the humanized version.

Also write notes.md. Its first line must be exactly "Base: software" or "Base: hardware". Then: why
you picked that base; the posting's key requirements and how the
resume now covers each; important keywords you could NOT add because Owen doesn't have them; a
short list of what you changed.

${TRUTH_RULES}`;
}

/** For later pages of multi-page forms (Workday etc.): answers only, resume already done. */
export function answersPrompt(opts: { company: string; role: string }): string {
  return `Owen Lee is applying for ${opts.role} at ${opts.company}. jd.txt is the posting,
experience.md is the source of truth about Owen, resume.tex is his tailored resume.

Write answers.json: an object mapping each question "id" in questions.json to an answer.
- "select"/"radio": exactly one of that question's options. "checkbox": true or false.
- null for work authorization, visas or sponsorship, salary, demographics or self-identification,
  criminal history, or anything experience.md can't answer truthfully.
- Free text: first person, concise, specific, grounded in experience.md. Run the humanizer skill
  (Skill tool) on any answer longer than two sentences.

${TRUTH_RULES}

Reply with just DONE.`;
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
delete any TODO note text). Reply with just DONE.`;
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
