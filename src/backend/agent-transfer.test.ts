// @vitest-environment node

import { describe, expect, it } from "vitest";
import { nativeMessage } from "../main/native-messages";
import {
  AGENT_EXPORT_MAX_BYTES,
  buildAgentExport,
  parseAgentExport,
  redactAgentText,
  serializeAgentExport,
} from "./agent-transfer";

const validFile = {
  format: "lunabot-agent",
  version: 1,
  exportedAt: "2026-11-14T10:00:00.000Z",
  agent: {
    name: "Research",
    title: "Lead",
    instructions: "Finds primary sources.",
    avatarSeed: "research-1",
    avatarHue: 215,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    notifications: "nothing",
  },
  routines: [
    {
      name: "Brief",
      instruction: "Prepare it.",
      active: true,
      timezone: "UTC",
      schedule: { kind: "daily", time: "09:00" },
    },
  ],
  memories: [{ text: "Use official docs." }],
};

function parseJson(value: unknown) {
  return parseAgentExport(JSON.stringify(value));
}

describe("agent transfer", () => {
  it("round trips an exported agent through the file format", () => {
    const exported = buildAgentExport(
      {
        bot: {
          name: "Research",
          title: "Lead",
          description: "Finds primary sources.",
          avatarSeed: "research-1",
          avatarHue: 215,
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
          notifications: "nothing",
        },
        routines: [],
        memories: [],
      },
      new Date("2026-11-14T10:00:00.000Z"),
    );

    expect(parseAgentExport(serializeAgentExport(exported))).toEqual(exported);
  });

  it("redacts secrets and user folders from exported text", () => {
    const text =
      'Key sk-abcdefghijklmnopqrstuvwx, api_key="supersecretvalue123", C:\\Users\\alice\\notes and /home/bob/work';

    const redacted = redactAgentText(text);

    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(redacted).not.toContain("supersecretvalue123");
    expect(redacted).not.toContain("alice");
    expect(redacted).not.toContain("bob");
    expect(redacted).toContain("[redacted]");
    expect(redacted).toContain("<home>");
  });

  it("accepts a valid file", () => {
    expect(parseJson(validFile)).toMatchObject({
      format: "lunabot-agent",
      version: 1,
      agent: { name: "Research", model: "gpt-5.6-sol", avatarHue: 215 },
      routines: [{ name: "Brief", active: true }],
      memories: [{ text: "Use official docs." }],
    });
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseAgentExport("{not json")).toThrow(nativeMessage("errors.agentTransfer.invalidFile"));
  });

  it("rejects files larger than the limit before parsing them", () => {
    const text = "x".repeat(AGENT_EXPORT_MAX_BYTES + 1);

    expect(() => parseAgentExport(text)).toThrow(nativeMessage("errors.agentTransfer.tooLarge", { limit: "1 MB" }));
  });

  it("rejects a file without the Luna Bot format marker", () => {
    const { format: _format, ...withoutFormat } = validFile;

    expect(() => parseJson(withoutFormat)).toThrow(nativeMessage("errors.agentTransfer.invalidFile"));
  });

  it("rejects an unknown format version", () => {
    expect(() => parseJson({ ...validFile, version: 2 })).toThrow(
      nativeMessage("errors.agentTransfer.unsupportedVersion", { version: "2" }),
    );
  });

  it("rejects unknown fields at the top level, in the agent, and in routines", () => {
    expect(() => parseJson({ ...validFile, extra: true })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "extra" }),
    );

    expect(() => parseJson({ ...validFile, agent: { ...validFile.agent, extra: true } })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "agent.extra" }),
    );

    const routineWithExtra = [{ ...validFile.routines[0], extra: true }];
    expect(() => parseJson({ ...validFile, routines: routineWithExtra })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "routines[0].extra" }),
    );
  });

  it("rejects a missing required field", () => {
    const { title: _title, ...agentWithoutTitle } = validFile.agent;

    expect(() => parseJson({ ...validFile, agent: agentWithoutTitle })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "agent.title" }),
    );
  });

  it("rejects values outside the allowed enums", () => {
    expect(() => parseJson({ ...validFile, agent: { ...validFile.agent, model: "bad model!" } })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "agent.model" }),
    );

    expect(() => parseJson({ ...validFile, agent: { ...validFile.agent, notifications: "loudly" } })).toThrow(
      nativeMessage("errors.agentTransfer.invalidField", { field: "agent.notifications" }),
    );
  });
});
