/**
 * One command to use the app locally: `npm run app`.
 * Starts the local database (clearing the stale lock it can leave after a crash), applies any new
 * migrations, starts the dev server in the background if it isn't up, and opens it in Chrome.
 * Safe to run when everything is already running: it only starts what's missing.
 */
import "dotenv/config";
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const APP_URL = "http://localhost:3000";
const DB_NAME = "tappedin";
const LOCK_DIR = path.join(process.env.LOCALAPPDATA ?? "", "prisma-dev-nodejs", "Data", "durable-streams", DB_NAME, "server.lock.lock");
const LOG_DIR = path.join(os.tmpdir(), "tappedin");

function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

async function waitFor(check: () => Promise<boolean>, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function npx(args: string): { ok: boolean; output: string } {
  const r = spawnSync(`npx ${args}`, { shell: true, encoding: "utf8" });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

async function startDatabase() {
  const port = Number(new URL(process.env.DATABASE_URL ?? "postgres://localhost:51214").port || 5432);
  if (await portOpen(port)) return console.log("✓ Database already running");

  console.log("… Starting the database");
  let run = npx(`prisma dev --name ${DB_NAME} --detach`);
  if (!run.ok && /lock/i.test(run.output)) {
    // A crash leaves this lock directory behind and every later start fails until it's removed.
    console.log("… Clearing a stale database lock");
    npx(`prisma dev stop ${DB_NAME}`);
    if (existsSync(LOCK_DIR)) rmSync(LOCK_DIR, { recursive: true, force: true });
    run = npx(`prisma dev --name ${DB_NAME} --detach`);
  }
  if (!(await waitFor(() => portOpen(port), 30))) {
    console.error(run.output.trim());
    throw new Error("The database didn't start. The output above says why.");
  }
  console.log("✓ Database started");
}

function migrate() {
  const r = npx("prisma migrate deploy");
  if (!r.ok) {
    console.error(r.output.trim());
    throw new Error("Couldn't apply database migrations.");
  }
  console.log(/No pending migrations/i.test(r.output) ? "✓ Database is up to date" : "✓ Applied new database migrations");
}

async function appResponds(): Promise<boolean> {
  try {
    const res = await fetch(APP_URL, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function startApp() {
  if (await portOpen(3000)) return console.log("✓ App already running");

  console.log("… Starting the app");
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(path.join(LOG_DIR, "dev.log"), "a");
  // Detached so it keeps running after this script exits (and after Claude Code's command ends).
  spawn("npm run dev", { shell: true, detached: true, stdio: ["ignore", log, log], windowsHide: true }).unref();
  if (!(await waitFor(() => portOpen(3000), 60))) throw new Error(`The app didn't start. See ${path.join(LOG_DIR, "dev.log")}`);
  // The first request compiles the home page; wait for it so Chrome doesn't open on a spinner.
  if (!(await waitFor(appResponds, 90))) throw new Error(`The app isn't responding. See ${path.join(LOG_DIR, "dev.log")}`);
  console.log(`✓ App started (log: ${path.join(LOG_DIR, "dev.log")})`);
}

function openChrome() {
  if (process.argv.includes("--no-open")) return;
  try {
    if (process.platform === "win32") execSync(`start "" chrome "${APP_URL}"`, { stdio: "ignore", shell: "cmd.exe" });
    else if (process.platform === "darwin") execSync(`open -a "Google Chrome" "${APP_URL}"`, { stdio: "ignore" });
    else execSync(`xdg-open "${APP_URL}"`, { stdio: "ignore" });
  } catch {
    console.log(`Open ${APP_URL} in your browser.`);
    return;
  }
  console.log(`✓ Opened ${APP_URL} in Chrome`);
}

async function main() {
  await startDatabase();
  migrate();
  await startApp();
  openChrome();
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
