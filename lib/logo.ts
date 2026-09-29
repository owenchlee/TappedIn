// Hosts that serve many companies' job pages — their favicon is the ATS's, not the employer's.
const ATS_HOST_RE =
  /(myworkdayjobs|workday|greenhouse|lever\.co|ashbyhq|icims|smartrecruiters|workable|oraclecloud|successfactors|taleo|jobvite|rippling|bamboohr|recruitee|teamtailor|breezy|jazzhr|applytojob|ultipro|ukg|paylocity|adp|dayforce|eightfold|phenom|github|simplify|waterlooworks|linkedin|indeed|glassdoor|wellfound|notion\.site|google\.com|forms\.gle|typeform)/i;

const TWO_PART_TLDS = new Set(["co.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "com.sg"]);

function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** Best guess at the employer's own domain, or null when the only thing we know is an ATS host. */
export function companyDomain(url: string | null | undefined, company: string): string | null {
  if (url) {
    try {
      const host = new URL(url).hostname;
      if (!ATS_HOST_RE.test(host)) return registrableDomain(host);
    } catch {
      // fall through to the name guess
    }
  }
  // A single-word company name is usually its own .com (Ciena, Kinaxis, Cohere); multi-word names
  // ("Royal Bank of Canada") rarely are, and a wrong logo is worse than a monogram.
  const word = company.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^[a-z0-9]+$/.test(company.trim().toLowerCase().replace(/[.,]|\s+(inc|ltd|llc|corp)\.?$/g, "")) && word.length >= 3) {
    return `${word}.com`;
  }
  return null;
}

const HUES = [262, 200, 160, 24, 330, 45, 190, 290, 12, 140];

export function monogramHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function monogram(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
