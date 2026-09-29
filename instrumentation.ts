export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // On Vercel the build step seeds the database and Vercel Cron runs the daily refresh, so a
  // serverless cold start shouldn't do either.
  if (process.env.VERCEL) return;

  const { seedAll } = await import("@/lib/seed/run");
  const { startScheduler } = await import("@/lib/jobs/scheduler");

  await seedAll();
  startScheduler();
}
