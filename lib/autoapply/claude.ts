import { spawn } from "node:child_process";

// Runs Claude Code headless (`claude -p`) on Owen's own plan. Chosen over the raw API so the real
// /humanizer skill runs on cover letters instead of a paraphrase of its rules. The prompt goes in
// on stdin so nothing user-derived is ever interpolated into a shell command line.

export type ToolUse = { name: string; input: Record<string, unknown> };
export type ClaudeRun = { ok: boolean; result: string; toolUses: ToolUse[]; costUsd: number; error?: string };

export function runClaude(opts: {
  cwd: string;
  prompt: string;
  allowedTools: string[];
  model?: string;
  timeoutMs?: number;
}): Promise<ClaudeRun> {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    opts.allowedTools.join(","),
  ];
  const model = opts.model ?? process.env.AUTO_APPLY_MODEL;
  if (model) args.push("--model", model);

  return new Promise((resolve) => {
    // shell: true because on Windows `claude` is an npm .cmd shim; every arg above is a constant.
    const child = spawn("claude", args, { cwd: opts.cwd, shell: true, windowsHide: true });
    const toolUses: ToolUse[] = [];
    let result = "";
    let costUsd = 0;
    let isError = false;
    let buf = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, result, toolUses, costUsd, error: "Claude timed out" });
    }, opts.timeoutMs ?? 10 * 60_000);

    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt: { type?: string; message?: { content?: unknown }; result?: string; total_cost_usd?: number; is_error?: boolean };
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === "assistant" && Array.isArray(evt.message?.content)) {
          for (const part of evt.message.content as { type: string; name?: string; input?: Record<string, unknown> }[]) {
            if (part.type === "tool_use" && part.name) toolUses.push({ name: part.name, input: part.input ?? {} });
          }
        } else if (evt.type === "result") {
          result = evt.result ?? "";
          costUsd = evt.total_cost_usd ?? 0;
          isError = Boolean(evt.is_error);
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, result, toolUses, costUsd, error: `Could not start claude: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0 && !isError;
      resolve({ ok, result, toolUses, costUsd, error: ok ? undefined : stderr.trim() || result || `claude exited ${code}` });
    });

    child.stdin.end(opts.prompt);
  });
}

/** True if the run actually invoked the humanizer skill (under any plugin namespace). */
export function usedHumanizer(run: ClaudeRun): boolean {
  return run.toolUses.some((t) => t.name === "Skill" && /humanizer/i.test(String(t.input.skill ?? t.input.name ?? "")));
}
