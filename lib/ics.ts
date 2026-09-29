import type { AgendaItem } from "@/lib/data/agenda";
import { storageToDateInput } from "@/lib/deadline";

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** RFC 5545 lines must be ≤75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function dateValue(d: Date): string {
  return storageToDateInput(d).replace(/-/g, "");
}

function dateTimeValue(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nextDay(d: Date): Date {
  return new Date(d.getTime() + 86_400_000);
}

export function buildIcs(items: AgendaItem[], baseUrl: string): string {
  const now = dateTimeValue(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TappedIn//Co-op tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TappedIn",
    "X-WR-TIMEZONE:America/Toronto",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];
  for (const item of items) {
    lines.push("BEGIN:VEVENT", `UID:${item.id}@tappedin`, `DTSTAMP:${now}`);
    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(item.at)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(item.end ?? item.at))}`);
    } else {
      lines.push(`DTSTART:${dateTimeValue(item.at)}`, `DTEND:${dateTimeValue(new Date(item.at.getTime() + 60 * 60_000))}`);
    }
    lines.push(`SUMMARY:${escapeText(item.title)}`);
    if (item.subtitle) lines.push(`DESCRIPTION:${escapeText(item.subtitle)}`);
    lines.push(`URL:${baseUrl}${item.href}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
