import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
export const developmentProjectRoot = dirname(scriptsRoot);

export type DevelopmentCommandRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; stdio: "inherit" },
) => void;

export function prepareDevelopmentEnvironment(
  input: { projectRoot?: string; executable?: string; run?: DevelopmentCommandRunner } = {},
): void {
  const projectRoot = input.projectRoot ?? developmentProjectRoot;

  const executable = input.executable ?? process.execPath;
  const run = input.run ?? execDevelopmentCommand;
  const options = { cwd: projectRoot, stdio: "inherit" as const };

  run(executable, ["install", "--frozen-lockfile"], options);
}

function execDevelopmentCommand(executable: string, args: string[], options: { cwd: string; stdio: "inherit" }): void {
  execFileSync(executable, args, options);
}

if (import.meta.main) {
  prepareDevelopmentEnvironment();
}
