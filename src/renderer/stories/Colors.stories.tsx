import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Heading, Text } from "../src/components/ui";

const colors = [
  ["Canvas", "var(--lunabot-bg-canvas)"],
  ["Surface", "var(--lunabot-bg-surface)"],
  ["Control", "var(--lunabot-bg-control)"],
  ["Border", "var(--lunabot-border-strong)"],
  ["Accent", "var(--lunabot-accent)"],
  ["Success", "var(--lunabot-success)"],
  ["Warning", "var(--lunabot-warning)"],
  ["Danger", "var(--lunabot-danger)"],
] as const;

const meta = {
  title: "Foundations/Colors",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SemanticPalette: Story = {
  render: () => (
    <main class="foundation-story">
      <Heading as="h1" size="lg">
        Semantic palette
      </Heading>
      <div class="foundation-story-grid">
        <For each={colors}>
          {([name, value]) => (
            <article class="foundation-token-card">
              <div class="foundation-color-swatch" style={{ "--foundation-color": value }} />
              <Text variant="label">{name}</Text>
              <Text variant="caption" tone="muted">
                {value}
              </Text>
            </article>
          )}
        </For>
      </div>
    </main>
  ),
};
