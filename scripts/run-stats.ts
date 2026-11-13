/**
 * Statistics over every application run (private/runs.jsonl, one line per finished job, written by prefill.ts).
 *   npx tsx scripts/run-stats.ts            all runs
 *   npx tsx scripts/run-stats.ts today      today's only
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PRIVATE_DIR } from "../lib/autoapply/job";

type Row = { at: string; company?: string; role?: string; state?: string; mode?: string; secs?: number; costUsd?: number; resume?: string; fieldsFilled?: number; questions?: number; reviewCheck?: unknown; confirmation?: string | null; note?: string };

let rows: Row[] = [];
try {
  rows = readFileSync(path.join(PRIVATE_DIR, "runs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
} catch {
  console.log("No runs recorded yet.");
  process.exit(0);
}
if (process.argv[2] === "today") {
  const day = new Date().toLocaleDateString("en-CA");
  rows = rows.filter((r) => new Date(r.at).toLocaleDateString("en-CA") === day);
}
const n = rows.length;
const count = (f: (r: Row) => boolean) => rows.filter(f).length;
const pct = (x: number) => (n ? `${Math.round((x / n) * 100)}%` : "-");
const secs = rows.map((r) => r.secs).filter((s): s is number => typeof s === "number").sort((a, b) => a - b);
const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
const real = rows.filter((r) => r.mode === "submit");

console.log(`Runs: ${n}  (real submit runs: ${real.length})`);
console.log(`Submitted:        ${count((r) => r.state === "submitted")} (${pct(count((r) => r.state === "submitted"))})`);
console.log(`Ready (stopped):  ${count((r) => r.state === "ready")}`);
console.log(`Need you:         ${count((r) => r.state === "needs_you")}`);
console.log(`Failed / closed:  ${count((r) => r.state === "failed")}`);
console.log(`Resume verified:  ${count((r) => r.resume === "verified")} of ${n} (${pct(count((r) => r.resume === "verified"))}); mismatches: ${count((r) => r.resume === "mismatch")}`);
console.log(`Review check:     passed ${count((r) => r.reviewCheck === "passed")}, flagged ${count((r) => Array.isArray(r.reviewCheck))}`);
if (secs.length) console.log(`Time per job:     median ${secs[Math.floor(secs.length / 2)]} s, fastest ${secs[0]} s, slowest ${secs.at(-1)} s`);
console.log(`Cost:             $${cost.toFixed(2)} total, $${n ? (cost / n).toFixed(3) : "0"} per job`);
console.log("");
for (const r of rows.slice(-30)) {
  console.log(`${new Date(r.at).toLocaleTimeString()}  ${(r.state ?? "?").padEnd(9)} ${String(r.secs ?? "-").padStart(5)} s  resume:${(r.resume ?? "-").padEnd(10)} ${r.company} – ${r.role}${r.state !== "submitted" && r.note ? `  | ${r.note.slice(0, 90)}` : ""}`);
}
