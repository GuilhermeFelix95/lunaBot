import { describe, expect, test, vi } from "vitest";
import { parseCreateBot } from "../main/ipc/agent-inputs";
import { invokeWith } from "./invoke";

const createBotInput = {
  name: "Teste",
  description: "Teste de descricao curta",
  avatarSeed: "first-bot:avatar:0:1",
  avatarHue: null,
  initialMessage: "Teste de descricao curta",
};

describe("invokeWith", () => {
  test("sends the raw payload to the invoke function", async () => {
    const invoke = vi.fn((_channel: string, payload: unknown) => Promise.resolve(payload));

    await invokeWith(invoke, "agent:create-bot", createBotInput, (value) => value);

    expect(invoke.mock.calls[0]?.[0]).toBe("agent:create-bot");
    expect(invoke.mock.calls[0]?.[1]).toBe(createBotInput);
  });

  test("passes the invoke result through the decoder", async () => {
    const response = { id: "bot-1" };
    const invoke = vi.fn(() => Promise.resolve(response));
    const decoder = vi.fn((value: unknown) => ({ decoded: value }));

    const result = await invokeWith(invoke, "agent:create-bot", null, decoder);

    expect(decoder).toHaveBeenCalledWith(response);
    expect(result).toEqual({ decoded: response });
  });

  test("a createBot payload sent through the preload path is accepted by parseCreateBot", async () => {
    const invoke = vi.fn((_channel: string, payload: unknown) => Promise.resolve(parseCreateBot(payload)));

    await expect(invokeWith(invoke, "agent:create-bot", createBotInput, (value) => value)).resolves.toEqual(
      createBotInput,
    );
  });

  test("regression: a payload wrapped as { serverId, payload } is rejected by parseCreateBot", () => {
    // The previous preload shape wrapped every payload this way; the main process parser must reject it.
    const wrapped = { serverId: "local", payload: createBotInput };

    expect(() => parseCreateBot(wrapped)).toThrow("Invalid avatar seed.");
  });
});
