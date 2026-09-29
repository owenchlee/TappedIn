import { readFile } from "node:fs/promises";
import path from "node:path";
import { SERVABLE_FILES, isValidJobId, jobDir, type ServableFile } from "@/lib/autoapply/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_NAMES: Partial<Record<ServableFile, string>> = {
  "resume.pdf": "Owen_Lee_Resume.pdf",
  "resume.tex": "Owen_Lee_Resume.tex",
  "cover-letter.pdf": "Owen_Lee_Cover_Letter.pdf",
};

/** Serves one of a job's generated documents. Only whitelisted names, so no path traversal. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  if (process.env.AUTO_APPLY_ENABLED !== "1") return new Response("Not found", { status: 404 });
  const { id, name } = await params;
  if (!isValidJobId(id) || !(name in SERVABLE_FILES)) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(path.join(jobDir(id), name));
    const download = new URL(req.url).searchParams.has("download");
    const filename = DOWNLOAD_NAMES[name as ServableFile] ?? name;
    return new Response(body, {
      headers: {
        "Content-Type": SERVABLE_FILES[name as ServableFile],
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
