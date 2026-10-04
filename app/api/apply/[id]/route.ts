import { readJob } from "@/lib/autoapply/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the resume status page while the runner works. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.AUTO_APPLY_ENABLED !== "1") return new Response("Not found", { status: 404 });
  const { id } = await params;
  const job = readJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
