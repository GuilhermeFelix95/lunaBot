import { describe, expect, it } from "vitest";
import {
  hasUnsafeAccountNameCharacters,
  isUuidV4,
  isValidHostname,
  normalizeAccountName,
  normalizeEmailAddress,
  normalizeOneTimeCode,
  validateProfileName,
} from "./validation";

describe("shared boundary validation", () => {
  it("normalizes safe account names and rejects hidden control characters", () => {
    expect(normalizeAccountName("  Jose\u0301\u00a0\u00a0Silva  ")).toBe("José Silva");
    expect(hasUnsafeAccountNameCharacters("José Silva")).toBe(false);
    expect(hasUnsafeAccountNameCharacters("Family 👨‍👩‍👧‍👦")).toBe(false);
    expect(hasUnsafeAccountNameCharacters("Line\nbreak")).toBe(true);
    expect(hasUnsafeAccountNameCharacters("Hidden\u0000value")).toBe(true);
    expect(hasUnsafeAccountNameCharacters("Reversed\u202evalue")).toBe(true);
    expect(hasUnsafeAccountNameCharacters("Zero\u200bwidth")).toBe(true);
    expect(hasUnsafeAccountNameCharacters("\u200d\u200d\u200d")).toBe(true);
    expect(hasUnsafeAccountNameCharacters("می‌روم")).toBe(false);
  });

  it("counts profile name limits by visible Unicode characters", () => {
    expect(validateProfileName("🤖🤖").error).toBe("too-short");
    expect(validateProfileName("👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦").error).toBeNull();
    expect(validateProfileName("🤖".repeat(20)).error).toBeNull();
    expect(validateProfileName("🤖".repeat(21)).error).toBe("too-long");
    expect(validateProfileName("\u200d\u200d\u200d").error).toBe("unsafe");
  });

  it("normalizes valid email addresses", () => {
    expect(normalizeEmailAddress(" User.Name+tag@Example.COM ")).toBe("user.name+tag@example.com");
  });

  it("rejects malformed email addresses", () => {
    expect(normalizeEmailAddress("user@localhost")).toBeNull();
    expect(normalizeEmailAddress("user@@example.com")).toBeNull();
  });

  it("normalizes valid one-time codes and rejects ambiguous characters", () => {
    expect(normalizeOneTimeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeOneTimeCode("ABCD EFGH")).toBe("ABCDEFGH");
    expect(normalizeOneTimeCode("ABCD-EFG0")).toBeNull();
    expect(normalizeOneTimeCode("ABC-DEFG")).toBeNull();
  });

  it("supports public domains and local SMTP hostnames", () => {
    expect(isValidHostname("example.com")).toBe(true);
    expect(isValidHostname("localhost")).toBe(false);
    expect(isValidHostname("localhost", false)).toBe(true);
  });

  it("accepts only version 4 UUIDs", () => {
    expect(isUuidV4("3f5c2c9c-f0c8-4c59-9917-cb91aec9e3cd")).toBe(true);
    expect(isUuidV4("3f5c2c9c-f0c8-1c59-9917-cb91aec9e3cd")).toBe(false);
  });
});
