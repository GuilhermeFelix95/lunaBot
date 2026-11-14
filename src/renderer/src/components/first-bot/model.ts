import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { AVATAR_HUE_OPTIONS, avatarCandidateSeeds } from "../../avatar";
import { type TranslationKey, t } from "../../i18n";

export const FIRST_BOT_TITLE_ID = "first-bot-setup-title";

export interface FirstBotDraft {
  name: string;
  purpose: string;
  avatarSeed: string;
  avatarHue: BotAvatarHue | null;
  suggestionId: string | null;
}

export interface FirstBotSuggestion {
  id: string;
  name: string;
  description: string;
  purpose: string;
  avatarSeed: string;
  avatarHue: BotAvatarHue;
  animationCycleOffset: number;
  animationOffset: number;
}

export interface FirstBotSetupProps {
  value: FirstBotDraft;
  suggestions: FirstBotSuggestion[];
  mode?: "first" | "additional";
  submitting?: boolean;
  error?: string | null;
  onChange: (value: FirstBotDraft) => void;
  onSubmit: (value: FirstBotDraft) => void | Promise<void>;
  onCancel?: () => void;
}

/** Batch 0 is the default face set; "Sortear outros" draws the next batch, whose faces are all new. */
export function faceSeedsForBatch(batch: number): string[] {
  const currentSeed = batch === 0 ? "first-bot" : `first-bot:avatar:${batch}:0`;
  return avatarCandidateSeeds("first-bot", currentSeed, batch);
}

export const FIRST_BOT_AVATAR_SEEDS = faceSeedsForBatch(0);

export interface IdeaPresentationProps {
  suggestions: FirstBotSuggestion[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (suggestion: FirstBotSuggestion) => void;
}
export const FIRST_BOT_HUE_OPTIONS = AVATAR_HUE_OPTIONS.filter((option) => option.hue !== 100 && option.hue !== 280);
export const BOT_HUE_NAME_KEYS: Record<BotAvatarHue, TranslationKey> = {
  0: "onboarding.bot.hue.red",
  30: "onboarding.bot.hue.orange",
  55: "onboarding.bot.hue.yellow",
  100: "onboarding.bot.hue.lime",
  150: "onboarding.bot.hue.green",
  185: "onboarding.bot.hue.cyan",
  215: "onboarding.bot.hue.blue",
  245: "onboarding.bot.hue.indigo",
  280: "onboarding.bot.hue.violet",
  320: "onboarding.bot.hue.magenta",
};

export const DEFAULT_FIRST_BOT_DRAFT: FirstBotDraft = {
  get name() {
    return t("onboarding.bot.defaultName");
  },
  purpose: "",
  avatarSeed: FIRST_BOT_AVATAR_SEEDS[0] ?? "first-bot",
  avatarHue: null,
  suggestionId: null,
};

export function createFirstBotDraft(random: () => number = Math.random): FirstBotDraft {
  const index = Math.min(FIRST_BOT_AVATAR_SEEDS.length - 1, Math.floor(random() * FIRST_BOT_AVATAR_SEEDS.length));
  return {
    ...DEFAULT_FIRST_BOT_DRAFT,
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[index] ?? DEFAULT_FIRST_BOT_DRAFT.avatarSeed,
  };
}

export const FIRST_BOT_SUGGESTIONS: FirstBotSuggestion[] = [
  {
    id: "morning-brief",
    get name() {
      return t("onboarding.suggestion.morning-brief.name");
    },
    get description() {
      return t("onboarding.suggestion.morning-brief.description");
    },
    get purpose() {
      return t("onboarding.suggestion.morning-brief.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[1] ?? "first-bot:morning-brief",
    avatarHue: 320,
    animationCycleOffset: 0,
    animationOffset: 0.15,
  },
  {
    id: "loose-ends",
    get name() {
      return t("onboarding.suggestion.loose-ends.name");
    },
    get description() {
      return t("onboarding.suggestion.loose-ends.description");
    },
    get purpose() {
      return t("onboarding.suggestion.loose-ends.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[2] ?? "first-bot:loose-ends",
    avatarHue: 215,
    animationCycleOffset: 2,
    animationOffset: 0.65,
  },
  {
    id: "deep-dive",
    get name() {
      return t("onboarding.suggestion.deep-dive.name");
    },
    get description() {
      return t("onboarding.suggestion.deep-dive.description");
    },
    get purpose() {
      return t("onboarding.suggestion.deep-dive.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[3] ?? "first-bot:deep-dive",
    avatarHue: 55,
    animationCycleOffset: 4,
    animationOffset: 1.2,
  },
  {
    id: "draft-editor",
    get name() {
      return t("onboarding.suggestion.draft-editor.name");
    },
    get description() {
      return t("onboarding.suggestion.draft-editor.description");
    },
    get purpose() {
      return t("onboarding.suggestion.draft-editor.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[4] ?? "first-bot:draft-editor",
    avatarHue: 150,
    animationCycleOffset: 6,
    animationOffset: 1.8,
  },
  {
    id: "file-tidier",
    get name() {
      return t("onboarding.suggestion.file-tidier.name");
    },
    get description() {
      return t("onboarding.suggestion.file-tidier.description");
    },
    get purpose() {
      return t("onboarding.suggestion.file-tidier.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[5] ?? "first-bot:file-tidier",
    avatarHue: 30,
    animationCycleOffset: 8,
    animationOffset: 2.45,
  },
  {
    id: "price-watch",
    get name() {
      return t("onboarding.suggestion.price-watch.name");
    },
    get description() {
      return t("onboarding.suggestion.price-watch.description");
    },
    get purpose() {
      return t("onboarding.suggestion.price-watch.purpose");
    },
    avatarSeed: FIRST_BOT_AVATAR_SEEDS[6] ?? "first-bot:price-watch",
    avatarHue: 245,
    animationCycleOffset: 10,
    animationOffset: 3.15,
  },
];

export function matchesSuggestion(draft: FirstBotDraft, suggestion: FirstBotSuggestion): boolean {
  return (
    draft.name === suggestion.name &&
    draft.purpose === suggestion.purpose &&
    draft.avatarSeed === suggestion.avatarSeed &&
    draft.avatarHue === suggestion.avatarHue
  );
}
