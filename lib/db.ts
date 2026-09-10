import "dotenv/config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveDatabaseUrl } from "@/lib/dbUrl";

// Always cached on globalThis, in every environment — not just dev. Next.js can evaluate this
// module as separate bundled instances across instrumentation.ts, route handlers, and server
// actions even within a single long-lived process, and globalThis is the only thing guaranteed
// to be shared across all of them.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl(process.env.DATABASE_URL) });
  const client = new PrismaClient({ adapter });

  // Fire-and-forget, but never silently: an unhandled rejection here would crash the process on
  // import. WAL lets the cron job write while a request reads; busy_timeout avoids SQLITE_BUSY
  // when a request lands mid-write.
  client.$executeRawUnsafe("PRAGMA journal_mode=WAL;").catch((err) => console.error("[db] Failed to set WAL mode:", err));
  client.$executeRawUnsafe("PRAGMA busy_timeout=5000;").catch((err) => console.error("[db] Failed to set busy_timeout:", err));

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
