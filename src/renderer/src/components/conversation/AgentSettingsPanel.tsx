import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import {
  AGENT_NOTIFICATION_LEVELS,
  type AgentModelId,
  type AgentModelOption,
  type AgentNotificationLevel,
  type AgentProviderId,
  type AgentReasoningEffort,
  type AgentStatus,
  APPROVAL_POLICY_MODES,
  type ApprovalPolicyMode,
  type AvatarImageInput,
  type BotAvatarHue,
  type ProviderRuntimeStatus,
  type UpdateBotInput,
} from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import { AVATAR_HUE_OPTIONS, avatarCandidateSeeds, avatarHueSwatch } from "../../avatar";
import { normalizeAvatarFile } from "../../avatar-image";
import type { BotProfile } from "../../data";
import { type TranslationKey, t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { PanelResizer, readPanelWidth, savePanelWidth } from "../PanelResizer";
import { ProviderModelPicker } from "../ProviderModelPicker";
import {
  Button,
  ChevronRight,
  IconButton,
  Input,
  Popover,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../ui";
import { AgentMemoriesModal } from "./AgentMemoriesModal";
import { AgentRoutinesSettings, type AgentRoutinesView, type RoutineSelectionRequest } from "./AgentRoutinesSettings";
import { BackIcon, SettingsForwardIcon } from "./ConversationIcons";

const NOTIFICATION_LEVEL_OPTIONS: AgentNotificationLevel[] = [...AGENT_NOTIFICATION_LEVELS];
const APPROVAL_POLICY_OPTIONS: ApprovalPolicyMode[] = [...APPROVAL_POLICY_MODES];

const SETTINGS_PANEL_STORAGE_KEY = "lunabot:settings-panel-width";
const SETTINGS_PANEL_DEFAULT = 296;
const SETTINGS_PANEL_MIN = 180;
const SETTINGS_PANEL_MAX = 1600;

const AVATAR_HUE_LABEL_KEYS: Record<BotAvatarHue, TranslationKey> = {
  0: "settings.avatar.hue.red",
  30: "settings.avatar.hue.orange",
  55: "settings.avatar.hue.yellow",
  100: "settings.avatar.hue.lime",
  150: "settings.avatar.hue.green",
  185: "settings.avatar.hue.cyan",
  215: "settings.avatar.hue.blue",
  245: "settings.avatar.hue.indigo",
  280: "settings.avatar.hue.violet",
  320: "settings.avatar.hue.magenta",
};

export interface AgentRuntimeSettings {
  provider: AgentProviderId;
  model: AgentModelId;
  reasoningEffort: AgentReasoningEffort;
}

export type AgentRuntimeSettingsPatch = AgentRuntimeSettings | Pick<AgentRuntimeSettings, "reasoningEffort">;

interface AgentSettingsPanelProps {
  bot: BotProfile;
  runtimeSettings: AgentRuntimeSettings;
  agentStatus: AgentStatus;
  modelOptions: AgentModelOption[];
  working: boolean;
  providerRuntimeStatuses?: Partial<Record<AgentProviderId, ProviderRuntimeStatus>>;
  onDownloadProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onCancelProviderDownload?: (provider: AgentProviderId) => void | Promise<void>;
  onConnectProvider?: (provider: AgentProviderId) => void | Promise<void>;
  maxWidth: () => number;
  onClose: () => void;
  onWidthChange: (width: number) => void;
  onUpdateBot: (botId: string, updates: Omit<UpdateBotInput, "botId">) => Promise<void>;
  onUpdateRuntimeSettings: (
    botId: string,
    settings: AgentRuntimeSettings,
    updates: AgentRuntimeSettingsPatch,
  ) => Promise<boolean>;
  onSetAgentAvatar: (botId: string, image: AvatarImageInput | null) => Promise<void>;
  routineSelectionRequest?: RoutineSelectionRequest | null;
  onRoutineSelectionRequestHandled?: (nonce: number) => void;
  onOpenRoutineRun?: (messageId: string) => void;
}

export default function AgentSettingsPanel(props: AgentSettingsPanelProps) {
  const [panelWidth, setPanelWidth] = createSignal(
    readPanelWidth(SETTINGS_PANEL_STORAGE_KEY, SETTINGS_PANEL_DEFAULT, SETTINGS_PANEL_MIN, SETTINGS_PANEL_MAX),
  );
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [name, setName] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [dirty, setDirty] = createSignal({ name: false, title: false, description: false });
  const [notifications, setNotifications] = createSignal<AgentNotificationLevel>("all");
  const [approvalPolicy, setApprovalPolicy] = createSignal<ApprovalPolicyMode>("ask");
  const [provider, setProvider] = createSignal<AgentProviderId>(props.bot.provider);
  const [model, setModel] = createSignal<AgentModelId>("gpt-5.6-luna");
  const [reasoning, setReasoning] = createSignal<AgentReasoningEffort>("medium");
  const [avatarPickerOpen, setAvatarPickerOpen] = createSignal(false);
  const [avatarSeed, setAvatarSeed] = createSignal("agent");
  const [avatarHue, setAvatarHue] = createSignal<BotAvatarHue | null>(null);
  const [avatarUploadBusy, setAvatarUploadBusy] = createSignal(false);
  const [avatarCandidateSeed, setAvatarCandidateSeed] = createSignal("agent");
  const [avatarBatch, setAvatarBatch] = createSignal(0);
  const [memoryModalOpen, setMemoryModalOpen] = createSignal(false);
  const [memoryCount, setMemoryCount] = createSignal(0);
  const [routinesOpen, setRoutinesOpen] = createSignal(false);
  const [, setRoutineView] = createSignal<AgentRoutinesView>("list");
  const [routineCount, setRoutineCount] = createSignal(0);
  const avatarUrl = () => props.bot.avatarUrl ?? null;
  const selectedModel = createMemo(() =>
    props.modelOptions.find((option) => option.provider === provider() && option.id === model()),
  );
  const reasoningOptions = createMemo(() => selectedModel()?.supportedReasoningEfforts ?? ["medium" as const]);
  const avatarCandidates = createMemo(() => avatarCandidateSeeds(props.bot.id, avatarCandidateSeed(), avatarBatch()));
  let avatarPickerRoot: HTMLDivElement | undefined;
  let avatarFileInput: HTMLInputElement | undefined;
  let lastSignature: string | undefined;
  let lastBotId: string | undefined;

  createEffect(
    () => panelWidth(),
    (width) => {
      props.onWidthChange(width);
    },
  );

  createEffect(
    () => {
      const bot = props.bot;
      const runtimeSettings = props.runtimeSettings;
      return {
        bot,
        runtimeSettings,
        signature: [
          bot.id,
          bot.name,
          bot.title,
          bot.description,
          String(bot.notifications),
          runtimeSettings.provider,
          runtimeSettings.model,
          runtimeSettings.reasoningEffort,
          bot.avatarSeed,
          String(bot.avatarHue),
        ].join("\u0000"),
      };
    },
    ({ bot, runtimeSettings, signature }) => {
      if (signature === lastSignature) return;
      const botChanged = bot.id !== lastBotId;
      const currentDirty = botChanged ? { name: false, title: false, description: false } : dirty();
      lastSignature = signature;
      lastBotId = bot.id;
      if (botChanged) setDirty(currentDirty);
      if (!currentDirty.name) setName(bot.name);
      if (!currentDirty.title) setTitle(bot.title);
      if (!currentDirty.description) setDescription(bot.description);
      setNotifications(bot.notifications);
      setProvider(runtimeSettings.provider);
      setModel(runtimeSettings.model);
      setReasoning(runtimeSettings.reasoningEffort);
      setAvatarSeed(bot.avatarSeed);
      setAvatarHue(bot.avatarHue);
      if (botChanged) {
        setAvatarCandidateSeed(bot.avatarSeed);
        setAvatarBatch(0);
        setAvatarPickerOpen(false);
        setMemoryModalOpen(false);
        setRoutinesOpen(false);
        void window.lunabot.agent
          .listMemories(bot.id)
          .then((items) => setMemoryCount(items.length))
          .catch(() => setMemoryCount(0));
        void window.lunabot.agent
          .listRoutines(bot.id)
          .then((items) => setRoutineCount(items.length))
          .catch(() => setRoutineCount(0));
      }
    },
  );

  createEffect(
    () => ({ request: props.routineSelectionRequest, botId: props.bot.id }),
    ({ request }) => {
      if (request) setRoutinesOpen(true);
    },
  );

  onSettled(() => {
    const closeAvatarPicker = (event: PointerEvent) => {
      if (!avatarPickerOpen()) return;
      if (event.target instanceof Node && avatarPickerRoot?.contains(event.target)) return;
      setAvatarPickerOpen(false);
    };
    window.addEventListener("pointerdown", closeAvatarPicker);
    return () => window.removeEventListener("pointerdown", closeAvatarPicker);
  });

  createEffect(
    () => props.bot.id,
    (botId) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      setApprovalPolicy("ask");
      void window.lunabot.agentPreferences
        .getApprovalPolicy(botId)
        .then((mode) => {
          if (current) setApprovalPolicy(mode);
        })
        .catch((error: unknown) => {
          if (current) setSaveError(error instanceof Error ? error.message : t("settings.agent.saveFailed"));
        });
    },
  );

  async function saveApprovalPolicy(mode: ApprovalPolicyMode): Promise<void> {
    const previous = approvalPolicy();
    if (mode === previous) return;
    setSaveError(null);
    setApprovalPolicy(mode);
    try {
      setApprovalPolicy(await window.lunabot.agentPreferences.setApprovalPolicy({ botId: props.bot.id, mode }));
    } catch (error) {
      setApprovalPolicy(previous);
      setSaveError(error instanceof Error ? error.message : t("settings.agent.saveFailed"));
    }
  }

  async function saveBotPatch(updates: Omit<UpdateBotInput, "botId">): Promise<boolean> {
    setSaveError(null);
    try {
      await props.onUpdateBot(props.bot.id, updates);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("settings.agent.saveFailed"));
      return false;
    }
  }

  async function saveRuntimeSettings(
    settings: AgentRuntimeSettings,
    updates: AgentRuntimeSettingsPatch,
    botId = props.bot.id,
  ): Promise<boolean> {
    setSaveError(null);
    try {
      const saved = await props.onUpdateRuntimeSettings(botId, settings, updates);
      if (!saved && props.bot.id === botId) setSaveError(t("settings.agent.saveFailed"));
      return saved;
    } catch (error) {
      if (props.bot.id === botId) {
        setSaveError(error instanceof Error ? error.message : t("settings.agent.saveFailed"));
      }
      return false;
    }
  }

  function saveName(): void {
    const botId = props.bot.id;
    const value = name().trim() || t("onboarding.bot.newAgentName");
    setName(value);
    void saveBotPatch({ name: value }).then((saved) => {
      if (saved && props.bot.id === botId && name() === value) {
        setDirty((current) => ({ ...current, name: false }));
      }
    });
  }

  function saveTitle(): void {
    const botId = props.bot.id;
    const value = title().trim();
    setTitle(value);
    void saveBotPatch({ title: value }).then((saved) => {
      if (saved && props.bot.id === botId && title() === value) {
        setDirty((current) => ({ ...current, title: false }));
      }
    });
  }

  function saveDescription(): void {
    const botId = props.bot.id;
    const value = description();
    void saveBotPatch({ description: value }).then((saved) => {
      if (saved && props.bot.id === botId && description() === value) {
        setDirty((current) => ({ ...current, description: false }));
      }
    });
  }

  async function setCustomAvatar(image: AvatarImageInput | null): Promise<boolean> {
    if (avatarUploadBusy()) return false;
    setAvatarUploadBusy(true);
    setSaveError(null);
    try {
      await props.onSetAgentAvatar(props.bot.id, image);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("settings.agent.avatarSaveFailed"));
      return false;
    } finally {
      setAvatarUploadBusy(false);
    }
  }

  async function uploadAgentAvatar(file: File | undefined): Promise<void> {
    if (!file) return;
    setAvatarUploadBusy(true);
    setSaveError(null);
    try {
      const image = await normalizeAvatarFile(file);
      await props.onSetAgentAvatar(props.bot.id, image);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("settings.agent.avatarProcessFailed"));
    } finally {
      setAvatarUploadBusy(false);
      if (avatarFileInput) avatarFileInput.value = "";
    }
  }

  async function selectGeneratedAvatar(seed: string): Promise<void> {
    if (avatarUrl() && !(await setCustomAvatar(null))) return;
    setAvatarSeed(seed);
    await saveBotPatch({ avatarSeed: seed });
  }

  async function selectModel(nextModel: AgentModelId, nextProvider: AgentProviderId): Promise<void> {
    const option = props.modelOptions.find(
      (candidate) => candidate.provider === nextProvider && candidate.id === nextModel,
    );
    if (!option) return;
    const nextReasoning = option.supportedReasoningEfforts.includes(reasoning())
      ? reasoning()
      : option.defaultReasoningEffort;
    const previousModel = model();
    const previousProvider = provider();
    const previousReasoning = reasoning();
    const botId = props.bot.id;
    const settings = { provider: nextProvider, model: nextModel, reasoningEffort: nextReasoning };
    setProvider(nextProvider);
    setModel(nextModel);
    setReasoning(nextReasoning);
    if (await saveRuntimeSettings(settings, settings, botId)) return;
    if (
      props.bot.id !== botId ||
      provider() !== settings.provider ||
      model() !== settings.model ||
      reasoning() !== settings.reasoningEffort
    ) {
      return;
    }
    setProvider(previousProvider);
    setModel(previousModel);
    setReasoning(previousReasoning);
  }

  async function selectReasoning(nextReasoning: AgentReasoningEffort): Promise<void> {
    const botId = props.bot.id;
    const previousReasoning = reasoning();
    const settings = { provider: provider(), model: model(), reasoningEffort: nextReasoning };
    setReasoning(nextReasoning);
    if (await saveRuntimeSettings(settings, { reasoningEffort: nextReasoning }, botId)) return;
    if (
      props.bot.id === botId &&
      provider() === settings.provider &&
      model() === settings.model &&
      reasoning() === nextReasoning
    ) {
      setReasoning(previousReasoning);
    }
  }

  return (
    <aside id="settings-side-panel" class="agent-settings-panel" aria-label={t("settings.agent.panel")}>
      <PanelResizer
        class="right-panel-resizer"
        label={t("settings.agent.resizePanel")}
        controls="settings-side-panel"
        direction="right"
        value={panelWidth()}
        defaultValue={SETTINGS_PANEL_DEFAULT}
        min={SETTINGS_PANEL_MIN}
        max={props.maxWidth}
        onResize={setPanelWidth}
        onResizeEnd={(value) => savePanelWidth(SETTINGS_PANEL_STORAGE_KEY, value)}
      />
      <Show when={!routinesOpen()}>
        <header class="agent-settings-header">
          <IconButton
            size="md"
            variant="ghost"
            type="button"
            class="agent-settings-nav-button"
            label={t("settings.agent.backToDetails")}
            tooltip=""
            onClick={props.onClose}
          >
            <BackIcon />
          </IconButton>
          <h2>{t("settings.agent.title")}</h2>
          <IconButton
            size="md"
            variant="ghost"
            type="button"
            class="agent-settings-nav-button"
            label={t("settings.agent.closeDetails")}
            tooltip=""
            onClick={props.onClose}
          >
            <SettingsForwardIcon />
          </IconButton>
        </header>
      </Show>
      <Show when={!routinesOpen()}>
        <div class="agent-settings-content">
          <div ref={(element) => (avatarPickerRoot = element)} class="agent-settings-avatar-picker">
            <Popover.Root
              open={avatarPickerOpen()}
              placement="bottom"
              gutter={11}
              onOpenChange={(open) => {
                if (open) {
                  setAvatarCandidateSeed(avatarSeed());
                  setAvatarBatch(0);
                }
                setAvatarPickerOpen(open);
              }}
            >
              <Popover.Trigger class="agent-settings-avatar" aria-label={t("settings.agent.editAvatar")}>
                <AgentAvatar seed={avatarSeed()} hue={avatarHue()} url={avatarUrl()} motion="always" />
              </Popover.Trigger>
              <Popover.Content class="avatar-editor" aria-hidden={avatarPickerOpen() ? undefined : "true"}>
                <Popover.Title class="sr-only">{t("settings.avatar.editor")}</Popover.Title>
                <Input
                  ref={(element) => (avatarFileInput = element)}
                  class="sr-only"
                  type="file"
                  aria-label={t("settings.avatar.attachFiles")}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void uploadAgentAvatar(event.currentTarget.files?.[0])}
                />
                <div class="avatar-editor-heading">
                  <span>{t("settings.avatar.image")}</span>
                  <div class="avatar-editor-actions">
                    <Show when={avatarUrl()}>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={avatarUploadBusy()}
                        onClick={() => void setCustomAvatar(null)}
                      >
                        {t("settings.avatar.remove")}
                      </Button>
                    </Show>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  class={["avatar-image-upload", { "avatar-image-upload-active": Boolean(avatarUrl()) }]}
                  disabled={avatarUploadBusy()}
                  onClick={() => avatarFileInput?.click()}
                >
                  <span class="avatar-image-upload-preview">
                    <Show
                      when={avatarUrl()}
                      fallback={
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      }
                    >
                      <AgentAvatar seed={avatarSeed()} hue={avatarHue()} url={avatarUrl()} />
                    </Show>
                  </span>
                  <span>
                    <strong>{avatarUrl() ? t("settings.avatar.replace") : t("settings.avatar.upload")}</strong>
                    <small>{t("settings.avatar.formats")}</small>
                  </span>
                </Button>
                <div class="avatar-editor-divider" />
                <div class="avatar-editor-heading">
                  <span>{t("settings.avatar.generatedFace")}</span>
                  <div class="avatar-editor-actions">
                    <Show when={avatarSeed() !== props.bot.id}>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                          setAvatarCandidateSeed(props.bot.id);
                          setAvatarBatch(0);
                          void selectGeneratedAvatar(props.bot.id);
                        }}
                      >
                        {t("settings.avatar.resetToId")}
                      </Button>
                    </Show>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setAvatarCandidateSeed(avatarSeed());
                        setAvatarBatch((batch) => batch + 1);
                      }}
                    >
                      {t("settings.avatar.newSet")}
                    </Button>
                  </div>
                </div>
                <fieldset class="avatar-face-grid" aria-label={t("settings.avatar.facesGroup")}>
                  <For each={avatarCandidates()}>
                    {(seed, index) => (
                      <Button
                        variant="ghost"
                        type="button"
                        class={[
                          "avatar-face-choice",
                          { "avatar-choice-selected": !avatarUrl() && avatarSeed() === seed },
                        ]}
                        aria-label={
                          !avatarUrl() && avatarSeed() === seed
                            ? t("settings.avatar.selected")
                            : t("settings.avatar.option", { number: index() + 1 })
                        }
                        aria-pressed={!avatarUrl() && avatarSeed() === seed ? "true" : "false"}
                        onClick={() => void selectGeneratedAvatar(seed)}
                      >
                        <AgentAvatar seed={seed} hue={avatarHue()} />
                      </Button>
                    )}
                  </For>
                </fieldset>
                <div class="avatar-editor-divider" />
                <div class="avatar-editor-heading">
                  <span>{t("settings.avatar.color")}</span>
                </div>
                <fieldset class="avatar-color-grid" aria-label={t("settings.avatar.colorGroup")}>
                  <Button
                    variant="ghost"
                    type="button"
                    class={["avatar-color-choice", { "avatar-choice-selected": avatarHue() === null }]}
                    aria-label={t("settings.avatar.colorAuto")}
                    aria-pressed={avatarHue() === null ? "true" : "false"}
                    onClick={() => {
                      setAvatarHue(null);
                      void saveBotPatch({ avatarHue: null });
                    }}
                  >
                    <span class="avatar-color-swatch avatar-color-swatch-auto">A</span>
                  </Button>
                  <For each={AVATAR_HUE_OPTIONS}>
                    {(option) => (
                      <Button
                        variant="ghost"
                        type="button"
                        class={["avatar-color-choice", { "avatar-choice-selected": avatarHue() === option.hue }]}
                        aria-label={t("settings.avatar.colorNamed", { color: t(AVATAR_HUE_LABEL_KEYS[option.hue]) })}
                        aria-pressed={avatarHue() === option.hue ? "true" : "false"}
                        onClick={() => {
                          setAvatarHue(option.hue);
                          void saveBotPatch({ avatarHue: option.hue });
                        }}
                      >
                        <span class="avatar-color-swatch" style={{ background: avatarHueSwatch(option.hue) }} />
                      </Button>
                    )}
                  </For>
                </fieldset>
              </Popover.Content>
            </Popover.Root>
          </div>
          <label class="agent-settings-field">
            <span>{t("settings.common.name")}</span>
            <Input
              value={name()}
              aria-label={t("settings.agent.nameAria")}
              maxlength={INPUT_LIMITS.agentName}
              onValueChange={(value) => {
                setName(value);
                setDirty((current) => ({ ...current, name: true }));
              }}
              onBlur={saveName}
            />
          </label>
          <label class="agent-settings-field">
            <span>{t("settings.agent.titleField")}</span>
            <Input
              value={title()}
              aria-label={t("settings.agent.titleAria")}
              placeholder={t("settings.agent.titlePlaceholder")}
              maxlength={INPUT_LIMITS.agentTitle}
              onValueChange={(value) => {
                setTitle(value);
                setDirty((current) => ({ ...current, title: true }));
              }}
              onBlur={saveTitle}
            />
          </label>
          <label class="agent-settings-field agent-settings-description">
            <span>{t("settings.agent.descriptionField")}</span>
            <Textarea
              rows="4"
              value={description()}
              aria-label={t("settings.agent.descriptionAria")}
              placeholder={t("settings.agent.descriptionPlaceholder")}
              maxlength={INPUT_LIMITS.agentDescription}
              onValueChange={(value) => {
                setDescription(value);
                setDirty((current) => ({ ...current, description: true }));
              }}
              onBlur={saveDescription}
            />
          </label>
          <div class="agent-settings-links">
            <Button variant="ghost" type="button" class="agent-settings-link" onClick={() => setMemoryModalOpen(true)}>
              <span class="agent-settings-link-label">{t("settings.agent.memories")}</span>
              <span class="agent-settings-link-value">
                {t("settings.agent.memoriesCount", { count: memoryCount() })}
                <ChevronRight />
              </span>
            </Button>
            <Button variant="ghost" type="button" class="agent-settings-link" onClick={() => setRoutinesOpen(true)}>
              <span class="agent-settings-link-label">{t("settings.agent.routines")}</span>
              <span class="agent-settings-link-value">
                {t("settings.agent.routinesCount", { count: routineCount() })}
                <ChevronRight />
              </span>
            </Button>
          </div>
          <section class="agent-settings-model" aria-labelledby="agent-model-heading">
            <div class="agent-settings-section-heading">
              <strong id="agent-model-heading">{t("settings.agent.runtime")}</strong>
              <span>{t("settings.agent.runtimeDescription")}</span>
            </div>
            <div class="agent-settings-model-controls">
              <div class="agent-settings-model-option">
                <ProviderModelPicker
                  variant="field"
                  ariaLabel={t("settings.agent.model")}
                  provider={provider()}
                  value={model()}
                  agentStatus={props.agentStatus}
                  modelOptions={props.modelOptions}
                  runtimeStatuses={props.providerRuntimeStatuses}
                  onDownloadProvider={props.onDownloadProvider}
                  onCancelProviderDownload={props.onCancelProviderDownload}
                  onConnectProvider={props.onConnectProvider}
                  disabled={props.working}
                  disabledReason={props.working ? t("settings.agent.modelBusy") : t("settings.agent.modelUnavailable")}
                  onChange={(nextModel, provider) => void selectModel(nextModel, provider)}
                />
              </div>
              <div class="agent-settings-model-row agent-settings-thinking-row">
                <span>{t("settings.agent.reasoning")}</span>
                <Select<AgentReasoningEffort>
                  class="agent-settings-reasoning-control"
                  options={reasoningOptions()}
                  value={reasoning()}
                  onChange={(nextReasoning) => {
                    if (!nextReasoning || nextReasoning === reasoning()) return;
                    void selectReasoning(nextReasoning);
                  }}
                  itemComponent={(item) => (
                    <SelectItem item={item.item}>{reasoningLabel(item.item.rawValue)}</SelectItem>
                  )}
                >
                  <SelectTrigger
                    size="sm"
                    class="agent-settings-reasoning-select"
                    aria-label={t("settings.agent.reasoningLevel")}
                  >
                    <SelectValue<AgentReasoningEffort>>
                      {(state) => {
                        const effort = state.selectedOption();
                        return effort ? reasoningLabel(effort) : t("settings.agent.selectReasoning");
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </div>
          </section>
          <Show when={saveError()}>
            {(message) => (
              <p class="agent-settings-save-error" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="agent-settings-notifications">
            <div>
              <strong>{t("settings.notifications.title")}</strong>
              <span>{t("settings.agent.notificationsDescription")}</span>
            </div>
            <Select<AgentNotificationLevel>
              class="agent-settings-notifications-control"
              options={NOTIFICATION_LEVEL_OPTIONS}
              value={notifications()}
              onChange={(next) => {
                if (!next || next === notifications()) return;
                setNotifications(next);
                void saveBotPatch({ notifications: next });
              }}
              itemComponent={(item) => (
                <SelectItem item={item.item}>{notificationLevelLabel(item.item.rawValue)}</SelectItem>
              )}
            >
              <SelectTrigger size="sm" aria-label={t("settings.notifications.title")}>
                <SelectValue<AgentNotificationLevel>>
                  {(state) => {
                    const level = state.selectedOption();
                    return level ? notificationLevelLabel(level) : "";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>
          <div class="agent-settings-notifications agent-settings-approvals">
            <div>
              <strong>{t("settings.agent.approvals.title")}</strong>
              <span>{t("settings.agent.approvals.description")}</span>
              <span class="agent-settings-approvals-warning" role="note">
                {t("settings.agent.approvals.warning")}
              </span>
            </div>
            <Select<ApprovalPolicyMode>
              class="agent-settings-notifications-control"
              options={APPROVAL_POLICY_OPTIONS}
              value={approvalPolicy()}
              onChange={(next) => {
                if (next) void saveApprovalPolicy(next);
              }}
              itemComponent={(item) => (
                <SelectItem item={item.item}>{approvalPolicyLabel(item.item.rawValue)}</SelectItem>
              )}
            >
              <SelectTrigger size="sm" aria-label={t("settings.agent.approvals.title")}>
                <SelectValue<ApprovalPolicyMode>>
                  {(state) => {
                    const mode = state.selectedOption();
                    return mode ? approvalPolicyLabel(mode) : "";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>
        </div>
      </Show>
      <Show when={routinesOpen()}>
        <div class="agent-routines-overlay">
          <AgentRoutinesSettings
            botId={props.bot.id}
            onCountChange={setRoutineCount}
            onViewChange={setRoutineView}
            onBack={() => setRoutinesOpen(false)}
            onClose={props.onClose}
            selectionRequest={props.routineSelectionRequest}
            onSelectionRequestHandled={props.onRoutineSelectionRequestHandled}
            onOpenRun={props.onOpenRoutineRun}
          />
        </div>
      </Show>
      <AgentMemoriesModal
        botId={props.bot.id}
        botName={props.bot.name}
        open={memoryModalOpen()}
        onOpenChange={setMemoryModalOpen}
        onCountChange={setMemoryCount}
      />
    </aside>
  );
}

function approvalPolicyLabel(mode: ApprovalPolicyMode): string {
  switch (mode) {
    case "ask":
      return t("settings.agent.approvals.ask");
    case "safe-project":
      return t("settings.agent.approvals.safeProject");
    case "project-all":
      return t("settings.agent.approvals.projectAll");
  }
}

function notificationLevelLabel(level: AgentNotificationLevel): string {
  switch (level) {
    case "all":
      return t("settings.agent.notificationLevel.all");
    case "needs-me":
      return t("settings.agent.notificationLevel.needsMe");
    case "nothing":
      return t("settings.agent.notificationLevel.nothing");
  }
}

function reasoningLabel(effort: AgentReasoningEffort): string {
  switch (effort) {
    case "low":
      return t("settings.reasoning.low");
    case "medium":
      return t("settings.reasoning.medium");
    case "high":
      return t("settings.reasoning.high");
    case "xhigh":
      return t("settings.reasoning.xhigh");
    case "max":
      return t("settings.reasoning.max");
  }
}
