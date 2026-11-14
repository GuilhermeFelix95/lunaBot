import { join } from "node:path";

export type WhisperCommandCheck = { command: string; args: string[] };

export function whisperExecutableName(platform: string): "whisper-cli.exe" | "whisper-cli" {
  return platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
}

export function whisperRequiredCommands(platform: string): WhisperCommandCheck[] {
  const commands: WhisperCommandCheck[] = [
    { command: "cmake", args: ["--version"] },
    { command: "tar", args: ["--version"] },
  ];
  if (platform === "linux") {
    commands.push({ command: "g++", args: ["--version"] }, { command: "make", args: ["--version"] });
  }
  return commands;
}

export function whisperConfigureArgs(platform: string, sourceRoot: string, cmakeRoot: string): string[] {
  return [
    "-S",
    sourceRoot,
    "-B",
    cmakeRoot,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DBUILD_SHARED_LIBS=OFF",
    "-DGGML_NATIVE=OFF",
    "-DWHISPER_BUILD_TESTS=OFF",
    "-DWHISPER_BUILD_SERVER=OFF",
    ...(platform === "win32" ? ["-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded"] : []),
  ];
}

export function whisperBuiltExecutableCandidates(cmakeRoot: string, executableName: string): string[] {
  return [join(cmakeRoot, "bin", executableName), join(cmakeRoot, "bin", "Release", executableName)];
}
