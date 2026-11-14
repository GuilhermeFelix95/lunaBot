import {
  AGENT_MEMORY_LIMITS,
  type AgentMemoryLimit,
  type AgentProviderId,
  type AgentStatus,
  type AppInfo,
  BUSY_MESSAGE_MODES,
  type BusyMessageMode,
  isUpdateActivePhase,
  type ProviderRuntimeStatus,
  type UpdateStatus,
  WINDOW_CLOSE_BEHAVIORS,
  type WindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { GeneralSettingsValue } from "../app-settings";
import {
  LOCALE_PREFERENCES,
  type LocalePreference,
  localePreference,
  setLocalePreference,
  type TranslationKey,
  t,
} from "../i18n";
import { fallbackDesktopPlatform } from "../platform-layout";
import {
  MODE_PREFERENCES,
  type ModePreference,
  modePreference,
  setModePreference,
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  themePreference,
} from "../theme";
import { presentUpdateStatus } from "../update-status";
import { ComputerUseMacSetup } from "./ComputerUseMacSetup";
import { ProviderPicker, type ProviderPickerOption } from "./ProviderPicker";
import { SettingsDialogShell } from "./SettingsDialogShell";
import {
  Button,
  CircleArrowDown,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  MousePointer2,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Settings,
  SettingsSection,
  SwitchField,
  Tabs,
} from "./ui";

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: GeneralSettingsValue;
  onValueChange: (value: GeneralSettingsValue) => void;
  appInfo: AppInfo | null;
  updateStatus: UpdateStatus;
  onUpdateAction: () => Promise<void>;
  agentStatus?: AgentStatus;
  providerRuntimeStatuses?: Partial<Record<AgentProviderId, ProviderRuntimeStatus>>;
  onDownloadProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onCancelProviderDownload?: (provider: AgentProviderId) => void | Promise<void>;
  onConnectProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onRefreshProviders?: () => void | Promise<void>;
  restoreFocusTarget?: HTMLElement | null;
}

type SettingsTab = "general" | "computer-use" | "updates";

type SettingsNavItem = { value: SettingsTab; label: () => string; icon: typeof Settings };

const navItems: ReadonlyArray<SettingsNavItem> = [
  { value: "general", label: () => t("settings.tab.general"), icon: Settings },
  { value: "computer-use", label: () => t("settings.tab.computerUse"), icon: MousePointer2 },
  { value: "updates", label: () => t("settings.tab.updates"), icon: CircleArrowDown },
];

const tabDetails: Record<SettingsTab, { title: () => string; description: () => string }> = {
  general: {
    title: () => t("settings.tab.general"),
    description: () => t("settings.tab.generalDescription"),
  },
  "computer-use": {
    title: () => t("settings.tab.computerUse"),
    description: () => t("settings.tab.computerUseDescription"),
  },
  updates: {
    title: () => t("settings.tab.updates"),
    description: () => t("settings.tab.updatesDescription"),
  },
};

function languageLabel(option: LocalePreference | undefined): string {
  switch (option) {
    case "system":
      return t("settings.language.system");
    case "en":
      return t("settings.language.en");
    case "pt-BR":
      return t("settings.language.ptBR");
    case undefined:
      return "";
  }
}

const themeCopy: Record<ThemePreference, { label: TranslationKey; description: TranslationKey }> = {
  auto: { label: "settings.appearance.auto", description: "settings.appearance.autoDescription" },
  papel: { label: "settings.appearance.papel", description: "settings.appearance.papelDescription" },
  eclipse: { label: "settings.appearance.eclipse", description: "settings.appearance.eclipseDescription" },
  quadrante: { label: "settings.appearance.quadrante", description: "settings.appearance.quadranteDescription" },
};

const modeCopy: Record<ModePreference, TranslationKey> = {
  system: "settings.appearance.modeSystem",
  light: "settings.appearance.modeLight",
  dark: "settings.appearance.modeDark",
};

// Each card previews its theme in both modes: left half light, right half dark. Auto resolves per half.
function ThemeCard(props: { option: ThemePreference }) {
  const copy = () => themeCopy[props.option];
  const halfTheme = (mode: "light" | "dark") =>
    props.option === "auto" ? (mode === "dark" ? "eclipse" : "papel") : props.option;
  return (
    <RadioGroup.Item class="settings-theme-card" value={props.option}>
      <RadioGroup.ItemInput aria-label={t(copy().label)} />
      <RadioGroup.ItemControl class="settings-theme-swatch" aria-hidden="true">
        <span class="settings-theme-half" data-theme={halfTheme("light")} data-mode="light" />
        <span class="settings-theme-half" data-theme={halfTheme("dark")} data-mode="dark" />
      </RadioGroup.ItemControl>
      <RadioGroup.ItemLabel class="settings-theme-card-label">{t(copy().label)}</RadioGroup.ItemLabel>
      <RadioGroup.ItemDescription class="settings-theme-card-description">
        {t(copy().description)}
      </RadioGroup.ItemDescription>
    </RadioGroup.Item>
  );
}

const linkTargetOptions: GeneralSettingsValue["externalLinkTarget"][] = ["Default browser", "Luna Bot"];
type UpdateTrack = "Stable";
const updateTrackOptions: UpdateTrack[] = ["Stable"];
const memoryLimitOptions: AgentMemoryLimit[] = [...AGENT_MEMORY_LIMITS];
const busyMessageOptions: BusyMessageMode[] = [...BUSY_MESSAGE_MODES];
const windowCloseOptions: WindowCloseBehavior[] = [...WINDOW_CLOSE_BEHAVIORS];

function busyMessageLabel(mode: BusyMessageMode): string {
  return mode === "steer" ? t("settings.agents.busyMessageSteer") : t("settings.agents.busyMessageQueue");
}

function windowCloseLabel(behavior: WindowCloseBehavior): string {
  if (behavior === "keep") return t("settings.behavior.closeKeep");
  if (behavior === "quit") return t("settings.behavior.closeQuit");
  return t("settings.behavior.closeAsk");
}
const COMPACT_WINDOW_DEFAULT_KEY = "default";
const compactWindowOptions: string[] = [
  COMPACT_WINDOW_DEFAULT_KEY,
  ...["100000", "200000", "400000", "600000", "800000", "1000000"],
];

function compactWindowKey(tokens: number | null): string {
  return tokens === null ? COMPACT_WINDOW_DEFAULT_KEY : String(tokens);
}

function compactWindowFromKey(key: string): number | null {
  return key === COMPACT_WINDOW_DEFAULT_KEY ? null : Number(key);
}

function compactWindowLabel(key: string): string {
  if (key === COMPACT_WINDOW_DEFAULT_KEY) return t("settings.agents.compactWindowDefault");
  const tokens = Number(key);
  return t("settings.agents.compactWindowValue", {
    tokens: tokens >= 1_000_000 ? `${tokens / 1_000_000}M` : `${tokens / 1_000}k`,
  });
}

function linkTargetLabel(target: GeneralSettingsValue["externalLinkTarget"] | undefined): string {
  if (target === "Default browser") return t("settings.workspace.linkDefaultBrowser");
  return target ?? "";
}

function updateTrackLabel(track: UpdateTrack): string {
  return track === "Stable" ? t("settings.updates.trackStable") : track;
}

export function SettingsModal(props: SettingsModalProps) {
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("general");
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [selectedProvider, setSelectedProvider] = createSignal<AgentProviderId | null>(null);
  let modalElement: HTMLElement | undefined;

  const title = () => tabDetails[activeTab()].title();
  const description = () => tabDetails[activeTab()].description();
  const updatePresentation = createMemo(() => presentUpdateStatus(props.updateStatus));
  const installedVersion = () =>
    props.updateStatus.currentVersion || props.appInfo?.version || t("settings.updates.unknownVersion");
  const targetUpdate = () =>
    props.updateStatus.availableVersion
      ? t("settings.updates.targetVersion", { version: props.updateStatus.availableVersion })
      : t("settings.updates.targetLatest");
  const updateMessage = () => {
    if (updateError()) return updateError();
    switch (props.updateStatus.phase) {
      case "idle":
        return t("settings.updates.idle", { track: updateTrackLabel("Stable") });
      case "checking":
        return t("settings.updates.checking", { track: updateTrackLabel("Stable") });
      case "available":
        return t("settings.updates.available", { target: targetUpdate() });
      case "downloading":
        return props.updateStatus.progress === null
          ? t("settings.updates.downloadingPending", { target: targetUpdate() })
          : t("settings.updates.downloading", {
              target: targetUpdate(),
              percent: Math.round(props.updateStatus.progress),
            });
      case "ready":
        return t("settings.updates.ready", { target: targetUpdate() });
      case "installing":
        return t("settings.updates.installing", { target: targetUpdate() });
      case "up-to-date":
        return t("settings.updates.upToDate", { track: updateTrackLabel("Stable") });
      case "error":
        return props.updateStatus.message ?? t("settings.updates.errorFallback");
      case "unsupported":
        return props.updateStatus.message ?? t("settings.updates.unsupportedFallback");
    }
  };
  const updateMessageClass = () => {
    if (updateError() || props.updateStatus.phase === "error")
      return "settings-modal-update-status settings-modal-error";
    if (isUpdateActivePhase(props.updateStatus.phase)) {
      return "settings-modal-update-status settings-modal-update-status-active";
    }
    return "settings-modal-update-status";
  };
  const providerOptions = createMemo<ProviderPickerOption[]>(() =>
    (["codex", "claude", "grok"] as const).map((provider) => {
      const agent = props.agentStatus?.providers?.find((candidate) => candidate.id === provider);
      const runtime = props.providerRuntimeStatuses?.[provider];
      return {
        id: provider,
        name: provider === "codex" ? "ChatGPT" : provider === "claude" ? "Claude" : "Grok",
        description: t("settings.providers.available"),
        state: agent?.state ?? "not-installed",
        message: agent?.message,
        email: agent?.email,
        connectionState: agent?.connectionState,
        checkError: agent?.checkError,
        runtimeStatus:
          runtime?.phase === "not-downloaded" && (agent?.state === "available" || agent?.state === "sign-in-required")
            ? { ...runtime, phase: "ready", version: agent.version ?? null }
            : runtime,
      };
    }),
  );
  const tabsProps = {
    get value() {
      return activeTab();
    },
    onChange(value: string) {
      if (value === "general" || value === "computer-use" || value === "updates") {
        setActiveTab(value);
      }
    },
    orientation: "vertical" as const,
    activationMode: "automatic" as const,
  };

  function updateSetting<Key extends keyof GeneralSettingsValue>(key: Key, value: GeneralSettingsValue[Key]): void {
    props.onValueChange({ ...props.value, [key]: value });
  }

  async function runUpdateAction(): Promise<void> {
    if (updatePresentation().busy || !updatePresentation().supported) return;
    setUpdateError(null);
    try {
      await props.onUpdateAction();
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : t("settings.updates.failed"));
    }
  }

  return (
    <Tabs.Root {...tabsProps} class="settings-modal-tabs-root">
      <SettingsDialogShell
        class="app-settings-modal-shell"
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={title()}
        description={description()}
        contentKey={activeTab()}
        restoreFocusTarget={props.restoreFocusTarget}
        onContentElement={(element) => (modalElement = element)}
        sidebar={
          <Tabs.List class="settings-modal-nav" aria-label={t("settings.modal.sections")}>
            {navItems
              .filter((item) => item.value !== "computer-use" || props.appInfo?.platform === "darwin")
              .map((item) => {
                const NavIcon = item.icon;
                return (
                  <Tabs.Trigger
                    class="settings-modal-nav-item"
                    value={item.value}
                    aria-current={activeTab() === item.value ? "page" : undefined}
                  >
                    <NavIcon aria-hidden="true" />
                    <span>{item.label()}</span>
                  </Tabs.Trigger>
                );
              })}
          </Tabs.List>
        }
      >
        <Tabs.Content value="general" class="settings-modal-tab-panel" data-tab="general">
          <SettingsSection title={t("settings.providers.title")}>
            <ProviderPicker
              value={selectedProvider()}
              options={providerOptions()}
              ariaLabel={t("settings.providers.title")}
              embedded
              allowUnavailableSelection
              onChange={setSelectedProvider}
              onDownloadProvider={props.onDownloadProvider}
              onCancelProviderDownload={props.onCancelProviderDownload}
              onConnectProvider={props.onConnectProvider}
              onRefreshProviders={props.onRefreshProviders}
            />
          </SettingsSection>

          <SettingsSection title={t("settings.language.title")}>
            <ItemGroup class="settings-modal-card">
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.language.row")}</ItemTitle>
                  <ItemDescription>{t("settings.language.rowDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<LocalePreference>
                    class="settings-modal-select"
                    options={LOCALE_PREFERENCES}
                    value={localePreference()}
                    onChange={(value) => value && setLocalePreference(value)}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{languageLabel(selectProps.item.rawValue)}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.language.row")}>
                      <SelectValue<LocalePreference>>{(state) => languageLabel(state.selectedOption())}</SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
            </ItemGroup>
          </SettingsSection>

          <SettingsSection title={t("settings.appearance.title")}>
            <ItemGroup class="settings-modal-card">
              <Item class="settings-modal-row settings-theme-row">
                <ItemContent>
                  <ItemTitle>{t("settings.appearance.row")}</ItemTitle>
                  <ItemDescription>{t("settings.appearance.rowDescription")}</ItemDescription>
                </ItemContent>
              </Item>
              <RadioGroup.Root
                class="settings-theme-cards"
                aria-label={t("settings.appearance.row")}
                value={themePreference()}
                onChange={(value) => {
                  const option = THEME_PREFERENCES.find((preference) => preference === value);
                  if (option) setThemePreference(option);
                }}
              >
                <For each={THEME_PREFERENCES}>{(option) => <ThemeCard option={option} />}</For>
              </RadioGroup.Root>
            </ItemGroup>
            <ItemGroup class="settings-modal-card">
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.appearance.modeRow")}</ItemTitle>
                  <ItemDescription>{t("settings.appearance.modeRowDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<ModePreference>
                    class="settings-modal-select"
                    options={MODE_PREFERENCES}
                    value={modePreference()}
                    onChange={(value) => value && setModePreference(value)}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{t(modeCopy[selectProps.item.rawValue])}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.appearance.modeRow")}>
                      <SelectValue<ModePreference>>
                        {(state) => {
                          const option = state.selectedOption();
                          return option ? t(modeCopy[option]) : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
            </ItemGroup>
          </SettingsSection>

          <SettingsSection title={t("settings.behavior.title")}>
            <ItemGroup class="settings-modal-card">
              <SwitchField
                checked={props.value.launchAtLogin}
                onChange={(checked) => updateSetting("launchAtLogin", checked)}
                label={t("settings.behavior.launchAtLogin")}
                description={t("settings.behavior.launchAtLoginDescription")}
              />
              <Show when={props.appInfo?.platform !== "darwin"}>
                <Item class="settings-modal-row">
                  <ItemContent>
                    <ItemTitle>{t("settings.behavior.windowClose")}</ItemTitle>
                    <ItemDescription>{t("settings.behavior.windowCloseDescription")}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Select<WindowCloseBehavior>
                      class="settings-modal-select"
                      options={windowCloseOptions}
                      value={props.value.windowCloseBehavior}
                      onChange={(behavior) => behavior && updateSetting("windowCloseBehavior", behavior)}
                      placement="bottom-end"
                      itemComponent={(selectProps) => (
                        <SelectItem item={selectProps.item}>{windowCloseLabel(selectProps.item.rawValue)}</SelectItem>
                      )}
                    >
                      <SelectTrigger size="sm" aria-label={t("settings.behavior.windowClose")}>
                        <SelectValue<WindowCloseBehavior>>
                          {(state) => windowCloseLabel(state.selectedOption())}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent mount={modalElement} />
                    </Select>
                  </ItemActions>
                </Item>
              </Show>
            </ItemGroup>
          </SettingsSection>

          <SettingsSection title={t("settings.agents.title")}>
            <ItemGroup class="settings-modal-card">
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.agents.memoryLimit")}</ItemTitle>
                  <ItemDescription>{t("settings.agents.memoryLimitDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<AgentMemoryLimit>
                    class="settings-modal-select"
                    options={memoryLimitOptions}
                    value={props.value.agentMemoryLimit}
                    onChange={(value) => value && updateSetting("agentMemoryLimit", value)}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>
                        {t("settings.agents.memoryLimitValue", { limit: selectProps.item.rawValue })}
                      </SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.agents.memoryLimit")}>
                      <SelectValue<AgentMemoryLimit>>
                        {(state) => t("settings.agents.memoryLimitValue", { limit: state.selectedOption() })}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.agents.compactWindow")}</ItemTitle>
                  <ItemDescription>{t("settings.agents.compactWindowDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<string>
                    class="settings-modal-select"
                    options={compactWindowOptions}
                    value={compactWindowKey(props.value.claudeCompactWindow)}
                    onChange={(key) => key && updateSetting("claudeCompactWindow", compactWindowFromKey(key))}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{compactWindowLabel(selectProps.item.rawValue)}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.agents.compactWindow")}>
                      <SelectValue<string>>{(state) => compactWindowLabel(state.selectedOption())}</SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.agents.busyMessage")}</ItemTitle>
                  <ItemDescription>{t("settings.agents.busyMessageDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<BusyMessageMode>
                    class="settings-modal-select"
                    options={busyMessageOptions}
                    value={props.value.busyMessageMode}
                    onChange={(mode) => mode && updateSetting("busyMessageMode", mode)}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{busyMessageLabel(selectProps.item.rawValue)}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.agents.busyMessage")}>
                      <SelectValue<BusyMessageMode>>{(state) => busyMessageLabel(state.selectedOption())}</SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
            </ItemGroup>
          </SettingsSection>

          <SettingsSection title={t("settings.workspace.title")}>
            <ItemGroup class="settings-modal-card">
              <SwitchField
                checked={props.value.restoreLastWorkspace}
                onChange={(checked) => updateSetting("restoreLastWorkspace", checked)}
                label={t("settings.workspace.restoreLast")}
                description={t("settings.workspace.restoreLastDescription")}
              />
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemTitle>{t("settings.workspace.externalLinks")}</ItemTitle>
                  <ItemDescription>{t("settings.workspace.externalLinksDescription")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<GeneralSettingsValue["externalLinkTarget"]>
                    class="settings-modal-select"
                    options={linkTargetOptions}
                    value={props.value.externalLinkTarget}
                    onChange={(value) => value && updateSetting("externalLinkTarget", value)}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{linkTargetLabel(selectProps.item.rawValue)}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.workspace.externalLinks")}>
                      <SelectValue<GeneralSettingsValue["externalLinkTarget"]>>
                        {(state) => linkTargetLabel(state.selectedOption())}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
            </ItemGroup>
          </SettingsSection>

          <SettingsSection title={t("settings.notifications.title")}>
            <ItemGroup class="settings-modal-card">
              <SwitchField
                checked={props.value.desktopNotifications}
                onChange={(checked) => updateSetting("desktopNotifications", checked)}
                label={t("settings.notifications.desktop")}
                description={t("settings.notifications.desktopDescription")}
              />
              <SwitchField
                checked={props.value.taskCompletionSound}
                onChange={(checked) => updateSetting("taskCompletionSound", checked)}
                label={t("settings.notifications.sound")}
                description={t("settings.notifications.soundDescription")}
              />
            </ItemGroup>
          </SettingsSection>

          <Show when={props.appInfo?.platform === "darwin"}>
            <SettingsSection title={t("settings.notch.title")}>
              <ItemGroup class="settings-modal-card">
                <SwitchField
                  checked={props.value.macBookNotch}
                  onChange={(checked) => updateSetting("macBookNotch", checked)}
                  label={t("settings.notch.show")}
                  description={t("settings.notch.showDescription")}
                />
                <SwitchField
                  checked={props.value.macBookNotchIdle}
                  disabled={!props.value.macBookNotch}
                  onChange={(checked) => updateSetting("macBookNotchIdle", checked)}
                  label={t("settings.notch.idle")}
                  description={t("settings.notch.idleDescription")}
                />
                <SwitchField
                  checked={props.value.macBookNotchAdditionalDisplays}
                  disabled={!props.value.macBookNotch}
                  onChange={(checked) => updateSetting("macBookNotchAdditionalDisplays", checked)}
                  label={t("settings.notch.additionalDisplays")}
                  description={t("settings.notch.additionalDisplaysDescription")}
                />
                <SwitchField
                  checked={props.value.macBookNotchHaptics}
                  disabled={!props.value.macBookNotch}
                  onChange={(checked) => updateSetting("macBookNotchHaptics", checked)}
                  label={t("settings.notch.haptics")}
                  description={t("settings.notch.hapticsDescription")}
                />
              </ItemGroup>
            </SettingsSection>
          </Show>
        </Tabs.Content>

        <Tabs.Content value="computer-use" class="settings-modal-tab-panel" data-tab="computer-use">
          <ComputerUseMacSetup platform={props.appInfo?.platform ?? fallbackDesktopPlatform()} variant="settings" />
        </Tabs.Content>

        <Tabs.Content value="updates" class="settings-modal-tab-panel" data-tab="updates">
          <SettingsSection title={t("settings.updates.title")}>
            <ItemGroup class="settings-modal-card">
              <Item class="settings-modal-row settings-modal-update-track-row">
                <ItemContent>
                  <ItemTitle>{t("settings.updates.track")}</ItemTitle>
                  <ItemDescription>
                    {t("settings.updates.trackDescription", { track: updateTrackLabel("Stable") })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Select<UpdateTrack>
                    class="settings-modal-update-track-select"
                    options={updateTrackOptions}
                    value="Stable"
                    onChange={() => undefined}
                    placement="bottom-end"
                    itemComponent={(selectProps) => (
                      <SelectItem item={selectProps.item}>{updateTrackLabel(selectProps.item.rawValue)}</SelectItem>
                    )}
                  >
                    <SelectTrigger size="sm" aria-label={t("settings.updates.track")}>
                      <SelectValue<UpdateTrack>>{(state) => updateTrackLabel(state.selectedOption())}</SelectValue>
                    </SelectTrigger>
                    <SelectContent mount={modalElement} />
                  </Select>
                </ItemActions>
              </Item>
              <Item class="settings-modal-row settings-modal-update-row">
                <ItemContent>
                  <ItemTitle>{t("settings.updates.version", { version: installedVersion() })}</ItemTitle>
                  <ItemDescription>
                    {t("settings.updates.followTrack", { track: updateTrackLabel("Stable") })}
                  </ItemDescription>
                  <ItemDescription class={updateMessageClass()}>{updateMessage()}</ItemDescription>
                </ItemContent>
                <ItemActions class="settings-modal-update-actions">
                  <Button
                    variant="outline"
                    type="button"
                    size="sm"
                    loading={updatePresentation().busy}
                    loadingLabel={updatePresentation().actionLabel}
                    disabled={!updatePresentation().supported}
                    onClick={() => void runUpdateAction()}
                  >
                    {updatePresentation().supported
                      ? updatePresentation().actionLabel
                      : t("settings.updates.unavailableButton")}
                  </Button>
                </ItemActions>
              </Item>
              <SwitchField
                checked={props.value.autoDownloadUpdates}
                onChange={(checked) => updateSetting("autoDownloadUpdates", checked)}
                label={t("settings.updates.automatic")}
                description={t("settings.updates.automaticDescription")}
              />
            </ItemGroup>
          </SettingsSection>
        </Tabs.Content>
      </SettingsDialogShell>
    </Tabs.Root>
  );
}
