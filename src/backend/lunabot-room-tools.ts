import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";

export const LUNABOT_ROOM_NAMESPACE = "lunabot_room";

// Exposed only to the active room manager's thread. RoomService checks the caller again on every call.
export const LUNABOT_ROOM_DYNAMIC_TOOLS = {
  type: "namespace",
  name: LUNABOT_ROOM_NAMESPACE,
  description:
    "Read your closed room and ask the user to change its members. Every request waits for the user's decision.",
  tools: [
    {
      type: "function",
      name: "room_members",
      description: "List the active members of your room.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "room_catalog",
      description: "List general agents that could be hired into your room. Use their botId to request a hire.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "request_hire",
      description: "Ask the user to hire a general agent into your room. Nothing changes until the user approves.",
      inputSchema: {
        type: "object",
        properties: {
          botId: { type: "string", minLength: 1, maxLength: INPUT_LIMITS.identifier },
          reason: { type: "string", minLength: 1, maxLength: 1_000 },
        },
        required: ["botId", "reason"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "request_new_bot",
      description:
        "Ask the user to create a new general agent that your room needs. The user creates it; then you can request a hire.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          title: { type: "string", maxLength: 120 },
          description: { type: "string", maxLength: 2_000 },
          reason: { type: "string", minLength: 1, maxLength: 1_000 },
        },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "request_dismiss",
      description: "Ask the user to dismiss an active member from your room. Nothing changes until the user approves.",
      inputSchema: {
        type: "object",
        properties: {
          botId: { type: "string", minLength: 1, maxLength: INPUT_LIMITS.identifier },
          reason: { type: "string", minLength: 1, maxLength: 1_000 },
        },
        required: ["botId", "reason"],
        additionalProperties: false,
      },
    },
  ],
};
