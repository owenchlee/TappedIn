import { describe, expect, it } from "vitest";
import { TERMS, danglingBullets, findTerm, jdKeywords, jdLines, scoreResume, texEntries, verdict } from "@/lib/autoapply/ats";

const term = (name: string) => TERMS.find((t) => t.name === name)!;
const count = (text: string, name: string) => [...findTerm(text, term(name)).values()].reduce((a, b) => a + b, 0);

describe("findTerm", () => {
  it("matches aliases on word boundaries, with plurals", () => {
    expect(count("Built REST APIs in Node.js", "REST API")).toBe(1);
    expect(count("Built REST APIs in Node.js", "Node.js")).toBe(1);
    expect(count("C/C++ and Python", "C++")).toBe(1);
    expect(count("C/C++ and Python", "C")).toBe(1);
    expect(count("Objective-C", "C")).toBe(0);
    expect(count("JavaScript", "Java")).toBe(0);
  });

  it("doesn't mistake English words for case-sensitive skills", () => {
    expect(count("Ready to react to feedback and express interest", "React")).toBe(0);
    expect(count("Ready to react to feedback and express interest", "Express")).toBe(0);
    expect(count("Go above and beyond", "Go")).toBe(0);
    expect(count("Python, Go, or Rust", "Go")).toBe(1);
    expect(count("Built with React and Express", "React")).toBe(1);
    expect(count("Built with React and Express", "Express")).toBe(1);
  });

  it("counts an alias inside a longer one once", () => {
    expect(count("Node.js", "Node.js")).toBe(1);
  });
});

describe("jdLines / jdKeywords", () => {
  const jd = `Acme Robotics
Acme is powering AI breakthroughs for everyone.
Responsibilities
Build embedded firmware in C++.
Qualifications
- Experience with Python and Git
Nice to have
- Docker
Benefits
- Free Kubernetes stickers`;

  it("tags sections, treating the intro before the first heading as boilerplate", () => {
    const tags = Object.fromEntries(jdLines(jd).map((l) => [l.text, l.priority]));
    expect(tags["Acme is powering AI breakthroughs for everyone."]).toBe("boilerplate");
    expect(tags["Build embedded firmware in C++."]).toBe("general");
    expect(tags["- Experience with Python and Git"]).toBe("required");
    expect(tags["- Docker"]).toBe("preferred");
    expect(tags["- Free Kubernetes stickers"]).toBe("boilerplate");
  });

  it("weights required over preferred and boosts title terms", () => {
    const kws = jdKeywords(jd, "Firmware Intern");
    const w = (n: string) => kws.find((k) => k.name === n)?.weight;
    expect(w("Python")).toBeGreaterThan(w("Docker")!);
    expect(w("Firmware")).toBeGreaterThan(w("Python")!);
    expect(w("Kubernetes")).toBeLessThan(1);
  });
});

const tex = String.raw`\begin{document}
\begin{center} \textbf{Owen Lee} \end{center}
\section{\textbf{Education}}
  \resumeProjectHeading{\textbf{University of Waterloo} $|$ BASc}{Waterloo, ON $|$ Sep. 2026 -- June 2031}
\section{\textbf{Projects}}
  \resumeProjectHeading{\textbf{Flick} $|$ \emph{Python, OpenCV}}{}
    \resumeItemListStart
      \resumeItem{Built a Python gesture app with \textbf{5} gestures and OpenCV tracking for playback}
      \resumeItem{Responsible for various things}
    \resumeItemListEnd
\section{\textbf{Experience}}
  \resumeProjectHeading{\textbf{Founder} $|$ Catch Em Crate}{Markham, ON $|$ June -- Sep. 2025}
    \resumeItemListStart
      \resumeItem{Built an e-commerce site with JavaScript serving \textbf{200+} users}
    \resumeItemListEnd
\end{document}`;

describe("texEntries", () => {
  it("pulls entries and brace-matched bullets per section", () => {
    const e = texEntries(tex);
    expect(e.map((x) => [x.section, x.name])).toEqual([
      ["Education", "University of Waterloo"],
      ["Projects", "Flick"],
      ["Experience", "Founder"],
    ]);
    expect(e[1].bullets[0]).toBe("Built a Python gesture app with 5 gestures and OpenCV tracking for playback");
  });
});

describe("danglingBullets", () => {
  it("flags a bullet whose wrapped line holds a word or two", () => {
    const layout = `   • Cut cold search latency from 5 s to 700 ms with a two-phase fetch, measured with perf

     instrumentation
   • A bullet that fits on one line
 Next Entry`;
    expect(danglingBullets(layout)).toEqual(["Cut cold search latency from 5 s to"]);
  });
});

describe("scoreResume", () => {
  const pdfText = `Owen Lee
linkedin.com/in/owenchlee | itsowenchlee@gmail.com
Education
University of Waterloo | BASc Sep. 2026 – June 2031
Projects
Flick | Python, OpenCV
• Built a Python gesture app with 5 gestures and OpenCV tracking for playback
• Responsible for various things
Experience
Founder | Catch Em Crate June – Sep. 2025
• Built an e-commerce site with JavaScript serving 200+ users
Skills
Languages: Python, JavaScript, Java
`.repeat(1);
  const jd = `Qualifications
- Python, Java and React
- machine learning`;

  const report = scoreResume({ tex, pdfText, layoutText: "", jd, role: "Software Intern", sourceText: "Python Java JavaScript React OpenCV" });

  it("only counts keywords Owen's sources back, and credits in-context use over Skills-only", () => {
    expect(report.missing).toEqual(["React"]);
    expect(report.hits.find((h) => h.name === "Machine Learning")?.attainable).toBe(false);
    expect(report.hits.find((h) => h.name === "Java")?.inContext).toBe(false);
    expect(report.keywords).toBeLessThan(100);
    expect(report.rawMatch).toBeLessThan(report.keywords);
  });

  it("flags filler bullets and a start month with no year", () => {
    const msgs = report.issues.map((i) => i.msg).join("\n");
    expect(msgs).toMatch(/Responsible for various things/);
    expect(msgs).toMatch(/give the start month no year/);
  });

  it("doesn't pass without a recruiter review, and passes a clean report with one", () => {
    expect(verdict(report, null).passed).toBe(false);
    const clean = { ...report, keywords: 95, scan: 95, parse: 100, issues: [] };
    expect(verdict(clean, 9).passed).toBe(true);
    expect(verdict(clean, 6).passed).toBe(false);
  });
});
