import "dotenv/config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveDatabaseUrl } from "@/lib/dbUrl";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPragmaApplied: boolean | undefined;
};

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl(process.env.DATABASE_URL) });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

if (!globalForPrisma.prismaPragmaApplied) {
  globalForPrisma.prismaPragmaApplied = true;
  void prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
  void prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000;");
}
