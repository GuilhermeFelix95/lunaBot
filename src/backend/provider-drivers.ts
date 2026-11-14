import type { AgentAuthState, AgentProviderId } from "@lunabot/contracts/ipc";
import { nativeMessage } from "../main/native-messages";
import type { AgentClient } from "./agent-client";
import { CodexAppServerClient } from "./app-server-client";
import { ClaudeAgentClient } from "./claude-client";
import { type AgentCliInfo, resolveClaudeCli, resolveCodexCli, resolveGrokCli } from "./cli";
import { GrokAgentClient } from "./grok-client";
import type { AccountReadResult } from "./protocol";

export interface ProviderClientOptions {
  claudeCompactWindow: () => number | null;
}

export interface BuiltInProviderDriver {
  id: AgentProviderId;
  label: string;
  signInMessage(): string;
  resolveCli(): Promise<AgentCliInfo>;
  createClient(cli: AgentCliInfo, requestTimeoutMs: number, options?: ProviderClientOptions): AgentClient;
  authState(account: AccountReadResult["account"]): AgentAuthState;
  validateAccount(account: NonNullable<AccountReadResult["account"]>): void;
}

export const BUILT_IN_PROVIDER_DRIVERS: readonly BuiltInProviderDriver[] = [
  {
    id: "codex",
    label: "Codex",
    signInMessage: () => nativeMessage("errors.provider.signInCodex"),
    resolveCli: resolveCodexCli,
    createClient: (cli, requestTimeoutMs) => new CodexAppServerClient(cli.executable, requestTimeoutMs),
    authState: (account) => ({ kind: "chatgpt", email: account?.email ?? null }),
    validateAccount: (account) => {
      if (account.type !== "chatgpt") {
        throw new Error(nativeMessage("errors.provider.codexLoginRequired"));
      }
    },
  },
  {
    id: "claude",
    label: "Claude",
    signInMessage: () => nativeMessage("errors.provider.signInClaude"),
    resolveCli: resolveClaudeCli,
    createClient: (cli, _requestTimeoutMs, options) =>
      new ClaudeAgentClient(cli, undefined, options?.claudeCompactWindow),
    authState: (account) => ({ kind: "claude", email: account?.email ?? null }),
    validateAccount: () => undefined,
  },
  {
    id: "grok",
    label: "Grok",
    signInMessage: () => nativeMessage("errors.provider.signInGrok"),
    resolveCli: resolveGrokCli,
    createClient: (cli, requestTimeoutMs) => new GrokAgentClient(cli, requestTimeoutMs),
    authState: (account) => ({ kind: "grok", email: account?.email ?? null }),
    validateAccount: () => undefined,
  },
] as const;

export const PROVIDER_DRIVERS = new Map(BUILT_IN_PROVIDER_DRIVERS.map((driver) => [driver.id, driver]));

export function requireProviderDriver(provider: AgentProviderId): BuiltInProviderDriver {
  const driver = PROVIDER_DRIVERS.get(provider);
  if (!driver) throw new Error(`Unknown agent provider: ${provider}`);
  return driver;
}
