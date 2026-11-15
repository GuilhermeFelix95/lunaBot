import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDevelopmentEnvironment } from "./prepare-dev-environment";
import { resolveWindowsDevElectron } from "./windows-dev-electron";

export type DevelopmentService = "app";

export interface DevelopmentServiceSpec {
  name: DevelopmentService;
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

type OwnedProcess = Pick<ChildProcess, "pid" | "exitCode" | "kill">;
type KillProcess = (pid: number, signal?: NodeJS.Signals | number) => boolean;

interface StopOwnedProcessesOptions {
  platform?: NodeJS.Platform;
  killProcess?: KillProcess;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
export const projectRoot = dirname(scriptsRoot);

const DEFAULT_RENDERER_PORTS = {
  app: 5_173,
} as const;
const DEFAULT_REMOTE_DEBUGGING_PORTS = {
  app: 9_333,
} as const;

export function createDevelopmentServiceSpec(
  name: DevelopmentService,
  environment: NodeJS.ProcessEnv = process.env,
): DevelopmentServiceSpec {
  const outputDirectory = "out-dev-app";
  const electronViteBinDir = join(projectRoot, "node_modules", ".bin");
  const electronVite =
    process.platform === "win32"
      ? ([join(electronViteBinDir, "electron-vite.exe"), join(electronViteBinDir, "electron-vite.cmd")].find(
          (candidate) => existsSync(candidate),
        ) ?? join(electronViteBinDir, "electron-vite"))
      : join(electronViteBinDir, "electron-vite");
  return {
    name,
    executable: electronVite,
    args: ["dev", "--watch", "--outDir", outputDirectory, "--entry", join(outputDirectory, "main", "index.js")],
    cwd: projectRoot,
    env: {
      ...environment,
      LUNABOT_APP_VARIANT: "dev",
      LUNABOT_DEV_RENDERER_PORT: environment.LUNABOT_DEV_RENDERER_PORT ?? String(DEFAULT_RENDERER_PORTS[name]),
      LUNABOT_DEV_REMOTE_DEBUGGING_PORT:
        environment.LUNABOT_DEV_REMOTE_DEBUGGING_PORT ?? String(DEFAULT_REMOTE_DEBUGGING_PORTS[name]),
    },
  };
}

export function parseDevelopmentArgs(args: string[]): { dryRun: boolean } {
  const positional = args.find((argument) => !argument.startsWith("--"));
  if (positional !== undefined) throw new Error(`Unknown argument: ${positional}. Run without arguments.`);
  const unsupportedOption = args.find((argument) => argument.startsWith("--") && argument !== "--dry-run");
  if (unsupportedOption) throw new Error(`Unknown option: ${unsupportedOption}.`);
  return { dryRun: args.includes("--dry-run") };
}

async function main(): Promise<void> {
  const { dryRun } = parseDevelopmentArgs(process.argv.slice(2));
  if (!dryRun) prepareDevelopmentEnvironment();
  const reservedPorts = new Set<number>();
  const environment: NodeJS.ProcessEnv = { ...process.env };
  if (!dryRun) {
    const devElectron = resolveWindowsDevElectron({ platform: process.platform, projectRoot, warn: console.warn });
    if (devElectron && environment.ELECTRON_EXEC_PATH === undefined) environment.ELECTRON_EXEC_PATH = devElectron;
  }

  const defaultPort = DEFAULT_RENDERER_PORTS.app;
  const rendererPort = await findAvailablePort(
    readPort(environment.LUNABOT_DEV_RENDERER_PORT) ?? defaultPort,
    reservedPorts,
  );
  reservedPorts.add(rendererPort);
  environment.LUNABOT_DEV_RENDERER_PORT = String(rendererPort);
  if (rendererPort !== defaultPort) {
    environment.LUNABOT_DEV_INSTANCE_ID ??= String(rendererPort);
    console.log(`Renderer port ${defaultPort} is busy. Using ${rendererPort} for app.`);
  }

  const defaultRemoteDebuggingPort = DEFAULT_REMOTE_DEBUGGING_PORTS.app;
  const remoteDebuggingPort = await findAvailablePort(
    readPort(environment.LUNABOT_DEV_REMOTE_DEBUGGING_PORT) ?? defaultRemoteDebuggingPort,
    reservedPorts,
  );
  reservedPorts.add(remoteDebuggingPort);
  environment.LUNABOT_DEV_REMOTE_DEBUGGING_PORT = String(remoteDebuggingPort);
  if (remoteDebuggingPort !== defaultRemoteDebuggingPort) {
    console.log(`Electron debug port ${defaultRemoteDebuggingPort} is busy. Using ${remoteDebuggingPort} for app.`);
  }

  const specs = [createDevelopmentServiceSpec("app", environment)];
  validateServiceSpecs(specs);

  if (dryRun) {
    for (const spec of specs) {
      console.log(`[${spec.name}]`, JSON.stringify([spec.executable, ...spec.args]));
    }
    return;
  }

  console.log(`Starting: ${specs.map((spec) => spec.name).join(", ")}`);
  const processes = new Map<DevelopmentService, ChildProcess>();
  let stopping = false;

  const stopAll = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await stopOwnedProcesses([...processes.values()], signal);
  };

  process.once("SIGINT", () => void stopAll("SIGTERM").then(() => process.exit(130)));
  process.once("SIGTERM", () => void stopAll("SIGTERM").then(() => process.exit(143)));
  process.once("SIGHUP", () => void stopAll("SIGTERM").then(() => process.exit(129)));

  try {
    for (const spec of specs) {
      const child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: spec.env,
        stdio: "inherit",
        shell: false,
        detached: process.platform !== "win32",
      });
      processes.set(spec.name, child);
      child.once("error", (error) => {
        console.error(`[${spec.name}] Could not start:`, error.message);
        void stopAll("SIGTERM").then(() => {
          process.exitCode = 1;
        });
      });
      child.once("exit", (code, signal) => {
        if (stopping) return;
        const result = signal ? `signal ${signal}` : `code ${code ?? 1}`;
        console.log(`[${spec.name}] stopped with ${result}. Stopping the other services.`);
        void stopAll("SIGTERM").then(() => {
          process.exitCode = code ?? 1;
        });
      });
    }
  } catch (error) {
    await stopAll("SIGTERM");
    throw error;
  }
}

async function findAvailablePort(preferredPort: number, reservedPorts: Set<number>): Promise<number> {
  for (let port = preferredPort; port <= 65_535; port += 1) {
    if (reservedPorts.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No available development port was found.");
}

function isPortAvailable(port: number): Promise<boolean> {
  return Promise.all([isAddressPortAvailable(port, "127.0.0.1"), isAddressPortAvailable(port, "::1")]).then((results) =>
    results.every(Boolean),
  );
}

function isAddressPortAvailable(port: number, host: "127.0.0.1" | "::1"): Promise<boolean> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    const finish = (available: boolean) => {
      server.removeAllListeners();
      resolvePort(available);
    };
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        finish(false);
        return;
      }
      if (host === "::1" && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) {
        finish(true);
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => {
      server.close(() => finish(true));
    });
  });
}

function readPort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("Development ports must be integers from 1024 to 65535.");
  }
  return port;
}

function validateServiceSpecs(specs: DevelopmentServiceSpec[]): void {
  for (const spec of specs) {
    if (!existsSync(spec.executable)) {
      throw new Error(`electron-vite is missing at ${spec.executable}. Run bun install.`);
    }
  }
}

export function signalOwnedProcess(
  child: OwnedProcess,
  signal: NodeJS.Signals,
  platform: NodeJS.Platform = process.platform,
  killProcess: KillProcess = process.kill,
): void {
  if (!child.pid) return;
  try {
    if (platform === "win32") {
      if (child.exitCode === null) child.kill(signal);
    } else {
      killProcess(-child.pid, signal);
    }
  } catch (error) {
    if (!isUnavailableProcess(error, platform)) throw error;
  }
}

export async function stopOwnedProcesses(
  owned: OwnedProcess[],
  signal: NodeJS.Signals,
  options: StopOwnedProcessesOptions = {},
): Promise<void> {
  const {
    platform = process.platform,
    killProcess = process.kill,
    timeoutMs = 3_000,
    pollIntervalMs = 50,
    now = Date.now,
    wait = (milliseconds) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
  } = options;
  for (const child of owned) signalOwnedProcess(child, signal, platform, killProcess);

  const deadline = now() + timeoutMs;
  while (owned.some((child) => ownedProcessIsRunning(child, platform, killProcess))) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await wait(Math.min(pollIntervalMs, remaining));
  }

  for (const child of owned) {
    if (ownedProcessIsRunning(child, platform, killProcess)) {
      signalOwnedProcess(child, "SIGKILL", platform, killProcess);
    }
  }
}

function ownedProcessIsRunning(child: OwnedProcess, platform: NodeJS.Platform, killProcess: KillProcess): boolean {
  if (!child.pid) return false;
  if (platform === "win32") return child.exitCode === null;
  try {
    killProcess(-child.pid, 0);
    return true;
  } catch (error) {
    if (isUnavailableProcess(error, platform)) return false;
    throw error;
  }
}

function isUnavailableProcess(error: unknown, platform: NodeJS.Platform): error is NodeJS.ErrnoException {
  // macOS can report EPERM while a detached Electron group is disappearing and only sandboxed helpers remain.
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ESRCH" || (platform === "darwin" && error.code === "EPERM"))
  );
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
