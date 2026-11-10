import { describe, expect, it } from "vitest";
import { pageSpaceFromBbox } from "./latex";

const word = (y: number) => `<word xMin="50" yMin="${y - 9}" xMax="80" yMax="${y}">w</word>`;
const page = (ys: number[]) => `<page width="612" height="792">${ys.map(word).join("")}</page>`;
// 36pt top margin (first word top = 36), 12pt lines: bottom limit 792 - 36 = 756.
const lines = (from: number, to: number) => Array.from({ length: Math.floor((to - from) / 12) + 1 }, (_, i) => from + i * 12);

describe("pageSpaceFromBbox", () => {
  it("counts empty lines above the bottom margin", () => {
    expect(pageSpaceFromBbox(page(lines(45, 705)))).toEqual({ linesOver: 0, freeLines: 4 });
  });
  it("counts lines spilled onto later pages", () => {
    expect(pageSpaceFromBbox(page(lines(45, 753)) + page([45, 57, 69]))).toEqual({ linesOver: 3, freeLines: 0 });
  });
  it("treats words on the same baseline as one line", () => {
    expect(pageSpaceFromBbox(page(lines(45, 753)) + page([45, 45.5, 46]))?.linesOver).toBe(1);
  });
  it("returns null for an empty PDF", () => {
    expect(pageSpaceFromBbox("<doc></doc>")).toBeNull();
  });
});
