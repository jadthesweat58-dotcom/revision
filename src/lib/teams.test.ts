import { describe, expect, it } from "vitest";
import { classifyMicrosoftError, decrypt, encrypt, guessSubjectSlug, plainText } from "./teams";

describe("Teams helpers", () => {
  it("matches class names to subjects", () => {
    expect(guessSubjectSlug("10B Geography")).toBe("geography");
    expect(guessSubjectSlug("Y10 Maths Set 1")).toBe("maths");
    expect(guessSubjectSlug("English Lit 10.2")).toBe("english-literature");
    expect(guessSubjectSlug("IGCSE English Language")).toBe("english-language");
    expect(guessSubjectSlug("10 Physics")).toBe("physics");
    expect(guessSubjectSlug("Physical Education 10")).toBeNull();
    expect(guessSubjectSlug("Econ Y10")).toBe("economics");
    expect(guessSubjectSlug("Business Studies")).toBe("business");
    expect(guessSubjectSlug("Tutor group 10B")).toBeNull();
    expect(guessSubjectSlug("English")).toBeNull(); // could be either, so you choose
  });

  it("turns Teams instructions into plain text", () => {
    expect(plainText("<p>It&#39;s due</p>")).toBe("It's due");
    expect(plainText("<p>Do Q1&ndash;5</p><p>Show&nbsp;working &amp; units</p>")).toBe("Do Q1–5\nShow working & units");
  });

  it("explains Microsoft's errors in plain terms", () => {
    expect(classifyMicrosoftError("access_denied", "AADSTS90094: An administrator of X has set a policy")).toBe("admin_approval");
    expect(classifyMicrosoftError("access_denied", "AADSTS65004: User declined to consent")).toBe("cancelled");
    expect(classifyMicrosoftError("access_denied", "")).toBe("cancelled");
    expect(classifyMicrosoftError("invalid_grant", "AADSTS700082: The refresh token has expired")).toBe("reconnect");
    expect(classifyMicrosoftError("server_error", "Something odd")).toBe("other");
  });

  it("encrypts the saved sign-in", () => {
    process.env.MS_CLIENT_SECRET = "secret-a";
    const sealed = encrypt("refresh-token-123");
    expect(sealed).not.toContain("refresh-token-123");
    expect(decrypt(sealed)).toBe("refresh-token-123");
    process.env.MS_CLIENT_SECRET = "secret-b";
    expect(decrypt(sealed)).toBeNull(); // a different key can't open it
  });
});
