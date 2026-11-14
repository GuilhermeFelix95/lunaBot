import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "../i18n";
import { setThemePreference } from "../theme";
import {
  DEFAULT_FIRST_BOT_DRAFT,
  FIRST_BOT_SUGGESTIONS,
  type FirstBotDraft,
  FirstBotSetup,
  type FirstBotSetupProps,
} from "./FirstBotSetup";

const NAME_LABEL_EN = "Name";
const PURPOSE_LABEL_EN = "What should this Bot help with?";

interface HarnessOptions {
  draft?: Partial<FirstBotDraft>;
  mode?: FirstBotSetupProps["mode"];
  onSubmit?: (value: FirstBotDraft) => void;
  onCancel?: () => void;
}

/** Keeps the draft in a signal so the layouts re-render the way the app does. */
function renderSetup(options: HarnessOptions = {}) {
  const onSubmit = options.onSubmit ?? vi.fn();
  return render(() => {
    const [value, setValue] = createSignal<FirstBotDraft>({
      ...DEFAULT_FIRST_BOT_DRAFT,
      purpose: "",
      ...options.draft,
    });
    return (
      <FirstBotSetup
        value={value()}
        suggestions={FIRST_BOT_SUGGESTIONS}
        mode={options.mode}
        onChange={setValue}
        onSubmit={onSubmit}
        onCancel={options.onCancel}
      />
    );
  });
}

// English words a pt-BR screen must not show as UI text, mirroring pt-br-ui.test.tsx.
const ENGLISH_UI_WORDS = [
  "Settings",
  "Search",
  "Cancel",
  "Create",
  "Continue",
  "Back",
  "Shuffle",
  "Name",
  "Face",
  "Color",
  "Description",
  "Agent",
  "Model",
  "Provider",
  "Message",
  "Error",
  "Loading",
  "Close",
  "Open",
  "Edit",
  "Add",
  "Update",
  "Remove",
];

function englishWordsIn(container: HTMLElement): string[] {
  const texts = [container.textContent ?? ""];
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute);
      if (value) texts.push(value);
    }
  }
  const found = new Set<string>();
  for (const text of texts) {
    for (const word of ENGLISH_UI_WORDS) {
      if (new RegExp(`\\b${word}\\b`).test(text)) found.add(`${word} (in "${text.trim()}")`);
    }
  }
  return [...found];
}

afterEach(() => setThemePreference("eclipse"));

describe("FirstBotSetup layouts", () => {
  it("eclipse shows Ateliê with name and purpose on one screen", async () => {
    setThemePreference("eclipse");
    renderSetup();

    expect(screen.getByRole("heading", { level: 1, name: "Create a Bot your way" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: NAME_LABEL_EN })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: PURPOSE_LABEL_EN })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Setup steps" })).not.toBeInTheDocument();
  });

  it("papel shows the step-by-step setup starting with identity", async () => {
    setThemePreference("papel");
    renderSetup();

    expect(screen.getByRole("list", { name: "Setup steps" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "What is it called?" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: PURPOSE_LABEL_EN })).not.toBeInTheDocument();
  });

  it("quadrante asks the purpose as the page title and offers templates as a grid", async () => {
    setThemePreference("quadrante");
    renderSetup();

    expect(screen.getByRole("heading", { level: 1, name: "What should this Bot do for you?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: NAME_LABEL_EN })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Or start from a template" })).toBeInTheDocument();
  });
});

describe("FirstBotSetup name and purpose", () => {
  it("keeps Create disabled until name and purpose are filled, then submits the draft", async () => {
    setThemePreference("eclipse");
    const onSubmit = vi.fn();
    renderSetup({ draft: { name: "" }, onSubmit });
    const create = () => screen.getByRole("button", { name: "Create Bot" });

    expect(create()).toBeDisabled();
    await fireEvent.input(screen.getByRole("textbox", { name: NAME_LABEL_EN }), { target: { value: "Helper" } });
    expect(create()).toBeDisabled();
    await fireEvent.input(screen.getByRole("textbox", { name: PURPOSE_LABEL_EN }), {
      target: { value: "Answer emails" },
    });
    expect(create()).toBeEnabled();

    await fireEvent.click(create());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Helper", purpose: "Answer emails" }));
  });

  it("submits the form when Enter is pressed in a field", async () => {
    setThemePreference("eclipse");
    const onSubmit = vi.fn();
    renderSetup({ draft: { name: "Helper", purpose: "Answer emails" }, onSubmit });

    const form = screen.getByRole("button", { name: "Create Bot" }).closest("form");
    if (!form) throw new Error("The Create Bot button is not inside a form.");
    await fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Helper" }));
  });

  it("a suggestion fills name, purpose, face and colour and is marked as selected", async () => {
    setThemePreference("eclipse");
    renderSetup({ draft: { name: "" } });
    const suggestion = FIRST_BOT_SUGGESTIONS[1];
    if (!suggestion) throw new Error("expected a second suggestion");

    await fireEvent.click(screen.getByRole("button", { name: /^Loose Ends\./ }));

    expect(screen.getByRole("textbox", { name: NAME_LABEL_EN })).toHaveValue(suggestion.name);
    expect(screen.getByDisplayValue(suggestion.purpose)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Loose Ends\./ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Blue Bot color", pressed: true })).toBeInTheDocument();
  });

  it("Shuffle others draws a new set of faces", async () => {
    setThemePreference("eclipse");
    renderSetup();
    const faces = screen.getByRole("radiogroup", { name: "Face" });
    const before = faces.innerHTML;

    await fireEvent.click(screen.getByRole("button", { name: "Shuffle others" }));

    expect(faces.innerHTML).not.toBe(before);
  });

  it("arrow keys move the face selection", async () => {
    setThemePreference("eclipse");
    renderSetup();
    const radios = within(screen.getByRole("radiogroup", { name: "Face" })).getAllByRole("radio");
    const first = radios[0];
    const second = radios[1];
    if (!first || !second) throw new Error("expected face options");

    await fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(second).toHaveAttribute("aria-checked", "true");
    expect(first).toHaveAttribute("aria-checked", "false");
  });
});

describe("FirstBotSetup Cancel and Escape", () => {
  it("first setup offers no Cancel and ignores Escape", async () => {
    setThemePreference("eclipse");
    const onCancel = vi.fn();
    renderSetup({ mode: "first", onCancel });

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("additional setup cancels from the Cancel button and from Escape", async () => {
    setThemePreference("eclipse");
    const onCancel = vi.fn();
    renderSetup({ mode: "additional", onCancel });

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe("FirstBotSetup Passo a passo", () => {
  it("blocks the review step until name and purpose are filled", async () => {
    setThemePreference("papel");
    const onSubmit = vi.fn();
    renderSetup({ draft: { name: "" }, onSubmit });
    const continueButton = () => screen.getByRole("button", { name: "Continue" });

    // Step 1 (Identidade): the name is required before moving on.
    expect(continueButton()).toBeDisabled();
    await fireEvent.input(screen.getByRole("textbox", { name: "What is it called?" }), { target: { value: "Helper" } });
    expect(continueButton()).toBeEnabled();
    await fireEvent.click(continueButton());

    // Step 2 (Função): the purpose is required before the review.
    expect(continueButton()).toBeDisabled();
    await fireEvent.input(screen.getByRole("textbox", { name: PURPOSE_LABEL_EN }), {
      target: { value: "Answer emails" },
    });
    expect(continueButton()).toBeEnabled();
    await fireEvent.click(continueButton());

    // Step 3 (Revisar): the review offers Create Bot.
    const create = screen.getByRole("button", { name: "Create Bot" });
    expect(create).toBeEnabled();
    await fireEvent.click(create);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Helper", purpose: "Answer emails" }));
  });
});

describe("FirstBotSetup in pt-BR", () => {
  beforeAll(() => setLocalePreference("pt-BR"));
  afterAll(() => setLocalePreference("en"));

  it.each(["eclipse", "papel", "quadrante"] as const)("%s shows no English UI words", (theme) => {
    setThemePreference(theme);
    const view = renderSetup();

    expect(englishWordsIn(view.container)).toEqual([]);
  });
});
