import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AvatarArt, type AvatarFamily, type AvatarPose, avatarProfile } from "../src/avatar";
import { AgentAvatar } from "../src/components/AgentAvatar";
import { setThemePreference, THEME_PREFERENCES } from "../src/theme";
import { STORY_BOTS } from "./fixtures";

const agentMeta = {
  title: "Identity/AgentAvatar",
  component: AgentAvatar,
  parameters: { layout: "centered" },
  decorators: [
    (Story, context) => {
      const theme = THEME_PREFERENCES.find((preference) => preference === context.globals.theme);
      if (theme) setThemePreference(theme);
      return Story();
    },
  ],
} satisfies Meta<typeof AgentAvatar>;

export default agentMeta;
type AgentStory = StoryObj<typeof agentMeta>;

export const Generated: AgentStory = {
  args: { bot: STORY_BOTS[0], motion: "hover" },
};

export const Thinking: AgentStory = {
  args: { bot: STORY_BOTS[1], motion: "always", class: "size-12" },
};

export const CustomImageFallback: AgentStory = {
  args: { bot: { ...STORY_BOTS[2], avatarUrl: "mock-avatar://missing" } },
};

const FAMILIES = ["fases", "monolito", "quadrantes"] as const satisfies readonly AvatarFamily[];
const SILHOUETTE_COUNT = 7;
const POSES = ["idle", "thinking", "working", "alert", "sleep", "connecting"] as const satisfies readonly AvatarPose[];
const EXPRESSION_COUNT = 16;
const AVATAR_SIZE = 62;

export const Families: StoryObj = {
  render: () => {
    const profile = avatarProfile("story-avatar", 215);
    return (
      <div
        class="grid gap-8 p-8"
        style={{ background: "var(--lunabot-bg-canvas)", color: "var(--lunabot-text-primary)" }}
      >
        {FAMILIES.map((family) => (
          <section class="grid gap-3" aria-label={`${family} avatar family`}>
            <strong class="text-sm capitalize">{family}</strong>
            <div class="flex items-end gap-5">
              {Array.from({ length: SILHOUETTE_COUNT }, (_, shape) => (
                <span
                  class="bot-avatar bot-avatar-art"
                  style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px` }}
                >
                  <AvatarArt
                    family={family}
                    shape={shape}
                    expression={profile.expression}
                    color={profile.color}
                    pose="rest"
                  />
                </span>
              ))}
            </div>
            <div class="flex items-end gap-5">
              {POSES.map((pose) => (
                <div class="grid justify-items-center gap-2">
                  <span
                    class="bot-avatar bot-avatar-art"
                    style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px` }}
                  >
                    <AvatarArt
                      family={family}
                      shape={0}
                      expression={profile.expression}
                      color={profile.color}
                      pose={pose}
                    />
                  </span>
                  <small style={{ color: "var(--lunabot-text-muted)" }}>{pose}</small>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  },
};

export const Expressions: StoryObj = {
  render: () => (
    <div
      class="grid gap-8 p-8"
      style={{ background: "var(--lunabot-bg-canvas)", color: "var(--lunabot-text-primary)" }}
    >
      {FAMILIES.map((family) => (
        <section class="grid gap-3" aria-label={`${family} expressions`}>
          <strong class="text-sm capitalize">{family}</strong>
          <div class="flex flex-wrap items-end gap-5">
            {Array.from({ length: EXPRESSION_COUNT }, (_, expression) => (
              <div class="grid justify-items-center gap-2">
                <span
                  class="bot-avatar bot-avatar-art"
                  style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px` }}
                >
                  <AvatarArt family={family} shape={0} expression={expression} color={0} pose="rest" />
                </span>
                <small style={{ color: "var(--lunabot-text-muted)" }}>{expression}</small>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
