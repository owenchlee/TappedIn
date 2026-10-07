// U.S. jobs only count for Owen (Canadian) when the company will get him a visa (J-1, or H-1B/TN
// later). Most internship postings never say; these companies routinely bring Canadian and other
// international interns to the U.S., so their silence means "yes". Defense contractors, government
// labs and firms that hire U.S. persons only are deliberately missing. Pure module.
import { normalizeText, sponsorship } from "@/lib/fit/requirements";
import { eligibilityWarnings } from "./eligibility";

const KNOWN_SPONSORS = [
  // Big tech
  "Google", "Microsoft", "Amazon", "Meta", "Apple", "NVIDIA", "Intel", "AMD", "Qualcomm", "Adobe", "Salesforce", "Oracle", "IBM", "Cisco",
  "TikTok", "ByteDance", "Waymo", "Uber", "Lyft", "Airbnb", "Netflix", "LinkedIn", "Snap", "Pinterest", "Spotify", "Intuit", "PayPal",
  "Expedia Group", "Roblox", "Electronic Arts", "Epic Games", "Atlassian", "Shopify", "Marvell", "Western Digital", "Workday", "ServiceNow",
  // Startups and scale-ups
  "Stripe", "Databricks", "Snowflake", "Datadog", "Rippling", "Palantir", "Robinhood", "Coinbase", "Affirm", "Notion", "Figma", "Duolingo",
  "Scale AI", "Glean", "Harvey", "Together AI", "Decagon", "Sierra", "xAI", "OpenAI", "Anthropic", "Klaviyo", "DraftKings", "Tanium",
  "Superhuman", "C3.ai", "Verkada", "Ramp", "Plaid", "Brex", "Cloudflare", "MongoDB", "HubSpot", "Twilio", "Square", "Block", "Instacart",
  "DoorDash", "Faire", "Asana", "Dropbox", "Slack", "Zoom", "Okta", "Wealthsimple", "Cohere",
  // Trading and finance
  "Jane Street", "Citadel", "Citadel Securities", "Two Sigma", "Hudson River Trading", "Jump Trading", "Optiver", "IMC Trading", "Akuna Capital",
  "Akuna Capital University", "DRW", "Five Rings Capital", "Chicago Trading Company", "AQR Capital Management", "Belvedere Trading",
  "Old Mission", "Virtu Financial", "D. E. Shaw", "Tower Research Capital", "Goldman Sachs", "Morgan Stanley", "Bloomberg", "Capital One",
  // Canadian companies hiring in the U.S.
  "Royal Bank of Canada", "TD Bank",
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SPONSORS = new Set(KNOWN_SPONSORS.map(norm));

export function knownSponsor(company: string): boolean {
  return SPONSORS.has(norm(company));
}

/**
 * Whether Owen could take this U.S. job: never if it's for U.S. citizens, needs a clearance or says
 * there's no sponsorship; yes if it says it sponsors, or if it's silent and the company is a known sponsor.
 */
export function usVisaOk(company: string, postingText: string): boolean {
  if (eligibilityWarnings(postingText, "us").length > 0) return false;
  const sp = sponsorship(normalizeText(postingText));
  return sp === "yes" || (sp === null && knownSponsor(company));
}
