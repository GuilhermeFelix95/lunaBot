import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AvatarArt, type AvatarPose, avatarProfile } from "../src/avatar";
import { AgentAvatar } from "../src/components/AgentAvatar";
import { MASCOT_COUNT, MASCOTS, mascotAt } from "../src/mascots";
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

const POSES = ["idle", "thinking", "working", "alert", "sleep", "connecting"] as const satisfies readonly AvatarPose[];
const AVATAR_SIZE = 62;

export const Mascots: StoryObj = {
  render: () => {
    const profile = avatarProfile("story-avatar", 215);
    return (
      <div
        class="grid gap-8 p-8"
        style={{ background: "var(--lunabot-bg-canvas)", color: "var(--lunabot-text-primary)" }}
      >
        <section class="grid gap-3" aria-label="All mascots">
          <strong class="text-sm">All {MASCOT_COUNT} mascots</strong>
          <div class="flex flex-wrap items-end gap-5">
            {MASCOTS.map((mascot, index) => (
              <div class="grid justify-items-center gap-2">
                <span
                  class="bot-avatar bot-avatar-art"
                  style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px` }}
                >
                  <AvatarArt mascot={index} color={profile.color} pose="rest" />
                </span>
                <small style={{ color: "var(--lunabot-text-muted)" }}>{mascot.id}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  },
};

export const Poses: StoryObj = {
  render: () => (
    <div
      class="grid gap-8 p-8"
      style={{ background: "var(--lunabot-bg-canvas)", color: "var(--lunabot-text-primary)" }}
    >
      {[0, 1, 2, 3].map((index) => (
        <section class="grid gap-3" aria-label={`${mascotAt(index).id} poses`}>
          <strong class="text-sm">{mascotAt(index).id}</strong>
          <div class="flex flex-wrap items-end gap-5">
            {POSES.map((pose) => (
              <div class="grid justify-items-center gap-2">
                <span
                  class="bot-avatar bot-avatar-art"
                  style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px` }}
                >
                  <AvatarArt mascot={index} color={index + 1} pose={pose} />
                </span>
                <small style={{ color: "var(--lunabot-text-muted)" }}>{pose}</small>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
