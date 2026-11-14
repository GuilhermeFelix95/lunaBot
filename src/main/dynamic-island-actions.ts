import type { DynamicIslandAction } from "@lunabot/contracts/ipc";

type CriticalAction = Extract<DynamicIslandAction, { type: "answer-prompt" | "respond-approval" }>;

export interface DynamicIslandActionAgent {
  respondToPrompt(input: { requestId: string | number; answers: Record<string, string[]> }): Promise<void>;
  respondToApproval(input: { requestId: string | number; decision: "accept" | "decline" }): Promise<void>;
}

export async function performDynamicIslandCriticalAction(
  action: CriticalAction,
  local: DynamicIslandActionAgent,
): Promise<void> {
  if (action.type === "answer-prompt") {
    await local.respondToPrompt({ requestId: action.requestId, answers: action.answers });
    return;
  }
  await local.respondToApproval({ requestId: action.requestId, decision: action.decision });
}
