import path from "node:path";

/**
 * Resolves a `file:`-prefixed SQLite DATABASE_URL to an absolute path, always
 * relative to the project root (process.cwd()) when given a relative path.
 *
 * This is used by both prisma.config.ts (CLI: migrate/generate/studio) and
 * lib/db.ts (runtime driver adapter) so they always agree on the exact same
 * absolute file regardless of which directory a given command happens to be
 * invoked from.
 */
export function resolveDatabaseUrl(raw: string | undefined): string {
  const value = raw ?? "file:./dev.db";
  if (!value.startsWith("file:")) return value;
  const filePath = value.slice("file:".length);
  if (filePath === ":memory:" || path.isAbsolute(filePath)) return value;
  return `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath).replace(/\\/g, "/")}`;
}
