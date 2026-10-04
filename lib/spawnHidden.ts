import { spawn } from "node:child_process";
import { openSync } from "node:fs";

/**
 * Starts a long-running background process that outlives its parent, with output appended to logFile.
 *
 * On Windows a plain `detached` spawn has no console at all, so every console program it starts later
 * (the claude CLI, pdflatex, Next's workers) pops open its own terminal window. Starting it through
 * Start-Process -WindowStyle Hidden gives it a hidden console of its own that those programs share.
 */
export function spawnHidden(command: string, args: string[], opts: { cwd: string; logFile: string }) {
  if (process.platform !== "win32") {
    const log = openSync(opts.logFile, "a");
    spawn(command, args, { cwd: opts.cwd, detached: true, stdio: ["ignore", log, log] }).unref();
    return;
  }
  const cmdQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const line = `${[command, ...args].map(cmdQuote).join(" ")} >> ${cmdQuote(opts.logFile)} 2>&1`;
  const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const ps = `Start-Process -WindowStyle Hidden -WorkingDirectory ${psQuote(opts.cwd)} -FilePath cmd.exe -ArgumentList ${psQuote(`/d /s /c "${line}"`)}`;
  spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { cwd: opts.cwd, stdio: "ignore", windowsHide: true }).unref();
}
