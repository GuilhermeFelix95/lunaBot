import { createEffect, createSignal } from "solid-js";
import { expect, fireEvent, fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  DEFAULT_FIRST_BOT_DRAFT,
  FIRST_BOT_SUGGESTIONS,
  type FirstBotDraft,
  FirstBotSetup,
  type FirstBotSetupProps,
  type FirstBotSuggestion,
} from "../src/components/FirstBotSetup";
import { setThemePreference } from "../src/theme";

function draftFromSuggestion(suggestion: FirstBotSuggestion): FirstBotDraft {
  return {
    name: suggestion.name,
    purpose: suggestion.purpose,
    avatarSeed: suggestion.avatarSeed,
    avatarHue: suggestion.avatarHue,
    suggestionId: suggestion.id,
  };
}

function ControlledFirstBotSetup(props: FirstBotSetupProps) {
  const [draft, setDraft] = createSignal<FirstBotDraft>({ ...props.value });

  createEffect(
    () => props.value,
    (value) => {
      setDraft({ ...value });
    },
  );

  return (
    <FirstBotSetup
      {...props}
      value={draft()}
      onChange={(value) => {
        setDraft(value);
        props.onChange(value);
      }}
    />
  );
}

const args: FirstBotSetupProps = {
  value: DEFAULT_FIRST_BOT_DRAFT,
  suggestions: FIRST_BOT_SUGGESTIONS,
  submitting: false,
  onChange: fn(),
  onSubmit: fn(),
};

const meta = {
  title: "Setup/FirstBotSetup",
  component: FirstBotSetup,
  args,
  parameters: {
    layout: "fullscreen",
  },
  render: (storyArgs) => <ControlledFirstBotSetup {...storyArgs} />,
} satisfies Meta<typeof FirstBotSetup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Eclipse: Ateliê, preview beside the editor. */
export const Atelie: Story = {
  render: (storyArgs) => {
    setThemePreference("eclipse");
    return <ControlledFirstBotSetup {...storyArgs} />;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Create a Bot your way" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create Bot" })).toBeDisabled();
  },
};

/** Papel: Passo a passo, one decision per step, ideas in a side column. */
export const PassoAPasso: Story = {
  render: (storyArgs) => {
    setThemePreference("papel");
    return <ControlledFirstBotSetup {...storyArgs} />;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("list", { name: "Setup steps" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "What is it called?" })).toBeInTheDocument();
  },
};

/** Quadrante: Pergunta, one question, one box, templates as a numbered grid. */
export const Pergunta: Story = {
  render: (storyArgs) => {
    setThemePreference("quadrante");
    return <ControlledFirstBotSetup {...storyArgs} />;
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "What should this Bot do for you?" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { level: 2, name: "Or start from a template" })).toBeInTheDocument();
  },
};

export const Interactions: Story = {
  render: (storyArgs) => {
    setThemePreference("eclipse");
    return <ControlledFirstBotSetup {...storyArgs} />;
  },
  play: async ({ args: storyArgs, canvas }) => {
    const looseEnds = canvas.getByRole("button", { name: /^Loose Ends\./ });
    await fireEvent.click(looseEnds);

    const suggestion = FIRST_BOT_SUGGESTIONS[1];
    if (!suggestion) throw new Error("The Loose Ends suggestion is missing.");
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue(suggestion.name);
    await expect(canvas.getByRole("textbox", { name: "What should this Bot help with?" })).toHaveValue(
      suggestion.purpose,
    );
    await expect(looseEnds).toHaveAttribute("aria-pressed", "true");

    await fireEvent.click(canvas.getByRole("button", { name: "Create Bot" }));
    await expect(storyArgs.onSubmit).toHaveBeenCalledWith(draftFromSuggestion(suggestion));
  },
};

const selectedSuggestion = FIRST_BOT_SUGGESTIONS[1];

export const Submitting: Story = {
  render: (storyArgs) => {
    setThemePreference("eclipse");
    return <ControlledFirstBotSetup {...storyArgs} />;
  },
  args: {
    value: selectedSuggestion ? draftFromSuggestion(selectedSuggestion) : DEFAULT_FIRST_BOT_DRAFT,
    mode: "additional",
    submitting: true,
    onCancel: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Creating Bot…" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Name" })).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "What should this Bot help with?" })).toBeDisabled();
  },
};
