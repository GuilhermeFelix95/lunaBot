import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  whisperBuiltExecutableCandidates,
  whisperConfigureArgs,
  whisperExecutableName,
  whisperRequiredCommands,
} from "./whisper-build-plan";

describe("whisper build plan", () => {
  it("names the executable per simulated platform", () => {
    expect(whisperExecutableName("win32")).toBe("whisper-cli.exe");
    expect(whisperExecutableName("darwin")).toBe("whisper-cli");
    expect(whisperExecutableName("linux")).toBe("whisper-cli");
  });

  it("requires g++ and make only on linux", () => {
    expect(whisperRequiredCommands("linux").map((check) => check.command)).toEqual(["cmake", "tar", "g++", "make"]);
    expect(whisperRequiredCommands("darwin").map((check) => check.command)).toEqual(["cmake", "tar"]);
    expect(whisperRequiredCommands("win32").map((check) => check.command)).toEqual(["cmake", "tar"]);
  });

  it("adds the MSVC runtime flag only on win32", () => {
    const configure = (platform: string) => whisperConfigureArgs(platform, "/src", "/build");
    expect(configure("win32")).toContain("-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded");
    expect(configure("linux")).not.toContain("-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded");
    expect(configure("linux")).toEqual(expect.arrayContaining(["-S", "/src", "-B", "/build", "-DGGML_NATIVE=OFF"]));
  });

  it("looks for the built binary in the single-config and multi-config output folders", () => {
    expect(whisperBuiltExecutableCandidates("/build", "whisper-cli")).toEqual([
      join("/build", "bin", "whisper-cli"),
      join("/build", "bin", "Release", "whisper-cli"),
    ]);
  });
});
