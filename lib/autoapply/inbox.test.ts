import { describe, expect, it } from "vitest";
import { parseInboxResult, type InboxApp } from "./inbox";

const apps: InboxApp[] = [
  { id: "a1", company: "Harvey", role: "Software Engineer Intern", status: "applied", appliedAt: "2026-10-07" },
  { id: "a2", company: "EA", role: "AI Engineer Intern", status: "oa", appliedAt: "2026-10-07" },
];

describe("parseInboxResult", () => {
  it("reads the json block and drops unknown ids and statuses", () => {
    const text = `Found two.\n\`\`\`json\n[
      {"id": "a1", "status": "rejected", "at": "2026-10-16T19:31:43Z", "evidence": "Harvey: Thank you for your application!"},
      {"id": "zz", "status": "rejected", "at": "2026-10-16T19:31:43Z", "evidence": "not one of his"},
      {"id": "a2", "status": "accepted", "at": "2026-10-19T16:46:04Z", "evidence": "not an inbox status"}
    ]\n\`\`\``;
    expect(parseInboxResult(text, apps).map((u) => [u.id, u.status])).toEqual([["a1", "rejected"]]);
  });

  it("accepts an empty array and rejects a reply with no JSON", () => {
    expect(parseInboxResult("```json\n[]\n```", apps)).toEqual([]);
    expect(() => parseInboxResult("Nothing new.", apps)).toThrow();
  });
});
