import { describe, expect, it, vi } from "vitest";
import {
  createDevelopmentServiceSpec,
  parseDevelopmentArgs,
  signalOwnedProcess,
  stopOwnedProcesses,
} from "./dev-services";

describe("development service runner", () => {
  it("isolates the app ports and output directory", () => {
    const app = createDevelopmentServiceSpec("app", {});

    expect(app.env.LUNABOT_APP_VARIANT).toBe("dev");
    expect(app.env.LUNABOT_DEV_RENDERER_PORT).toBe("5173");
    expect(app.env.LUNABOT_DEV_REMOTE_DEBUGGING_PORT).toBe("9333");
    expect(app.args).toContain("out-dev-app");
  });

  it("keeps selected development ports in the child environment", () => {
    const app = createDevelopmentServiceSpec("app", {
      LUNABOT_DEV_RENDERER_PORT: "5180",
      LUNABOT_DEV_REMOTE_DEBUGGING_PORT: "9340",
    });

    expect(app.env.LUNABOT_DEV_RENDERER_PORT).toBe("5180");
    expect(app.env.LUNABOT_DEV_REMOTE_DEBUGGING_PORT).toBe("9340");
  });

  it("rejects positional arguments and unknown options", () => {
    expect(parseDevelopmentArgs([])).toEqual({ dryRun: false });
    expect(parseDevelopmentArgs(["--dry-run"])).toEqual({ dryRun: true });
    expect(() => parseDevelopmentArgs(["all"])).toThrow("Unknown argument: all");
    expect(() => parseDevelopmentArgs(["--watch"])).toThrow("Unknown option");
  });

  it("signals a detached POSIX process group after its launcher exits", () => {
    const kill = vi.fn<typeof process.kill>(() => true);
    const child = { pid: 321, exitCode: 0, kill: vi.fn(() => true) };

    signalOwnedProcess(child, "SIGTERM", "darwin", kill);

    expect(kill).toHaveBeenCalledWith(-321, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("gives a surviving POSIX process group time to exit cleanly", async () => {
    let time = 0;
    let probes = 0;
    const kill = vi.fn((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) {
        probes += 1;
        if (probes > 2) throw Object.assign(new Error("missing process"), { code: "ESRCH" });
      }
      return true;
    });
    const child = { pid: 321, exitCode: 0, kill: vi.fn(() => true) };

    await stopOwnedProcesses([child], "SIGTERM", {
      platform: "darwin",
      killProcess: kill,
      timeoutMs: 100,
      pollIntervalMs: 25,
      now: () => time,
      wait: async (milliseconds) => {
        time += milliseconds;
      },
    });

    expect(kill).toHaveBeenCalledWith(-321, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(-321, "SIGKILL");
    expect(time).toBe(50);
  });

  it("accepts an inaccessible macOS process group as already stopped", async () => {
    const kill = vi.fn((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
      return true;
    });
    const child = { pid: 321, exitCode: 0, kill: vi.fn(() => true) };

    await expect(
      stopOwnedProcesses([child], "SIGTERM", {
        platform: "darwin",
        killProcess: kill,
      }),
    ).resolves.toBeUndefined();

    expect(kill).toHaveBeenCalledWith(-321, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-321, 0);
    expect(kill).not.toHaveBeenCalledWith(-321, "SIGKILL");
  });

  it("does not hide an inaccessible process group on other POSIX platforms", async () => {
    const error = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
    const kill = vi.fn((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) throw error;
      return true;
    });
    const child = { pid: 321, exitCode: 0, kill: vi.fn(() => true) };

    await expect(
      stopOwnedProcesses([child], "SIGTERM", {
        platform: "linux",
        killProcess: kill,
      }),
    ).rejects.toBe(error);
  });

  it("escalates only after a surviving process group misses the deadline", async () => {
    let time = 0;
    const kill = vi.fn(() => true);
    const child = { pid: 321, exitCode: 0, kill: vi.fn(() => true) };

    await stopOwnedProcesses([child], "SIGTERM", {
      platform: "darwin",
      killProcess: kill,
      timeoutMs: 100,
      pollIntervalMs: 25,
      now: () => time,
      wait: async (milliseconds) => {
        time += milliseconds;
      },
    });

    expect(time).toBe(100);
    expect(kill).toHaveBeenCalledWith(-321, "SIGKILL");
  });
});
