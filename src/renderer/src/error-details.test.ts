import { describe, expect, it } from "vitest";
import { redactErrorDetails } from "./error-details";

describe("redactErrorDetails", () => {
  it("masks API keys", () => {
    expect(redactErrorDetails("Invalid key sk-proj-AbC123_def456")).toBe("Invalid key [redacted]");
  });

  it("masks bearer credentials", () => {
    expect(redactErrorDetails("Request failed with Bearer eyJhbGciOi.payload-part")).toBe(
      "Request failed with Bearer [redacted]",
    );
  });

  it("masks secret values written as key=value or JSON pairs", () => {
    expect(redactErrorDetails("api_key=abc123 password: hunter2")).toBe("api_key=[redacted] password: [redacted]");
    expect(redactErrorDetails('{"access_token":"xyz789"}')).toBe('{"access_token":"[redacted]"}');
  });

  it("replaces the home folder with ~ on Windows, macOS and Linux", () => {
    expect(redactErrorDetails("Cannot read C:\\Users\\alice\\AppData\\cache")).toBe("Cannot read ~\\AppData\\cache");
    expect(redactErrorDetails("Cannot read C:/Users/alice/AppData/cache")).toBe("Cannot read ~/AppData/cache");
    expect(redactErrorDetails("Cannot read /Users/alice/Library/app")).toBe("Cannot read ~/Library/app");
    expect(redactErrorDetails("Cannot read /home/alice/.config/app")).toBe("Cannot read ~/.config/app");
  });

  it("leaves ordinary messages unchanged", () => {
    expect(redactErrorDetails("The agent stopped unexpectedly.")).toBe("The agent stopped unexpectedly.");
  });

  it("caps the result at 2000 characters, ending with a marker", () => {
    const result = redactErrorDetails("x".repeat(5_000));
    expect(result).toHaveLength(2_000);
    expect(result.endsWith("…")).toBe(true);
  });

  it("masks a secret that straddles the cut so no part of it is copied", () => {
    const result = redactErrorDetails(`${"a".repeat(1_990)} sk-SECRETVALUE123 ${"b".repeat(100)}`);
    expect(result).not.toContain("SECRETVALUE");
    expect(result).not.toContain("sk-");
  });
});
