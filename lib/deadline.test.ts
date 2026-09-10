import { describe, expect, it } from "vitest";
import {
  daysUntil,
  urgencyOf,
  deadlineLabel,
  dateInputToStorage,
  storageToDateInput,
} from "@/lib/deadline";

describe("dateInputToStorage / storageToDateInput", () => {
  it("round-trips a plain date string", () => {
    expect(storageToDateInput(dateInputToStorage("2026-09-30"))).toBe("2026-09-30");
    expect(storageToDateInput(dateInputToStorage("2026-01-01"))).toBe("2026-01-01");
    expect(storageToDateInput(dateInputToStorage("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("daysUntil", () => {
  it("returns 0 for the same calendar day", () => {
    const now = dateInputToStorage("2026-09-10");
    expect(daysUntil(dateInputToStorage("2026-09-10"), now)).toBe(0);
  });

  it("counts whole days forward and backward", () => {
    const now = dateInputToStorage("2026-09-10");
    expect(daysUntil(dateInputToStorage("2026-09-13"), now)).toBe(3);
    expect(daysUntil(dateInputToStorage("2026-09-07"), now)).toBe(-3);
  });

  it("is correct across the spring-forward DST boundary (Mar 8, 2026 in America/Toronto)", () => {
    const now = dateInputToStorage("2026-03-07");
    expect(daysUntil(dateInputToStorage("2026-03-10"), now)).toBe(3);
  });

  it("is correct across the fall-back DST boundary (Nov 1, 2026 in America/Toronto)", () => {
    const now = dateInputToStorage("2026-10-30");
    expect(daysUntil(dateInputToStorage("2026-11-02"), now)).toBe(3);
  });
});

describe("urgencyOf", () => {
  const now = dateInputToStorage("2026-09-10");

  it("classifies null as none", () => {
    expect(urgencyOf(null, now)).toBe("none");
  });

  it("classifies overdue, today, urgent, soon, far", () => {
    expect(urgencyOf(dateInputToStorage("2026-09-09"), now)).toBe("overdue");
    expect(urgencyOf(dateInputToStorage("2026-09-10"), now)).toBe("today");
    expect(urgencyOf(dateInputToStorage("2026-09-17"), now)).toBe("urgent");
    expect(urgencyOf(dateInputToStorage("2026-09-25"), now)).toBe("soon");
    expect(urgencyOf(dateInputToStorage("2026-12-01"), now)).toBe("far");
  });

  it("treats exactly 7 days out as urgent, 8 days out as soon", () => {
    expect(urgencyOf(dateInputToStorage("2026-09-17"), now)).toBe("urgent");
    expect(urgencyOf(dateInputToStorage("2026-09-18"), now)).toBe("soon");
  });
});

describe("deadlineLabel", () => {
  const now = dateInputToStorage("2026-09-10");

  it("labels near-term deadlines in relative terms", () => {
    expect(deadlineLabel(dateInputToStorage("2026-09-10"), now)).toBe("Due today");
    expect(deadlineLabel(dateInputToStorage("2026-09-11"), now)).toBe("Due tomorrow");
    expect(deadlineLabel(dateInputToStorage("2026-09-13"), now)).toBe("Due in 3 days");
    expect(deadlineLabel(dateInputToStorage("2026-09-09"), now)).toBe("Overdue by 1 day");
    expect(deadlineLabel(dateInputToStorage("2026-09-05"), now)).toBe("Overdue by 5 days");
  });

  it("falls back to a formatted date far in the future", () => {
    expect(deadlineLabel(dateInputToStorage("2026-12-25"), now)).toBe("Due Dec 25");
  });
});
