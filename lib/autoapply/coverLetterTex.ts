import { escapeLatex, extractHeader } from "./latex";

/**
 * Renders the plain-text letter as a one-page PDF source that matches the resume: same font
 * encoding (so the same Computer Modern look), and the resume's own centered name/links header
 * copied verbatim so the two documents read as a set.
 */
export function coverLetterTex(letter: string, baseResumeTex: string, date = new Date()): string {
  const header =
    extractHeader(baseResumeTex) ?? "\\begin{center}\n  \\textbf{\\Huge \\scshape Owen Lee}\n\\end{center}";
  const dateLine = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const paragraphs = letter
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((p) => escapeLatex(p.trim()).replace(/\n/g, " \\\\\n"));

  return `\\documentclass[letterpaper,11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[top=0.8in,bottom=0.9in,left=1in,right=1in]{geometry}
\\usepackage{hyperref}
\\input{glyphtounicode}
\\pdfgentounicode=1
\\urlstyle{same}
\\hypersetup{colorlinks=true, urlcolor=blue, linkcolor=blue}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{9pt}

\\begin{document}
${header}

\\vspace{10pt}
${escapeLatex(dateLine)}

${paragraphs.join("\n\n")}
\\end{document}
`;
}
