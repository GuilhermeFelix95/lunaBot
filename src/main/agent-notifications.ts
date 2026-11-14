import type { AgentEvent, AgentNotificationLevel, BotSummary } from "@lunabot/contracts/ipc";
import { nativeMessage } from "./native-messages";

export interface AgentNotificationContent {
  title: string;
  body: string;
  silent?: boolean;
}

/** `needs-me` keeps only the events where the agent waits for the person's reply or approval. */
export function notificationLevelAllows(
  level: AgentNotificationLevel,
  eventType: "turn-completed" | "prompt" | "approval",
): boolean {
  if (level === "nothing") return false;
  if (level === "all") return true;
  return eventType === "prompt" || eventType === "approval";
}

export function notificationForAgentEvent(
  event: AgentEvent,
  bots: BotSummary[],
  hiddenAgentIds: ReadonlySet<string> = new Set(),
): AgentNotificationContent | null {
  if (event.type !== "turn-completed" && event.type !== "prompt" && event.type !== "approval") {
    return null;
  }

  const botId = event.type === "approval" ? event.approval.botId : event.botId;
  const bot = bots.find((candidate) => candidate.id === botId);
  if (!bot || hiddenAgentIds.has(bot.id) || !notificationLevelAllows(bot.notifications, event.type)) return null;

  if (event.type === "prompt") {
    return { title: bot.name, body: nativeMessage("notification.needsInput") };
  }
  if (event.type === "approval") {
    return { title: bot.name, body: nativeMessage("notification.needsApproval") };
  }
  if (event.status !== "completed") return null;
  return { title: bot.name, body: nativeMessage("notification.finished"), silent: true };
}
