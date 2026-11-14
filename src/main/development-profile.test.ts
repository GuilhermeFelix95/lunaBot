import { describe, expect, it } from "vitest";
import { developmentUserDataName, readDevelopmentInstanceId } from "./development-profile";

describe("development profile", () => {
  it("uses the app userData folder", () => {
    expect(developmentUserDataName()).toBe("Luna Bot Dev");
  });

  it("does not accept arbitrary instance content as a path component", () => {
    expect(readDevelopmentInstanceId("../../other")).toBeNull();
  });

  it("isolates a fallback dev instance without accepting arbitrary path content", () => {
    expect(readDevelopmentInstanceId("5174")).toBe("5174");
    expect(developmentUserDataName("5174")).toBe("Luna Bot Dev 5174");
  });
});
