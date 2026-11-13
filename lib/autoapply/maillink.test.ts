import { describe, expect, it } from "vitest";
import { pickLink } from "./maillink";

const host = "navcanada.wd10.myworkdayjobs.com";

describe("pickLink", () => {
  it("takes the activation link on the same Workday site", () => {
    const text = `Click this link to confirm your email\nhttps://${host}/NAV_Careers/activate/abc123/?redirect=%2Fen-US%2Fjob.\nThe link will expire.`;
    expect(pickLink(text, host, "verify")).toBe(`https://${host}/NAV_Careers/activate/abc123/?redirect=%2Fen-US%2Fjob`);
  });
  it("never takes a link on another host, however it looks", () => {
    expect(pickLink(`https://evil.example.com/${host}/activate/x`, host, "verify")).toBeNull();
    expect(pickLink(`https://${host}.evil.com/activate/x`, host, "verify")).toBeNull();
    expect(pickLink("NONE", host, "verify")).toBeNull();
  });
  it("tells reset links from activation links", () => {
    const text = `https://${host}/NAV_Careers/passwordreset/tok123`;
    expect(pickLink(text, host, "reset")).toBe(text);
    expect(pickLink(text, host, "verify")).toBeNull();
  });
});
