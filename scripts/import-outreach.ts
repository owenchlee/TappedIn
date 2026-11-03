// Loads private/startup-outreach.md into the Outreach page. Safe to re-run: skips companies already there.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { SIGNATURE } from "@/lib/outreach";

const text = readFileSync("private/startup-outreach.md", "utf8").replace(/^﻿/, "");
const subject = /Shared subject line[^\n]*\n\*\*(.+?)\*\*/.exec(text)?.[1] ?? "";
const sections = text.split(/^## \d+\. /m).slice(1);

async function main() {
  let added = 0;
  for (const sec of sections) {
    const lines = sec.split("\n");
    const head = /^(.+?) \((.+?)\): (.+)$/.exec(lines[0]);
    if (!head) continue;
    const [, company, location, about] = head;
    if (await prisma.outreachEmail.findFirst({ where: { company } })) continue;
    const bullets = lines.filter((l) => l.startsWith("- "));
    const to = bullets.find((l) => l.startsWith("- To: "))?.slice(6) ?? "";
    const resume = /Resume: (\w+)/.exec(bullets.join("\n"))?.[1] ?? "software";
    const notes = bullets
      .filter((l) => !l.startsWith("- To: ") && !l.startsWith("- Resume:"))
      .map((l) => l.slice(2))
      .join("\n");
    const email = /Public email: (\S+?)[.\s]*$/m.exec(to)?.[1] ?? /Public email: ([^\s,;]+)/.exec(to)?.[1]?.replace(/\.$/, "") ?? "";
    const contactName = to.split(/[.(,]| Public| X @| LinkedIn| linkedin|No public/)[0].replace(/\s+and\s+.*/, "").trim();
    const body = lines.filter((l) => !l.startsWith("- ")).join("\n").trim();
    await prisma.outreachEmail.create({
      data: { company, location, about, contactName, contactInfo: to, email, resume, subject, notes, body: `${body}\n\n${SIGNATURE}` },
    });
    added++;
  }
  console.log(`Added ${added} of ${sections.length} outreach emails.`);
}
main().then(() => process.exit(0));
