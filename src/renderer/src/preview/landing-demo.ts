import type { ConversationMessage, QueueDelivery } from "@lunabot/contracts/ipc";
import { LANDING_DEMO_SCRIPTS, LANDING_SCRIPT_MESSAGE_PREFIX, type LandingDemoScript } from "./landing-demo-scripts";
import type { MockLunaBotControls } from "./mock-lunabot";

interface LandingDemoControllerOptions {
  reducedMotion?: boolean;
  scripts?: Record<string, LandingDemoScript>;
}

interface ScriptRun {
  botId: string;
  turnId: string;
  timers: Set<ReturnType<typeof setTimeout>>;
}

type SelectedConversation = { kind: "agent"; id: string };

const SCRIPT_TIME = "2026-08-21T10:01:00.000Z";

function scriptId(botId: string, runId: number, part: string): string {
  return `${LANDING_SCRIPT_MESSAGE_PREFIX}${botId}:${runId}:${part}`;
}

function isScriptMessage(message: ConversationMessage): boolean {
  return message.id.startsWith(LANDING_SCRIPT_MESSAGE_PREFIX);
}

function splitIntoChunks(value: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += size) {
    chunks.push(value.slice(offset, offset + size));
  }
  return chunks;
}

export function createLandingDemoController(
  mock: MockLunaBotControls,
  options: LandingDemoControllerOptions = {},
): { activate: () => void; dispose: () => void } {
  const scripts = options.scripts ?? LANDING_DEMO_SCRIPTS;
  let activated = false;
  let disposed = false;
  let selectedConversation: SelectedConversation | null = null;
  let activeRun: ScriptRun | null = null;
  let runCounter = 0;

  function clearRunTimers(run: { timers: Set<ReturnType<typeof setTimeout>> }): void {
    for (const timer of run.timers) clearTimeout(timer);
    run.timers.clear();
  }

  function emitTurnCompleted(run: ScriptRun, status: "completed" | "interrupted"): void {
    const snapshot = mock.readConversationSnapshot(run.botId);
    mock.emitAgentEvent({
      type: "turn-completed",
      botId: run.botId,
      threadId: snapshot.threadId ?? `thread-${run.botId}`,
      turnId: run.turnId,
      status,
    });
  }

  function cancelActiveRun(): void {
    const run = activeRun;
    if (!run) return;
    clearRunTimers(run);
    mock.updateConversationSnapshot(run.botId, (snapshot) => {
      snapshot.activeTurnId = null;
    });
    mock.setQueueSnapshot(run.botId, []);
    emitTurnCompleted(run, "interrupted");
    activeRun = null;
  }

  function schedule(run: ScriptRun, callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      run.timers.delete(timer);
      if (disposed || activeRun !== run) return;
      callback();
    }, delay);
    run.timers.add(timer);
  }

  function createMessages(script: LandingDemoScript, runId: number, turnId: string) {
    const user: ConversationMessage = {
      id: scriptId(script.botId, runId, "prompt"),
      turnId,
      author: "user",
      source: "user",
      text: script.prompt,
      createdAt: SCRIPT_TIME,
      status: "completed",
    };
    const thinking = script.thinkingSteps.map<ConversationMessage>((text, index) => ({
      id: scriptId(script.botId, runId, `thinking-${index + 1}`),
      turnId,
      author: "assistant",
      source: "assistant",
      itemType: "commentary",
      text,
      createdAt: SCRIPT_TIME,
      status: "completed",
    }));
    const answer: ConversationMessage = {
      id: scriptId(script.botId, runId, "answer"),
      turnId,
      author: "assistant",
      source: "assistant",
      itemType: "final_answer",
      text: script.response,
      createdAt: SCRIPT_TIME,
      status: "completed",
      attachments: script.attachments,
      reaction: script.reaction,
    };
    const handoff: ConversationMessage = {
      id: scriptId(script.botId, runId, "handoff"),
      turnId,
      author: "system",
      source: "system",
      text: "",
      createdAt: SCRIPT_TIME,
      status: "completed",
      exchange: {
        direction: "outgoing",
        messageId: scriptId(script.botId, runId, "handoff"),
        senderBotId: script.botId,
        recipientBotIds: script.recipientBotIds,
        replyToMessageId: answer.id,
        deliveries: script.recipientBotIds.map((recipientBotId, index) => ({
          id: scriptId(script.botId, runId, `delivery-${index + 1}`),
          recipientBotId,
          status: "completed",
          position: null,
          error: null,
        })),
      },
    };
    return { user, thinking, answer, handoff };
  }

  function resetScriptMessages(botId: string): void {
    mock.updateConversationSnapshot(botId, (snapshot) => {
      snapshot.activeTurnId = null;
      snapshot.messages = snapshot.messages.filter((message) => !isScriptMessage(message));
    });
    mock.setQueueSnapshot(botId, []);
  }

  function completeWithoutMotion(script: LandingDemoScript): void {
    const runId = ++runCounter;
    const turnId = scriptId(script.botId, runId, "turn");
    const run: ScriptRun = { botId: script.botId, turnId, timers: new Set() };
    const messages = createMessages(script, runId, turnId);
    activeRun = run;
    mock.emitAgentEvent({
      type: "turn-started",
      botId: script.botId,
      threadId: mock.readConversationSnapshot(script.botId).threadId ?? `thread-${script.botId}`,
      turnId,
    });
    mock.updateConversationSnapshot(script.botId, (snapshot) => {
      snapshot.activeTurnId = null;
      snapshot.messages = [
        ...snapshot.messages,
        messages.user,
        ...messages.thinking,
        messages.answer,
        messages.handoff,
      ];
    });
    mock.setQueueSnapshot(script.botId, []);
    emitTurnCompleted(run, "completed");
    activeRun = null;
  }

  function startScript(script: LandingDemoScript): void {
    resetScriptMessages(script.botId);
    if (options.reducedMotion) {
      completeWithoutMotion(script);
      return;
    }

    const runId = ++runCounter;
    const turnId = scriptId(script.botId, runId, "turn");
    const messages = createMessages(script, runId, turnId);
    const run: ScriptRun = { botId: script.botId, turnId, timers: new Set() };
    activeRun = run;

    schedule(
      run,
      () => {
        const delivery: QueueDelivery = {
          id: scriptId(script.botId, runId, "queue"),
          messageId: messages.user.id,
          recipientBotId: script.botId,
          sender: { kind: "user" },
          text: script.prompt,
          attachments: [],
          replyToMessageId: null,
          status: "running",
          position: null,
          turnId,
          error: null,
          createdAt: SCRIPT_TIME,
        };
        mock.updateConversationSnapshot(script.botId, (snapshot) => {
          snapshot.activeTurnId = turnId;
          snapshot.messages = [...snapshot.messages, messages.user];
        });
        mock.setQueueSnapshot(script.botId, [delivery]);
        mock.emitAgentEvent({
          type: "turn-started",
          botId: script.botId,
          threadId: mock.readConversationSnapshot(script.botId).threadId ?? `thread-${script.botId}`,
          turnId,
        });
      },
      250,
    );

    schedule(
      run,
      () => {
        mock.updateConversationSnapshot(script.botId, (snapshot) => {
          snapshot.messages = [...snapshot.messages, { ...messages.thinking[0], status: "streaming" }];
        });
      },
      450,
    );

    schedule(
      run,
      () => {
        mock.updateConversationSnapshot(script.botId, (snapshot) => {
          snapshot.messages = snapshot.messages.map((message) =>
            message.id === messages.thinking[0].id ? { ...message, status: "completed" } : message,
          );
          snapshot.messages = [...snapshot.messages, { ...messages.thinking[1], status: "streaming" }];
        });
      },
      850,
    );

    schedule(
      run,
      () => {
        const chunks = splitIntoChunks(script.response);
        let chunkIndex = 0;
        const streamNext = () => {
          const delta = chunks[chunkIndex];
          if (delta === undefined) {
            mock.updateConversationSnapshot(script.botId, (snapshot) => {
              snapshot.messages = snapshot.messages.map((message) =>
                message.id === messages.thinking[1].id ? { ...message, status: "completed" } : message,
              );
              snapshot.messages = [...snapshot.messages, messages.answer];
            });
            schedule(
              run,
              () => {
                mock.updateConversationSnapshot(script.botId, (snapshot) => {
                  snapshot.activeTurnId = null;
                  snapshot.messages = [...snapshot.messages, messages.handoff];
                });
                mock.setQueueSnapshot(script.botId, []);
                emitTurnCompleted(run, "completed");
                activeRun = null;
              },
              250,
            );
            return;
          }
          mock.emitConversationDelta({
            botId: script.botId,
            threadId: mock.readConversationSnapshot(script.botId).threadId ?? `thread-${script.botId}`,
            turnId,
            messageId: messages.answer.id,
            delta,
            createdAt: SCRIPT_TIME,
          });
          chunkIndex += 1;
          schedule(run, streamNext, 45);
        };
        streamNext();
      },
      1_250,
    );
  }

  function selectAgent(botId: string): void {
    if (!scripts[botId] || (selectedConversation?.kind === "agent" && selectedConversation.id === botId)) return;
    cancelActiveRun();
    selectedConversation = { kind: "agent", id: botId };
    if (activated) startScript(scripts[botId]);
  }

  const unsubscribeAgent = mock.onLatestConversationOpened(selectAgent);

  return {
    activate: () => {
      if (activated || disposed) return;
      activated = true;
      const script = scripts[selectedConversation?.id ?? "chief"];
      if (script) startScript(script);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribeAgent();
      cancelActiveRun();
    },
  };
}
