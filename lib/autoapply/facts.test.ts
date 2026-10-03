import { describe, expect, it } from "vitest";
import { confirmedExperience, factProblems, letterNumberProblems, numbersIn } from "@/lib/autoapply/facts";

const base = String.raw`\documentclass{article}
\begin{document}
\section{\textbf{Skills}}
 \textbf{Languages}{: Python, JavaScript/TypeScript, SQL} \\
 \textbf{Tools}{: Git/GitHub, pytest}
\section{\textbf{Projects}}
  \resumeProjectHeading
    {\textbf{SingScore} $|$ \emph{React, FastAPI, PyTorch}}{}
    \resumeItem{Reached \textbf{98.2\%} agreement across \textbf{1,800} attendees}
\end{document}`;

const experienceMd = `# Bank
## Facts
- Built FoodFindr, validated across 263 restaurants.
## Unconfirmed
- Kubernetes at scale, 10000 users
`;

const sources = { tex: [base], experienceMd };

describe("factProblems", () => {
  it("passes the base resume itself and harmless rewording or reordering", () => {
    expect(factProblems(base, sources)).toEqual([]);
    const reworded = base
      .replace("Reached", "Achieved")
      .replace("JavaScript/TypeScript", "TypeScript/JavaScript")
      .replace("{: Python, ", "{: SQL, Python, ");
    expect(factProblems(reworded, sources)).toEqual([]);
  });

  it("accepts numbers backed by experience.md", () => {
    expect(factProblems(base.replace("Reached", "Validated 263 places and reached"), sources)).toEqual([]);
  });

  it("flags an invented metric", () => {
    const p = factProblems(base.replace("98.2", "99.5"), sources);
    expect(p.join()).toMatch(/numbers.*99\.5/);
  });

  it("flags a skill that isn't in the sources, including ones only listed as Unconfirmed", () => {
    expect(factProblems(base.replace("SQL}", "SQL, Rust}"), sources).join()).toMatch(/skills.*Rust/);
    expect(factProblems(base.replace("SQL}", "SQL, Kubernetes}"), sources).join()).toMatch(/Kubernetes/);
    expect(factProblems(base.replace("{React, FastAPI", "{React, Django"), sources).join()).toMatch(/Django/);
  });

  it("flags an invented project or employer", () => {
    expect(factProblems(base.replace("{SingScore}", "{Google}"), sources).join()).toMatch(/entries.*Google/);
  });
});

describe("helpers", () => {
  it("normalizes numbers", () => {
    expect([...numbersIn("1,800 people, 98.2% and $5,700")]).toEqual(["1800", "98.2", "5700"]);
  });

  it("drops Unconfirmed sections from experience.md", () => {
    expect(confirmedExperience(experienceMd)).not.toMatch(/Kubernetes/);
    expect(confirmedExperience(experienceMd)).toMatch(/FoodFindr/);
  });
});

describe("letterNumberProblems", () => {
  it("flags only numbers the sources don't have", () => {
    expect(letterNumberProblems("Validated across 263 restaurants with 98.2% agreement.", sources)).toEqual([]);
    expect(letterNumberProblems("Served 5,000 users.", sources)).toEqual(["5000"]);
    expect(letterNumberProblems("Applying for Summer 2027.", sources)).toEqual([]);
  });
});
