// Resume scorer: what an applicant tracking system pulls out of the PDF, and what a recruiter sees in
// the first few seconds. Pure module (no fs, no child processes) so it's unit-tested; the runner
// (scripts/autoapply.ts) feeds it the pdftotext output and loops rewrites until it passes.
//
// Research behind the checks (Oct 2026):
// - Most ATSs don't auto-reject; they parse the file into fields, then recruiters search and rank by
//   keyword (Enhancv survey: 92% of recruiters review manually; knockout questions are eligibility
//   only). So the real gate is (1) parsing cleanly and (2) ranking high on keyword search.
// - Taleo matches keywords literally, Lever stems and ranks by terms appearing close together,
//   Workday/iCIMS/SuccessFactors normalize to a skills taxonomy, Greenhouse doesn't auto-score.
//   Safe for all: use the posting's exact spelling, in plain text, in context (bullets), not only
//   in a skills list.
// - Jobscan weighs hard skills first, then title, then soft skills, and suggests a 75%+ match;
//   2026 data ties 75+ match scores to ~2.4x callbacks and <60 to keyword gaps.
// - Workday's top parse failures: multi-column layouts, nonstandard headings, dates it can't read
//   (it computes tenure from them). LaTeX traps: ligature glyphs and icon fonts extracting as junk.
// - Ladders eye tracking (2018): a 7.4 s first pass in an F/E pattern: across the top, then down the
//   left edge (titles, employers, dates, first words of bullets). Simple single-column layouts with
//   bold titles and bulleted, quantified wins did best; clutter and long lines did worst.
// - Recruiters and Google's X-Y-Z formula: start with an action verb, say what you built and with
//   what, and the measured result.

const BEGIN_DOC = "\\begin{document}";

// ---------------------------------------------------------------- keyword taxonomy

/**
 * Canonical name first, then the spellings that count as the same skill. Plain aliases match
 * case-insensitively on word boundaries (with an optional plural "s"); "=Alias" is case-sensitive
 * (for words that are also English: React, Express, Swift); "/regex" is a raw pattern.
 */
const HARD: string[][] = [
  // languages
  ["Python"], ["Java", "=Java"], ["JavaScript", "JS", "ECMAScript"], ["TypeScript", "TS"], ["C++", "cpp"], ["C", "=C"],
  ["C#", "csharp"], ["Go", "Golang", "/\\bGo(?=\\s*[,/)]|\\s+(?:and|or)\\b)"], ["Rust", "=Rust"], ["Kotlin"], ["Swift", "=Swift"],
  ["Objective-C"], ["Ruby", "=Ruby"], ["PHP"], ["Scala"], ["R", "/\\bR(?=\\s*[,/)]|\\s+(?:and|or|programming)\\b)"],
  ["MATLAB"], ["SQL"], ["HTML", "HTML5"], ["CSS", "CSS3"], ["Bash", "shell scripting", "Shell"], ["PowerShell"], ["Dart"],
  ["Lua"], ["Haskell"], ["Julia", "=Julia"], ["Assembly", "ASM"], ["Verilog", "SystemVerilog"], ["VHDL"], ["Solidity"],
  ["GameMaker Language", "GML"], ["LaTeX"],
  // web / app frameworks
  ["React", "=React", "React.js", "ReactJS"], ["React Native"], ["Next.js", "NextJS"], ["Vue", "=Vue", "Vue.js"], ["Angular", "=Angular"],
  ["Svelte"], ["Node.js", "NodeJS", "=Node"], ["Express", "Express.js", "/\\bExpress\\b(?! (?:your|interest|yourself|written))"],
  ["Django"], ["Flask", "=Flask"], ["FastAPI"], ["Spring Boot", "Spring Framework"], [".NET", "ASP.NET", "dotnet"], ["Ruby on Rails", "Rails"],
  ["Tailwind", "Tailwind CSS", "TailwindCSS"], ["Redux"], ["GraphQL"], ["REST API", "REST", "RESTful", "RESTful API"], ["gRPC"],
  ["WebSocket", "WebSockets"], ["Web Audio API"], ["jQuery"], ["Bootstrap", "=Bootstrap"], ["Flutter"], ["Electron", "=Electron"],
  ["Unity", "=Unity", "Unity3D"], ["Unreal Engine", "Unreal"], ["Godot"], ["Shopify"], ["WordPress"], ["three.js", "threejs"],
  ["Dash", "=Dash", "Plotly Dash"], ["PyQt", "Qt", "PySide"], ["Tkinter", "CustomTkinter"], ["Prisma", "=Prisma"],
  // data / ML
  ["Machine Learning", "ML", "=ML"], ["Deep Learning"], ["Artificial Intelligence", "=AI"], ["Computer Vision"],
  ["Natural Language Processing", "NLP"], ["Large Language Models", "LLM", "LLMs"], ["Generative AI", "GenAI"], ["Reinforcement Learning"],
  ["PyTorch"], ["TensorFlow"], ["Keras"], ["scikit-learn", "sklearn"], ["pandas"], ["NumPy"], ["SciPy"], ["Matplotlib"],
  ["OpenCV"], ["MediaPipe"], ["Hugging Face", "HuggingFace", "Transformers"], ["LangChain"], ["RAG", "retrieval-augmented generation"],
  ["Jupyter", "Jupyter Notebook"], ["Spark", "=Spark", "Apache Spark", "PySpark"], ["Hadoop"], ["Kafka"], ["Airflow"], ["dbt", "=dbt"],
  ["Data Analysis", "data analytics"], ["Data Visualization"], ["Statistics", "statistical analysis"], ["A/B Testing", "AB testing", "experimentation"],
  ["Tableau"], ["Power BI", "PowerBI"], ["Excel", "=Excel", "Microsoft Excel", "spreadsheets"], ["Looker"], ["ETL"], ["Data Pipelines", "data pipeline"],
  ["CUDA"], ["ONNX"], ["Signal Processing", "DSP"],
  // databases / cloud / devops
  ["PostgreSQL", "Postgres"], ["MySQL"], ["SQLite"], ["MongoDB", "Mongo"], ["Redis"], ["NoSQL"], ["DynamoDB"], ["Firebase"], ["Supabase"],
  ["Dexie", "IndexedDB"], ["InfluxDB"], ["Grafana"], ["Elasticsearch"], ["Snowflake"], ["BigQuery"],
  ["AWS", "Amazon Web Services"], ["GCP", "Google Cloud", "Google Cloud Platform"], ["Azure", "=Azure", "Microsoft Azure"], ["Vercel"],
  ["Docker", "containers", "containerization"], ["Kubernetes", "k8s"], ["Terraform"], ["CI/CD", "continuous integration", "CI", "=CI"],
  ["GitHub Actions"], ["Jenkins"], ["Linux", "Unix"], ["Git", "=Git", "GitHub", "GitLab", "version control"], ["Nginx"], ["Serverless", "Lambda", "=Lambda"],
  ["Microservices"], ["Distributed Systems"], ["Cloud Computing", "cloud services", "=cloud"],
  // software practice
  ["Data Structures"], ["Algorithms"], ["Object-Oriented Programming", "OOP", "object-oriented"], ["Unit Testing", "unit tests", "test-driven", "TDD"],
  ["pytest"], ["Jest"], ["JUnit"], ["Selenium"], ["Cypress"], ["Playwright"], ["Automated Testing", "test automation", "automated tests"],
  ["Debugging"], ["Performance Optimization", "latency", "profiling"], ["Caching", "cache"], ["APIs", "API", "=API"], ["Full-Stack", "full stack", "fullstack"],
  ["Frontend", "front-end", "front end"], ["Backend", "back-end", "back end"], ["Mobile Development", "mobile app", "iOS", "Android", "=Android"],
  ["Web Development", "web applications", "web app"], ["System Design"], ["Concurrency", "multithreading"], ["Networking", "TCP/IP", "TCP", "UDP", "HTTP", "HTTPS"],
  ["Security", "cybersecurity"], ["Embedded Linux"], ["Compilers"], ["Operating Systems", "OS concepts"], ["JSON"], ["Protobuf", "protocol buffers"],
  ["Code Review", "code reviews"], ["Documentation", "technical documentation"], ["Rendering", "graphics", "OpenGL", "Vulkan", "DirectX", "shaders"],
  ["Game Development", "game engine", "gameplay"], ["Simulation", "simulator", "SITL", "software-in-the-loop"], ["Hardware-in-the-Loop", "HIL", "CHIL"],
  ["Automation", "automated"], ["Scripting", "scripts"], ["GUI", "graphical user interface"], ["Claude API", "Anthropic API", "OpenAI API"],
  ["Google Maps API", "Google Maps", "Places API"], ["Behavior Trees", "behavior tree"],
  // hardware / embedded / robotics
  ["Embedded Systems", "embedded", "embedded software"], ["Firmware"], ["Microcontrollers", "microcontroller", "MCU", "microprocessor"], ["Arduino"],
  ["Raspberry Pi"], ["STM32"], ["ESP32"], ["RTOS", "FreeRTOS", "real-time operating system"], ["UART", "RS-485", "RS-232", "serial communication"],
  ["SPI", "=SPI"], ["I2C", "I²C"], ["CAN bus", "=CAN", "CAN tools"], ["Bluetooth", "BLE"], ["Wi-Fi", "WiFi"], ["Ethernet"], ["IoT", "Internet of Things"],
  ["PCB Design", "PCB", "PCBs", "printed circuit board"], ["Soldering", "soldered"], ["Circuit Design", "circuits", "schematics", "schematic capture"],
  ["Altium"], ["KiCad"], ["Eagle", "=Eagle"], ["Fritzing"], ["Oscilloscope", "scopes", "logic analyzer", "logic analyzers", "multimeter"],
  ["FPGA"], ["Analog Circuits", "analog"], ["Digital Logic", "digital circuits"], ["Power Electronics", "power systems"], ["Sensors", "sensor"],
  ["Motors", "motor control", "actuators"], ["Robotics", "robot", "robots"], ["ROS", "ROS2", "ROS 2"], ["Autonomy", "autonomous", "autonomous systems"],
  ["Drones", "drone", "UAV", "UAVs"], ["Controls", "control systems", "PID"], ["Perception"], ["SLAM"], ["Path Planning", "motion planning"], ["Kalman Filter"],
  ["CAD", "=CAD", "computer-aided design"], ["SolidWorks"], ["Fusion 360"], ["Onshape"], ["3D Printing", "3D printed", "additive manufacturing"],
  ["Simulink"], ["LabVIEW"], ["Lab Testing", "test equipment", "validation testing", "hardware validation"], ["Prototyping", "prototype", "prototypes"],
  // product / PM
  ["Product Management", "product manager", "PM", "=PM"], ["Product Roadmap", "roadmap", "roadmaps"], ["User Research", "user interviews", "customer interviews"],
  ["User Experience", "UX", "=UX"], ["User Interface", "UI", "=UI"], ["Figma"], ["Wireframing", "wireframes", "mockups"], ["Jira"], ["Confluence"], ["Notion"],
  ["Agile", "=Agile", "agile methodologies"], ["Scrum", "sprints", "sprint planning"], ["Kanban"], ["Product Requirements", "PRD", "PRDs", "requirements gathering"],
  ["Market Research", "competitive analysis"], ["KPIs", "KPI", "metrics", "OKRs"], ["Go-to-Market", "GTM", "product launch", "launches"], ["SQL Analytics", "analytics"],
  ["E-commerce", "ecommerce"], ["Stakeholder Management", "stakeholders", "cross-functional"], ["Project Management", "project planning"],
  ["Customer Feedback", "user feedback"], ["Prioritization", "prioritize"], ["Mentorship", "mentoring", "mentored"],
];

/** Weighted at half: recruiters search hard skills first (Jobscan's order: hard skills, title, soft skills). */
const SOFT: string[][] = [
  ["Communication", "communicate", "communication skills"], ["Leadership", "led", "leading"], ["Teamwork", "collaboration", "collaborate", "collaborated"],
  ["Problem Solving", "problem-solving"], ["Ownership", "owned"], ["Attention to Detail", "detail-oriented"], ["Time Management"], ["Adaptability"],
  ["Initiative"], ["Presentation", "presenting", "presented"], ["Organization", "organized"], ["Fundraising", "fundraiser"], ["Event Planning", "events"],
  ["Tutoring", "tutored", "teaching"], ["Entrepreneurship", "founder", "startup", "founded"],
];

export type Term = { name: string; soft: boolean; patterns: RegExp[] };

function compileAlias(alias: string): RegExp {
  if (alias.startsWith("/")) return new RegExp(alias.slice(1), "g");
  const caseSensitive = alias.startsWith("=");
  const a = caseSensitive ? alias.slice(1) : alias;
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+");
  const plural = /[a-z]$/i.test(a) && a.length > 3 ? "(?:e?s)?" : "";
  // A lone letter ("C") needs stricter edges: not "Objective-C", "C-suite" or "C's".
  const before = a.length === 1 ? "(?<![A-Za-z0-9\\-])" : "(?<![A-Za-z0-9])";
  const after = a.length === 1 ? "(?![A-Za-z0-9+#'\\-])" : "(?![A-Za-z0-9+#])";
  return new RegExp(`${before}${esc}${plural}${after}`, caseSensitive ? "g" : "gi");
}

/** The canonical name matches too, unless a case-sensitive or regex alias guards that same word. */
function makeTerm([name, ...aliases]: string[], soft: boolean): Term {
  const guarded = aliases.some((a) => /^[=/]/.test(a) && a.replace(/^[=/](\\b)?/, "").toLowerCase().startsWith(name.toLowerCase()));
  return { name, soft, patterns: (guarded ? aliases : [name, ...aliases]).map(compileAlias) };
}

export const TERMS: Term[] = [...HARD.map((t) => makeTerm(t, false)), ...SOFT.map((t) => makeTerm(t, true))];

/** Every spelling of the term found in the text, with counts. Overlapping aliases count once per position. */
export function findTerm(text: string, term: Term): Map<string, number> {
  const hits = new Map<number, string>();
  for (const re of term.patterns) {
    for (const m of text.matchAll(re)) if (!hits.has(m.index!)) hits.set(m.index!, m[0]);
  }
  // A longer alias at the same spot wins ("React Native" over "React" isn't this term's problem, but
  // "Node.js" over "Node" is): drop hits that sit inside another hit.
  const spans = [...hits].sort((a, b) => a[0] - b[0]);
  const forms = new Map<string, number>();
  let end = -1;
  for (const [i, s] of spans) {
    if (i < end) continue;
    end = i + s.length;
    forms.set(s, (forms.get(s) ?? 0) + 1);
  }
  return forms;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- the posting

export type JdKeyword = {
  name: string;
  soft: boolean;
  weight: number;
  /** Where the posting puts it: required, unmarked, preferred, or boilerplate (benefits, about us). */
  priority: "required" | "general" | "preferred" | "boilerplate";
  /** The posting's own spelling, which Taleo-style literal search needs. */
  jdForm: string;
  inTitle: boolean;
};

const PRIORITY_WEIGHT = { required: 3, general: 2, preferred: 1, boilerplate: 0.5 } as const;
// Prefix matches (no closing \b) so "Qualifications", "Requirements" and "Benefits" count.
const REQUIRED_HEAD = /\b(require|qualification|must|what you('ll| will)? (bring|need)|you (have|bring)|basic|minimum|who you are|looking for|you'll need|skills|experience)/i;
const PREFERRED_HEAD = /\b(prefer|nice[- ]to[- ]have|bonus|plus\b|asset|ideal|desired|desirable|extra credit)/i;
const BOILER_HEAD = /\b(benefit|perk|compensation|salary|pay range|equal (employment )?opportunit|accommodation|about (us|the company|the team)|who we are(?! looking)|our (values|mission|culture)|privacy|eeo|diversity|general information)/i;
const GENERAL_HEAD = /\b(description|responsibilit|what you('ll| will)? (do|be doing)|the role|you will|day to day|overview)/i;
const BOILER_INLINE = /\b(equal opportunity|equal employment|reasonable accommodation|we are committed to|protected (veteran|characteristic)|regardless of (race|gender)|background check)/i;
const PREFERRED_INLINE = /\b(preferred|nice[- ]to[- ]have|bonus|a plus|an asset|is an asset|ideally|desirable|valued|familiarity)\b/i;

/**
 * Splits the posting into lines tagged with the section they're under. When the posting has
 * recognizable section headings, whatever comes before the first one (company blurb, location,
 * dates) counts as boilerplate: "powering AI breakthroughs" in an intro isn't a requirement.
 */
export function jdLines(jd: string): { text: string; priority: JdKeyword["priority"] }[] {
  let section: JdKeyword["priority"] | null = null;
  const out: { text: string; priority: JdKeyword["priority"] | null }[] = [];
  for (const raw of jd.split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    const words = text.split(/\s+/).length;
    const isHeading = words <= 8 && text.length <= 70 && !/[.;,]$/.test(text) && !/^[•·*\-–]/.test(text);
    if (isHeading) {
      if (BOILER_HEAD.test(text)) section = "boilerplate";
      else if (PREFERRED_HEAD.test(text)) section = "preferred";
      else if (/description/i.test(text)) section = "general"; // "Description & Requirements" opens with the blurb
      else if (REQUIRED_HEAD.test(text)) section = "required";
      else if (GENERAL_HEAD.test(text)) section = "general";
    }
    const priority = BOILER_INLINE.test(text)
      ? "boilerplate"
      : section && section !== "boilerplate" && PREFERRED_INLINE.test(text)
        ? "preferred"
        : section;
    out.push({ text, priority });
  }
  const preamble = section == null ? "general" : "boilerplate";
  return out.map((l) => ({ text: l.text, priority: l.priority ?? preamble }));
}

export function jdKeywords(jd: string, role: string): JdKeyword[] {
  const lines = jdLines(jd);
  const out: JdKeyword[] = [];
  for (const term of TERMS) {
    let best: JdKeyword["priority"] | null = null;
    let count = 0;
    const forms = new Map<string, number>();
    for (const line of lines) {
      const f = findTerm(line.text, term);
      if (!f.size) continue;
      count += total(f);
      for (const [k, v] of f) forms.set(k, (forms.get(k) ?? 0) + v);
      if (best == null || PRIORITY_WEIGHT[line.priority] > PRIORITY_WEIGHT[best]) best = line.priority;
    }
    const inTitle = findTerm(role, term).size > 0;
    if (!best && !inTitle) continue;
    const priority = best ?? "required";
    let weight = PRIORITY_WEIGHT[priority] + 0.5 * Math.min(Math.max(count - 1, 0), 2) + (inTitle ? 3 : 0);
    if (term.soft) weight /= 2;
    const jdForm = [...forms].sort((a, b) => b[1] - a[1])[0]?.[0] ?? term.name;
    out.push({ name: term.name, soft: term.soft, weight, priority, jdForm, inTitle });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------- the resume (from the .tex)

export type Entry = { section: string; name: string; heading: string; bullets: string[]; text: string };

/** Contents of each `\cmd{...}` call, brace-matched (bullets contain \textbf{...}). */
function commandArgs(tex: string, cmd: string): { start: number; arg: string }[] {
  const out: { start: number; arg: string }[] = [];
  const re = new RegExp(`\\\\${cmd}\\s*\\{`, "g");
  for (const m of tex.matchAll(re)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const s = i;
    for (; i < tex.length && depth; i++) {
      if (tex[i] === "\\") i++;
      else if (tex[i] === "{") depth++;
      else if (tex[i] === "}") depth--;
    }
    out.push({ start: m.index!, arg: tex.slice(s, i - 1) });
  }
  return out;
}

/** Rough LaTeX → text for scoring (same idea as facts.texToText, kept local so this stays standalone). */
export function plain(tex: string): string {
  return tex
    .replace(/(?<!\\)%.*$/gm, "")
    .replace(/\\href\{[^}]*\}/g, "")
    .replace(/\$\\sim\$/g, "~")
    .replace(/\$\|\$/g, "|")
    .replace(/\\textbar\\?/g, "|")
    .replace(/\\([%$&#_{}])/g, "$1")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/[{}$]/g, " ")
    .replace(/--+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function texEntries(tex: string): Entry[] {
  const body = tex.slice(Math.max(0, tex.indexOf(BEGIN_DOC))).replace(/(?<!\\)%.*$/gm, "");
  const sections = commandArgs(body, "section").map((s) => ({ start: s.start, name: plain(s.arg) }));
  const entries: Entry[] = [];
  sections.forEach((sec, si) => {
    const chunk = body.slice(sec.start, sections[si + 1]?.start ?? body.length);
    const heads = [...chunk.matchAll(/\\resume(?:ProjectHeading|Subheading|SubHeading)\b/g)].map((m) => m.index!);
    heads.forEach((h, hi) => {
      const part = chunk.slice(h, heads[hi + 1] ?? chunk.length);
      const firstItem = part.search(/\\resumeItem(?:ListStart)?\b/);
      const heading = plain(firstItem > 0 ? part.slice(0, firstItem) : part).replace(/^resume\w*\s*/, "");
      const name = plain(/\\textbf\{([^}]*)\}/.exec(part)?.[1] ?? heading.split("|")[0]);
      const bullets = commandArgs(part, "resumeItem").map((b) => plain(b.arg));
      entries.push({ section: sec.name, name, heading, bullets, text: `${heading} ${bullets.join(" ")}` });
    });
  });
  return entries;
}

// ---------------------------------------------------------------- the report

export type Issue = {
  area: "parse" | "keywords" | "scan";
  /** True when a rewrite of the resume body can fix it (the preamble/template is locked). */
  fixable: boolean;
  msg: string;
};

export type KeywordHit = JdKeyword & { found: boolean; attainable: boolean; inContext: boolean; exactForm: boolean; resumeForms: string[]; count: number };

/** Spellings that are the same to any parser: case, plural, spaces and hyphens. */
const formKey = (s: string) => s.toLowerCase().replace(/[s-]+/g, "").replace(/(?<=[a-z]{3})e?s$/, "");

export type AtsReport = {
  parse: number;
  keywords: number;
  /** Plain match against everything the posting names, including skills Owen doesn't have. */
  rawMatch: number;
  scan: number;
  issues: Issue[];
  hits: KeywordHit[];
  /** Posting keywords Owen's experience backs but the resume doesn't show, most important first. */
  missing: string[];
  /** Required or title keywords no source backs: no honest rewrite fixes these. */
  unattainable: string[];
};

const STANDARD_HEADINGS: Record<string, RegExp> = {
  education: /^(education|academic background)$/i,
  experience: /^(experience|work experience|professional experience|employment|employment history|relevant experience|technical experience)$/i,
  projects: /^(projects|technical projects|personal projects|selected projects|relevant projects)$/i,
  skills: /^(skills|technical skills|skills (&|and) interests|core skills)$/i,
};
const OTHER_HEADINGS =
  /^(leadership|leadership (&|and) activities|activities|extracurriculars?|extracurricular experience|awards|honors|awards (&|and) honors|honors (&|and) awards|certifications?|volunteer(ing| experience)?|publications|interests|summary|profile|coursework|relevant coursework)$/i;

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const BAD_GLYPHS = /[\uFB00-\uFB06\uE000-\uF8FF\uFFFD]|\(cid:\d+\)/;

/**
 * Parse check on the text pdftotext pulls from the PDF (close to what Workday/Greenhouse parsers
 * see): readable glyphs, contact details, standard headings, dates on every dated entry.
 */
export function parseIssues(pdfText: string, entries: Entry[]): { score: number; issues: Issue[]; headings: string[] } {
  const issues: Issue[] = [];
  let score = 100;
  const lines = pdfText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (pdfText.replace(/\s/g, "").length < 300) {
    return { score: 0, headings: [], issues: [{ area: "parse", fixable: false, msg: "The PDF has almost no extractable text; an ATS would see a blank resume" }] };
  }
  const bad = BAD_GLYPHS.exec(pdfText);
  if (bad) {
    score -= 30;
    issues.push({ area: "parse", fixable: false, msg: `The PDF extracts unreadable characters (${JSON.stringify(bad[0])}); ligatures or icon fonts break keyword search` });
  }
  if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(pdfText)) {
    score -= 15;
    issues.push({ area: "parse", fixable: false, msg: "No email address found in the text" });
  }
  if (!/linkedin\.com\/in\//i.test(pdfText)) {
    score -= 3;
    issues.push({ area: "parse", fixable: false, msg: "No LinkedIn URL found in the text" });
  }
  if (!/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(pdfText)) {
    issues.push({ area: "parse", fixable: false, msg: "No phone number on the resume (fine; application forms ask for it separately)" });
  }
  if (lines[0] && /@|\d|\|/.test(lines[0])) {
    score -= 10;
    issues.push({ area: "parse", fixable: false, msg: "The first line isn't your name, so parsers may misread the contact block" });
  }

  const headings = lines.filter((l) => l.length < 40 && (Object.values(STANDARD_HEADINGS).some((r) => r.test(l)) || OTHER_HEADINGS.test(l)));
  const sectionNames = [...new Set(entries.map((e) => e.section))];
  for (const [key, re] of Object.entries(STANDARD_HEADINGS)) {
    if (key === "projects") continue;
    if (!lines.some((l) => re.test(l))) {
      score -= key === "skills" ? 5 : 10;
      issues.push({ area: "parse", fixable: false, msg: `No standard "${key[0].toUpperCase()}${key.slice(1)}" heading found` });
    }
  }
  for (const name of sectionNames) {
    if (Object.values(STANDARD_HEADINGS).some((r) => r.test(name)) || OTHER_HEADINGS.test(name)) continue;
    score -= 2;
    issues.push({
      area: "parse",
      fixable: false,
      msg: `"${name}" isn't a heading ATSs map to a field, so its entries may land in a catch-all (humans read it fine; "Leadership" or "Extracurricular Experience" parse more reliably)`,
    });
  }

  // Dated entries: Workday computes tenure from dates, and a start month with no year can't be read.
  for (const e of entries) {
    if (/project/i.test(e.section) || /award/i.test(e.section)) continue;
    if (!/\b(19|20)\d{2}\b/.test(e.heading)) {
      score -= 4;
      issues.push({ area: "parse", fixable: false, msg: `"${e.name}" has no dates` });
      continue;
    }
    const range = new RegExp(`\\b(${MONTH})\\s*[-–]\\s*(${MONTH}|Present)\\s*((19|20)\\d{2})?`, "i").exec(e.heading);
    if (range && !new RegExp(`${MONTH}\\s+(19|20)\\d{2}\\s*[-–]`, "i").test(e.heading)) {
      score -= 3;
      issues.push({
        area: "parse",
        fixable: true,
        msg: `"${e.name}" dates "${range[0].trim()}" give the start month no year; write the year on both ends (e.g. "June 2025 -- Sep. 2025") so parsers can compute the duration`,
      });
    }
  }
  return { score: Math.max(0, score), issues, headings };
}

const STRONG_VERBS = new Set(
  `achieved accelerated analyzed architected assembled authored automated benchmarked boosted built calibrated championed coded collaborated
  combined compiled completed configured constructed converted coordinated created cut debugged decreased defined delivered deployed designed
  developed devised diagnosed directed doubled drove earned eliminated enabled engineered established evaluated expanded experimented fabricated
  flew founded generated grew guided halved identified implemented improved increased initiated integrated introduced investigated launched led
  maintained managed mapped measured mentored migrated modeled modernized optimized orchestrated organized overhauled partnered piloted pitched
  planned presented produced programmed prototyped published raised ran rebuilt redesigned reduced refactored resolved restructured revamped
  scaled secured shipped simplified simulated soldered solved spearheaded standardized streamlined structured taught tested trained transformed
  tuned tutored unified upgraded validated visualized won wrote separated tailored chained cleaned extended added adapted wired`.split(/\s+/),
);
const WEAK_STARTS = new Set(
  `helped assisted worked participated responsible involved tasked did made used utilized was were handled tried attended learned gained exposed
  familiarized supported contributed`.split(/\s+/),
);
const WEAK_PHRASES = /\b(responsible for|helped (to )?|worked on|various|etc\.?|duties included|in charge of|familiar with|exposure to|team player|hard[- ]working|detail[- ]oriented|passionate|go-getter|synergy|leverag(e|ed|ing)|utiliz(e|ed|ing))\b/i;
const FIRST_PERSON = /\b(I|me|my|we|our)\b/;

/**
 * Bullets whose last wrapped line holds one or two words, from pdftotext -layout output. A dangling
 * word wastes a line and makes the right edge ragged, the clutter the eye-tracking study penalized.
 */
export function danglingBullets(layoutText: string): string[] {
  const lines = layoutText.split(/\r?\n/);
  const out: string[] = [];
  let current: { indent: number; first: string; last: string } | null = null;
  const flush = () => {
    if (current && current.last && current.last.split(/\s+/).length <= 2) out.push(current.first);
    current = null;
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.search(/\S/);
    const t = line.trim();
    if (t.startsWith("•")) {
      flush();
      current = { indent, first: t.slice(1).trim().split(/\s+/).slice(0, 8).join(" "), last: "" };
    } else if (current && indent > current.indent) {
      current.last = t.split(/\s{3,}/)[0];
    } else flush();
  }
  flush();
  return out;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const snippet = (s: string) => `"${words(s).slice(0, 8).join(" ")}..."`;

export function scoreResume(input: {
  tex: string;
  pdfText: string;
  layoutText: string;
  jd: string;
  role: string;
  /** Every source Owen's claims may come from: confirmed experience.md plus the base resumes' bodies. */
  sourceText: string;
}): AtsReport {
  const entries = texEntries(input.tex);
  const parse = parseIssues(input.pdfText, entries);
  const issues: Issue[] = [...parse.issues];

  // ---- keywords, matched in the PDF text (what the ATS indexes), split into Skills vs in-context
  const kws = jdKeywords(input.jd, input.role);
  const lines = input.pdfText.split(/\r?\n/);
  let section = "";
  let skillsText = "";
  let contextText = "";
  for (const line of lines) {
    const t = line.trim();
    if (STANDARD_HEADINGS.skills.test(t)) section = "skills";
    else if (Object.values(STANDARD_HEADINGS).some((r) => r.test(t)) || OTHER_HEADINGS.test(t) || entries.some((e) => e.section === t)) section = t;
    if (section === "skills") skillsText += `${line}\n`;
    else contextText += `${line}\n`;
  }
  const hits: KeywordHit[] = kws.map((k) => {
    const term = TERMS.find((t) => t.name === k.name)!;
    const inCtx = findTerm(contextText, term);
    const inSkills = findTerm(skillsText, term);
    const all = new Map([...inSkills]);
    for (const [f, n] of inCtx) all.set(f, (all.get(f) ?? 0) + n);
    // The posting's own spelling only counts against the resume if Owen's sources use it too; otherwise
    // writing it would be a new, unbacked claim the fact check rejects ("version control" for Git).
    const sourceSaysIt = [...findTerm(input.sourceText, term).keys()].some((f) => formKey(f) === formKey(k.jdForm));
    const exactForm = !sourceSaysIt || [...all.keys()].some((f) => formKey(f) === formKey(k.jdForm));
    return {
      ...k,
      resumeForms: [...all.keys()],
      found: all.size > 0,
      inContext: inCtx.size > 0,
      exactForm,
      count: total(all),
      attainable: all.size > 0 || findTerm(input.sourceText, term).size > 0,
    };
  });
  // Soft skills are shown by the bullets, not by writing "communication"; they're reported, not scored.
  const attainable = hits.filter((h) => h.attainable && !h.soft);
  const credit = (h: KeywordHit) => (!h.found ? 0 : (h.inContext ? 1 : 0.75) * (h.exactForm ? 1 : 0.9));
  const wSum = (hs: KeywordHit[]) => hs.reduce((a, h) => a + h.weight, 0);
  const keywords = attainable.length ? Math.round((100 * attainable.reduce((a, h) => a + h.weight * credit(h), 0)) / wSum(attainable)) : 100;
  const rawMatch = hits.length ? Math.round((100 * hits.reduce((a, h) => a + h.weight * (h.found ? 1 : 0), 0)) / wSum(hits)) : 100;

  const missing = attainable.filter((h) => !h.found).map((h) => h.name);
  const unattainable = hits.filter((h) => !h.attainable && !h.soft && (h.priority === "required" || h.inTitle)).map((h) => h.name);
  const top = attainable.filter((h) => !h.soft).slice(0, 12);
  for (const h of attainable.filter((x) => !x.found && x.weight >= 1.5).slice(0, 10)) {
    issues.push({
      area: "keywords",
      fixable: true,
      msg: `The posting asks for "${h.jdForm}" (${h.priority}${h.inTitle ? ", in the job title" : ""}) and experience.md backs it, but the resume never says it`,
    });
  }
  for (const h of top.filter((x) => x.found && !x.inContext && !x.soft).slice(0, 6)) {
    issues.push({ area: "keywords", fixable: true, msg: `"${h.jdForm}" only appears in Skills; show it in a bullet or project line where you really used it` });
  }
  for (const h of top.filter((x) => x.found && !x.exactForm)) {
    issues.push({
      area: "keywords",
      fixable: true,
      msg: `The posting says "${h.jdForm}" but the resume only says "${h.resumeForms.join('", "')}"; use the posting's wording at least once (literal-match ATSs like Taleo treat other spellings, and acronym vs spelled out, as different skills)`,
    });
  }
  for (const h of hits.filter((x) => x.count > 8)) {
    issues.push({ area: "keywords", fixable: true, msg: `"${h.name}" appears ${h.count} times; that reads as keyword stuffing, keep it to where it matters` });
  }

  // ---- recruiter scan, from the .tex bullets
  const bullets = entries.flatMap((e) => e.bullets.map((b) => ({ entry: e, b })));
  let scanPts = 0;
  let scanMax = 0;
  const part = (pts: number, max: number) => {
    scanPts += Math.max(0, Math.min(pts, max));
    scanMax += max;
  };
  if (bullets.length) {
    const leadVerb = (b: string) => words(b)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const weakLead = bullets.filter(({ b }) => {
      const v = leadVerb(b);
      return WEAK_STARTS.has(v) || !(STRONG_VERBS.has(v) || (v.endsWith("ed") && v.length > 4));
    });
    part(20 * (1 - weakLead.length / bullets.length), 20);
    for (const { b } of weakLead.slice(0, 5)) issues.push({ area: "scan", fixable: true, msg: `${snippet(b)} doesn't open with a strong past-tense action verb` });

    const withNumber = bullets.filter(({ b }) => /\d/.test(b)).length;
    part(20 * Math.min(1, withNumber / bullets.length / 0.5), 20);
    if (withNumber / bullets.length < 0.5) {
      issues.push({
        area: "scan",
        fixable: true,
        msg: `Only ${withNumber} of ${bullets.length} bullets carry a number; where experience.md has a real figure (users, ms, %, $, count) for a bullet, put it in (never invent one)`,
      });
    }

    const tooLong = bullets.filter(({ b }) => words(b).length > 32);
    const tooShort = bullets.filter(({ b }) => words(b).length < 8);
    part(15 * (1 - (tooLong.length + tooShort.length) / bullets.length), 15);
    for (const { b } of tooLong.slice(0, 4)) issues.push({ area: "scan", fixable: true, msg: `${snippet(b)} runs ${words(b).length} words; keep bullets to two lines (about 15 to 28 words)` });
    for (const { b } of tooShort.slice(0, 3)) issues.push({ area: "scan", fixable: true, msg: `${snippet(b)} is too thin to show impact` });

    const fluff = bullets.filter(({ b }) => WEAK_PHRASES.test(b) || FIRST_PERSON.test(b));
    part(10 - 3 * fluff.length, 10);
    for (const { b } of fluff.slice(0, 4)) {
      const w = WEAK_PHRASES.exec(b)?.[0] ?? FIRST_PERSON.exec(b)?.[0];
      issues.push({ area: "scan", fixable: true, msg: `${snippet(b)} uses "${w}"; cut filler and first person` });
    }

    const verbCounts = new Map<string, number>();
    for (const { b } of bullets) verbCounts.set(leadVerb(b), (verbCounts.get(leadVerb(b)) ?? 0) + 1);
    const repeated = [...verbCounts].filter(([v, n]) => v && n >= 3);
    part(5 - 2.5 * repeated.length, 5);
    for (const [v, n] of repeated) issues.push({ area: "scan", fixable: true, msg: `${n} bullets start with "${v}"; vary the opening verbs` });

    // F-pattern: the eye runs down the left edge, so the first words of a bullet should carry
    // substance (a skill the posting wants, or a number), not throat-clearing.
    const topTerms = top.map((h) => TERMS.find((t) => t.name === h.name)!);
    const strongLead = bullets.filter(({ b }) => {
      const lead = words(b).slice(0, 7).join(" ");
      return /\d/.test(lead) || topTerms.some((t) => findTerm(lead, t).size);
    }).length;
    part(10 * Math.min(1, strongLead / bullets.length / 0.5), 10);
    if (strongLead / bullets.length < 0.5) {
      issues.push({
        area: "scan",
        fixable: true,
        msg: `Only ${strongLead} of ${bullets.length} bullets get a posting keyword or a number into their first 7 words; recruiters skim the left edge, so front-load the tech and the result`,
      });
    }
  }

  const dangling = danglingBullets(input.layoutText);
  part(10 - 1.5 * dangling.length, 10);
  for (const d of dangling.slice(0, 8)) {
    issues.push({ area: "scan", fixable: true, msg: `"${d}..." wraps onto a second line holding only a word or two; tighten it to one line or fill out the second` });
  }

  // Top third of the page gets the most attention: the first entry of the first section with bullets
  // should show what this job wants.
  const bulleted = entries.filter((e) => e.bullets.length);
  if (bulleted.length && top.length) {
    const first = bulleted[0];
    const topFive = top.slice(0, 5).map((h) => TERMS.find((t) => t.name === h.name)!);
    const hit = topFive.some((t) => findTerm(first.text, t).size);
    part(hit ? 10 : 0, 10);
    if (!hit) {
      issues.push({ area: "scan", fixable: true, msg: `The first entry a recruiter sees ("${first.name}") shows none of the posting's top skills (${top.slice(0, 5).map((h) => h.jdForm).join(", ")})` });
    }
    // Reorderable sections (projects): the most relevant entry should be near the top.
    const projects = bulleted.filter((e) => /project/i.test(e.section));
    if (projects.length >= 3) {
      const rel = (e: Entry) => attainable.reduce((a, h) => a + (findTerm(e.text, TERMS.find((t) => t.name === h.name)!).size ? h.weight : 0), 0);
      const scores = projects.map(rel);
      const bestIdx = scores.indexOf(Math.max(...scores));
      const ok = bestIdx <= 1 || scores[bestIdx] - Math.max(scores[0], scores[1]) < 3;
      part(ok ? 10 : bestIdx === 2 ? 5 : 0, 10);
      if (!ok) issues.push({ area: "scan", fixable: true, msg: `"${projects[bestIdx].name}" is the most relevant project for this posting but sits at position ${bestIdx + 1}; move it up` });
    }
  }

  return {
    parse: parse.score,
    keywords,
    rawMatch,
    scan: scanMax ? Math.round((100 * scanPts) / scanMax) : 100,
    issues,
    hits,
    missing,
    unattainable,
  };
}

// ---------------------------------------------------------------- the gate

export type ResumeVerdict = {
  overall: number;
  passed: boolean;
  /** Why it didn't pass, in plain words; empty when it passed. */
  shortfalls: string[];
};

export const TARGETS = {
  keywords: Number(process.env.RESUME_TARGET_KEYWORDS ?? 80),
  scan: Number(process.env.RESUME_TARGET_SCAN ?? 85),
  /** The recruiter review's 1 to 10 "would I shortlist this" score. */
  review: Number(process.env.RESUME_TARGET_REVIEW ?? 8),
  overall: Number(process.env.RESUME_TARGET_OVERALL ?? 85),
};

/**
 * Overall = parse 15%, keywords 40%, recruiter scan 25%, recruiter review 20% (the review is
 * skipped until the deterministic checks pass, to save runs). Passing needs each fixable part at
 * target and no fixable parse issue left; template-level parse issues are reported, not looped on,
 * since the preamble is locked.
 */
export function verdict(r: AtsReport, review: number | null): ResumeVerdict {
  const parts: [number, number][] = [[r.parse, 0.15], [r.keywords, 0.4], [r.scan, 0.25]];
  if (review != null) parts.push([review * 10, 0.2]);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const overall = Math.round(parts.reduce((a, [v, x]) => a + v * x, 0) / w);
  const shortfalls: string[] = [];
  if (r.keywords < TARGETS.keywords) shortfalls.push(`keyword match ${r.keywords} (target ${TARGETS.keywords})`);
  if (r.scan < TARGETS.scan) shortfalls.push(`recruiter scan ${r.scan} (target ${TARGETS.scan})`);
  if (r.issues.some((i) => i.area === "parse" && i.fixable)) shortfalls.push("fixable parsing issues");
  if (review == null) shortfalls.push("no recruiter review yet");
  else if (review < TARGETS.review) shortfalls.push(`recruiter review ${review}/10 (target ${TARGETS.review})`);
  if (overall < TARGETS.overall) shortfalls.push(`overall ${overall} (target ${TARGETS.overall})`);
  return { overall, passed: shortfalls.length === 0, shortfalls };
}
