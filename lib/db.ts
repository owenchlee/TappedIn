import "dotenv/config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Cached on globalThis in every environment: Next.js can evaluate this module as separate bundled
// instances across instrumentation.ts, route handlers, and server actions within one process, and
// globalThis is the only thing guaranteed to be shared across all of them.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Serverless functions each hold their own pool — keep it small so a burst of cold starts can't
  // exhaust a free-tier Postgres connection limit. Local `prisma dev` (PGlite) only serves one
  // connection at a time, so .env sets DB_POOL_MAX=1 there.
  const max = Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10);
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
