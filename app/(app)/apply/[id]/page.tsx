import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readJob } from "@/lib/autoapply/job";
import { ApplyStatus } from "@/components/autoapply/ApplyStatus";

export const metadata: Metadata = { title: "Auto-apply" };
export const dynamic = "force-dynamic";

export default async function AutoApplyJobPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.AUTO_APPLY_ENABLED !== "1") notFound();
  const { id } = await params;
  const job = readJob(id);
  if (!job) notFound();

  return (
    <div>
      <Link href="/apply" className="mb-3 inline-block text-xs text-muted hover:text-text">
        ← All auto-apply runs
      </Link>
      <ApplyStatus initial={job} />
    </div>
  );
}
