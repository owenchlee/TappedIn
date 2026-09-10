export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { seedAll } = await import("@/lib/seed/run");
  const { startScheduler } = await import("@/lib/jobs/scheduler");

  await seedAll();
  startScheduler();
}
