import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import {
  type AgentNotificationLevel,
  type AgentReasoningEffort,
  type BotAvatarHue,
  type BotMemory,
  type BotSummary,
  isAgentModel,
  isAgentNotificationLevel,
  isAvatarHue,
  isAvatarSeed,
  isReasoningEffort,
  isRoutineSchedule,
  type Routine,
  type RoutineSchedule,
} from "@lunabot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isString } from "@lunabot/contracts/runtime-values";
import { nativeMessage } from "../main/native-messages";

export const AGENT_EXPORT_FORMAT = "lunabot-agent";
export const AGENT_EXPORT_VERSION = 1;
export const AGENT_EXPORT_MAX_BYTES = 1024 * 1024;
export const AGENT_EXPORT_MAX_LABEL = "1 MB";
export const AGENT_EXPORT_MAX_MEMORIES = 500;

export interface AgentExportRoutine {
  name: string;
  instruction: string;
  active: boolean;
  timezone: string;
  schedule: RoutineSchedule;
}

export interface AgentExportFile {
  format: typeof AGENT_EXPORT_FORMAT;
  version: typeof AGENT_EXPORT_VERSION;
  exportedAt: string;
  agent: {
    name: string;
    title: string;
    instructions: string;
    avatarSeed: string;
    avatarHue: BotAvatarHue | null;
    model: string;
    reasoningEffort: AgentReasoningEffort;
    notifications: AgentNotificationLevel;
  };
  routines: AgentExportRoutine[];
  memories: { text: string }[];
}

export interface AgentExportSource {
  bot: Pick<
    BotSummary,
    "name" | "title" | "description" | "avatarSeed" | "avatarHue" | "model" | "reasoningEffort" | "notifications"
  >;
  routines: Routine[];
  memories: BotMemory[];
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];
const SECRET_ASSIGNMENT = /(\b[\w-]*(?:api[_-]?key|token|secret|password)\b["']?\s*[:=]\s*["']?)[^\s"',;]+/gi;
const USER_PATH_PATTERNS: readonly RegExp[] = [/[A-Za-z]:\\Users\\[^\\/\s"'`]+/g, /\/(?:Users|home)\/[^/\s"'`]+/g];

/** Removes credentials and user-specific folders from free text before it leaves the app. */
export function redactAgentText(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, "[redacted]");
  redacted = redacted.replace(SECRET_ASSIGNMENT, "$1[redacted]");
  for (const pattern of USER_PATH_PATTERNS) redacted = redacted.replace(pattern, "<home>");
  return redacted;
}

export function buildAgentExport(source: AgentExportSource, exportedAt: Date): AgentExportFile {
  const { bot } = source;
  return {
    format: AGENT_EXPORT_FORMAT,
    version: AGENT_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    agent: {
      name: redactAgentText(bot.name),
      title: redactAgentText(bot.title),
      instructions: redactAgentText(bot.description),
      avatarSeed: bot.avatarSeed,
      avatarHue: bot.avatarHue,
      model: bot.model,
      reasoningEffort: bot.reasoningEffort,
      notifications: bot.notifications,
    },
    routines: source.routines.map((routine) => ({
      name: redactAgentText(routine.name),
      instruction: redactAgentText(routine.instruction),
      active: routine.active,
      timezone: routine.timezone,
      schedule: routine.trigger.schedule,
    })),
    memories: source.memories.map((memory) => ({ text: redactAgentText(memory.text) })),
  };
}

export function serializeAgentExport(file: AgentExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

const FILE_KEYS = ["format", "version", "exportedAt", "agent", "routines", "memories"] as const;
const AGENT_KEYS = [
  "name",
  "title",
  "instructions",
  "avatarSeed",
  "avatarHue",
  "model",
  "reasoningEffort",
  "notifications",
] as const;
const ROUTINE_KEYS = ["name", "instruction", "active", "timezone", "schedule"] as const;
const MEMORY_KEYS = ["text"] as const;

/** Parses and strictly validates an agent export. Throws a user-facing error for anything it does not accept. */
export function parseAgentExport(text: string): AgentExportFile {
  if (Buffer.byteLength(text, "utf8") > AGENT_EXPORT_MAX_BYTES) {
    throw new Error(nativeMessage("errors.agentTransfer.tooLarge", { limit: AGENT_EXPORT_MAX_LABEL }));
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(nativeMessage("errors.agentTransfer.invalidFile"));
  }
  if (!isDynamicRecord(value) || value.format !== AGENT_EXPORT_FORMAT) {
    throw new Error(nativeMessage("errors.agentTransfer.invalidFile"));
  }
  if (value.version !== AGENT_EXPORT_VERSION) {
    throw new Error(nativeMessage("errors.agentTransfer.unsupportedVersion", { version: String(value.version) }));
  }
  const root = exactRecord(value, "", FILE_KEYS);
  const exportedAt = readString(root, "exportedAt", "exportedAt", 0, 64);
  if (Number.isNaN(Date.parse(exportedAt))) throw invalidField("exportedAt");

  const agent = exactRecord(root.agent, "agent", AGENT_KEYS);
  const model = agent.model;
  if (!isAgentModel(model)) throw invalidField("agent.model");
  const reasoningEffort = agent.reasoningEffort;
  if (!isReasoningEffort(reasoningEffort)) throw invalidField("agent.reasoningEffort");
  const notifications = agent.notifications;
  if (!isAgentNotificationLevel(notifications)) throw invalidField("agent.notifications");
  const avatarSeed = agent.avatarSeed;
  if (!isAvatarSeed(avatarSeed)) throw invalidField("agent.avatarSeed");
  const avatarHue = agent.avatarHue;
  if (avatarHue !== null && !isAvatarHue(avatarHue)) throw invalidField("agent.avatarHue");

  return {
    format: AGENT_EXPORT_FORMAT,
    version: AGENT_EXPORT_VERSION,
    exportedAt,
    agent: {
      name: readString(agent, "name", "agent.name", 1, INPUT_LIMITS.agentName),
      title: readString(agent, "title", "agent.title", 0, INPUT_LIMITS.agentTitle),
      instructions: readString(agent, "instructions", "agent.instructions", 0, INPUT_LIMITS.agentDescription),
      avatarSeed,
      avatarHue,
      model,
      reasoningEffort,
      notifications,
    },
    routines: readArray(root, "routines", "routines", INPUT_LIMITS.agentRoutines).map((item, index) =>
      parseRoutine(item, `routines[${index}]`),
    ),
    memories: readArray(root, "memories", "memories", AGENT_EXPORT_MAX_MEMORIES).map((item, index) => {
      const memory = exactRecord(item, `memories[${index}]`, MEMORY_KEYS);
      return {
        text: readString(memory, "text", `memories[${index}].text`, 1, INPUT_LIMITS.agentMemoryText),
      };
    }),
  };
}

function parseRoutine(value: unknown, path: string): AgentExportRoutine {
  const routine = exactRecord(value, path, ROUTINE_KEYS);
  const schedule = routine.schedule;
  if (!isRoutineSchedule(schedule)) throw invalidField(`${path}.schedule`);
  const active = routine.active;
  if (!isBoolean(active)) throw invalidField(`${path}.active`);
  return {
    name: readString(routine, "name", `${path}.name`, 1, INPUT_LIMITS.routineName),
    instruction: readString(routine, "instruction", `${path}.instruction`, 1, INPUT_LIMITS.routineInstruction),
    active,
    timezone: readString(routine, "timezone", `${path}.timezone`, 1, 64),
    schedule,
  };
}

function invalidField(field: string): Error {
  return new Error(nativeMessage("errors.agentTransfer.invalidField", { field }));
}

function exactRecord(value: unknown, path: string, keys: readonly string[]): DynamicRecord {
  if (!isDynamicRecord(value)) throw invalidField(path || "file");
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw invalidField(path ? `${path}.${key}` : key);
  }
  for (const key of keys) {
    if (!(key in value)) throw invalidField(path ? `${path}.${key}` : key);
  }
  return value;
}

function readString(record: DynamicRecord, key: string, path: string, min: number, max: number): string {
  const value = record[key];
  if (!isString(value) || value.length < min || value.length > max) throw invalidField(path);
  return value;
}

function readArray(record: DynamicRecord, key: string, path: string, max: number): unknown[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length > max) throw invalidField(path);
  return value;
}
