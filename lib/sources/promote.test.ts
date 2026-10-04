import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
const { liveDuplicate } = await import("@/lib/sources/promote");

const at = (iso: string) => new Date(iso);
const closedCanonical = { lastSeenAt: at("2026-09-29T05:07:00Z") };
const untrusted = new Set(["vanshb03-internships"]);

describe("liveDuplicate", () => {
  it("promotes a copy a trusted source listed in a later refresh (RBC: Canadian list dropped it, Simplify still lists it)", () => {
    const d = { sourceKey: "simplify-internships", lastSeenAt: at("2026-10-04T01:22:00Z") };
    expect(liveDuplicate(closedCanonical, [d], untrusted)).toBe(d);
  });

  it("doesn't trust a list that keeps closed jobs (Amex: Simplify says inactive, vanshb03 still lists it)", () => {
    const d = { sourceKey: "vanshb03-internships", lastSeenAt: at("2026-10-04T01:22:00Z") };
    expect(liveDuplicate(closedCanonical, [d], untrusted)).toBeNull();
  });

  it("ignores a copy seen seconds later in the same run, e.g. a source that's been failing since (TD)", () => {
    const d = { sourceKey: "td", lastSeenAt: at("2026-09-29T05:08:23Z") };
    expect(liveDuplicate(closedCanonical, [d], untrusted)).toBeNull();
  });
});
