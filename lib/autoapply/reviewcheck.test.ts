import { describe, expect, it } from "vitest";
import { parseReview } from "./reviewcheck";

describe("parseReview", () => {
  it("keeps definite problems and drops hedged ones", () => {
    const reply = JSON.stringify({
      problems: [
        "Gender Identity: shows 'Non-binary, Man' (two answers)",
        "My Information: Phone is formatted differently but correct, not a problem",
        "Work Experience 1 & 2: 'From 09/2026' may be fine, but verify dates",
        "Education Degree: 'Bachelor's Degree' is acceptable only if no BASc option exists",
      ],
    });
    expect(parseReview(reply)).toEqual(["Gender Identity: shows 'Non-binary, Man' (two answers)"]);
  });
  it("an empty list is a pass, junk is no verdict", () => {
    expect(parseReview('{"problems": []}')).toEqual([]);
    expect(parseReview("no json here")).toBe(null);
  });
});
