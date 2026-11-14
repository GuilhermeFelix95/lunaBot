import { ProviderLogo } from "@lunabot/brand";
import type { AgentProviderId, AgentProviderState, ProviderRuntimeStatus } from "@lunabot/contracts/ipc";
import { createEffect, createSignal, createUniqueId, For, Show } from "solid-js";
import { type TranslationKey, t } from "../i18n";
import { Button, CircleCheck, Input, RefreshCw, Spinner } from "./ui";

export interface ProviderPickerOption {
  id: AgentProviderId;
  name: string;
  state: AgentProviderState;
  description?: string | null;
  message?: string | null;
  email?: string | null;
  connectionState?: "connecting";
  checkError?: string | null;
  runtimeStatus?: ProviderRuntimeStatus;
}

export interface ProviderPickerProps {
  value: AgentProviderId | null;
  options: ProviderPickerOption[];
  ariaLabel: string;
  label?: string;
  hint?: string;
  embedded?: boolean;
  disabled?: boolean;
  allowUnavailableSelection?: boolean;
  focusFirst?: boolean;
  refreshingProviders?: boolean;
  onConnectProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onDownloadProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onCancelProviderDownload?: (provider: AgentProviderId) => void | Promise<void>;
  onInstallProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onSignInProvider?: (provider: AgentProviderId) => void | Promise<void>;
  onRefreshProviders?: () => void | Promise<void>;
  onChange: (provider: AgentProviderId) => void;
}

/** A provider whose status has not arrived after this long offers a retry instead of "Checking" forever. */
const CHECK_TIMEOUT_MS = 10_000;

type ProviderTone = "success" | "warning" | "danger" | "progress" | "neutral";

interface ProviderAction {
  label: string;
  ariaLabel: string;
  variant: "default" | "outline";
  busy?: boolean;
  run: () => void | Promise<void>;
}

interface ProviderRow {
  subtitle: string;
  tone: ProviderTone;
  spinning: boolean;
  connected: boolean;
  action?: ProviderAction;
  reconnect?: ProviderAction;
}

export function ProviderPicker(props: ProviderPickerProps) {
  const inputs = new Map<AgentProviderId, HTMLInputElement>();
  const pickerId = createUniqueId();
  const [stalled, setStalled] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);
  let focused = false;

  createEffect(
    () => ({
      focusFirst: props.focusFirst,
      options: props.options,
      allowUnavailableSelection: props.allowUnavailableSelection,
    }),
    ({ focusFirst, options, allowUnavailableSelection }) => {
      if (!focusFirst || focused) return;
      const first =
        options.find((option) => option.state === "available") ?? (allowUnavailableSelection ? options[0] : undefined);
      const input = first ? inputs.get(first.id) : undefined;
      if (!input) return;
      focused = true;
      input.focus();
    },
  );

  createEffect(
    () => props.options.some(isCheckingOption),
    (checking) => {
      setStalled(false);
      if (!checking) return;
      const timer = window.setTimeout(() => setStalled(true), CHECK_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    },
  );

  async function retryCheck(): Promise<void> {
    if (retrying() || !props.onRefreshProviders) return;
    setRetrying(true);
    try {
      await props.onRefreshProviders();
    } catch {
      // The row keeps reporting the unverified status, which is the accurate state.
    } finally {
      setRetrying(false);
    }
  }

  function rowFor(option: ProviderPickerOption): ProviderRow {
    const { id, name, state } = option;
    const connecting = option.connectionState === "connecting";
    const runtime = option.runtimeStatus;

    const connectAction = (busy: boolean): ProviderAction | undefined => {
      if (!props.onConnectProvider) return undefined;
      const label = t(providerActionLabel(state, busy));
      return {
        label,
        ariaLabel: `${label} ${name}`,
        variant: "outline",
        busy,
        run: () => props.onConnectProvider?.(id),
      };
    };

    if (isCheckingOption(option)) {
      const unverified = stalled();
      return {
        subtitle: unverified ? t("providers.verifyFailed") : t("providers.checking"),
        tone: unverified ? "warning" : "progress",
        spinning: !unverified,
        connected: false,
        action:
          unverified && props.onRefreshProviders
            ? {
                label: t("providers.retry"),
                ariaLabel: t("providers.retryNamed", { name }),
                variant: "outline",
                busy: retrying(),
                run: retryCheck,
              }
            : undefined,
      };
    }

    if (connecting && state !== "available") {
      return {
        subtitle: t("providers.connecting"),
        tone: "progress",
        spinning: true,
        connected: false,
        action: connectAction(true),
      };
    }

    if (state === "available") {
      return {
        subtitle: option.email ?? option.description ?? t("providers.readyOnComputer"),
        tone: "success",
        spinning: false,
        connected: true,
        reconnect: connectAction(false),
      };
    }

    switch (runtime?.phase) {
      case "not-downloaded":
        return {
          subtitle: t("providers.notDownloaded"),
          tone: "neutral",
          spinning: false,
          connected: false,
          action: {
            label: t("providers.download"),
            ariaLabel: t("providers.downloadNamed", { name }),
            variant: "default",
            run: () => props.onDownloadProvider?.(id),
          },
        };
      case "downloading":
        return {
          subtitle: t("providers.downloading", { percent: percent(runtime.progress) }),
          tone: "progress",
          spinning: true,
          connected: false,
          action: {
            label: t("providers.cancel"),
            ariaLabel: t("providers.cancelNamed", { name }),
            variant: "outline",
            run: () => props.onCancelProviderDownload?.(id),
          },
        };
      case "finishing":
        return { subtitle: t("providers.settingUp"), tone: "warning", spinning: true, connected: false };
      case "ready":
        return {
          subtitle: t("providers.ready"),
          tone: "success",
          spinning: false,
          connected: false,
          action: connectAction(false),
        };
      case "download-error":
        return {
          subtitle: t("providers.downloadFailed"),
          tone: "danger",
          spinning: false,
          connected: false,
          action: {
            label: t("providers.retry"),
            ariaLabel: `Retry ${name}`,
            variant: "outline",
            run: () => props.onDownloadProvider?.(id),
          },
        };
    }

    return {
      ...stateDetails(state),
      spinning: false,
      connected: false,
      action: connectAction(false) ?? fallbackAction(option),
    };
  }

  function fallbackAction(option: ProviderPickerOption): ProviderAction | undefined {
    if (option.id !== "claude") return undefined;
    if (option.state === "not-installed" && props.onInstallProvider) {
      return {
        label: t("providers.install"),
        ariaLabel: t("providers.installNamed", { name: option.name }),
        variant: "outline",
        run: () => props.onInstallProvider?.(option.id),
      };
    }
    if (option.state === "sign-in-required" && props.onSignInProvider) {
      return {
        label: t("providers.signIn"),
        ariaLabel: t("providers.signInNamed", { name: option.name }),
        variant: "outline",
        run: () => props.onSignInProvider?.(option.id),
      };
    }
    return undefined;
  }

  return (
    <div
      class={[
        "provider-picker",
        {
          "provider-picker-standalone": !props.embedded,
          "provider-picker-embedded": Boolean(props.embedded),
        },
      ]}
    >
      <Show when={props.label || props.onRefreshProviders}>
        <div class="provider-picker-heading">
          <Show when={props.label}>{(label) => <div class="provider-picker-label">{label()}</div>}</Show>
          <Show when={props.onRefreshProviders}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class="provider-picker-refresh"
              aria-label={props.refreshingProviders ? t("providers.refreshing") : t("providers.refreshProviders")}
              loading={props.refreshingProviders}
              loadingLabel={t("providers.checking")}
              disabled={props.disabled}
              onClick={() => void props.onRefreshProviders?.()}
            >
              <RefreshCw size={13} aria-hidden="true" />
              {t("providers.refresh")}
            </Button>
          </Show>
        </div>
      </Show>
      <div class="provider-picker-list" role="radiogroup" aria-label={props.ariaLabel}>
        <For each={props.options} keyed={false}>
          {(option) => {
            const row = () => rowFor(option());
            const available = () => option().state === "available";
            const inputId = () => `${pickerId}-${option().id}`;
            return (
              <div
                class={[
                  "provider-picker-option",
                  {
                    "provider-picker-option-selected": props.value === option().id,
                    "provider-picker-option-unavailable": !available(),
                    "provider-picker-option-selectable-unavailable":
                      !available() && Boolean(props.allowUnavailableSelection),
                  },
                ]}
                title={option().message ?? undefined}
              >
                <label for={inputId()} class="provider-picker-option-selection">
                  <Input
                    id={inputId()}
                    ref={(element) => inputs.set(option().id, element)}
                    class="provider-picker-radio"
                    type="radio"
                    name={props.ariaLabel}
                    value={option().id}
                    checked={props.value === option().id}
                    disabled={props.disabled || (!props.allowUnavailableSelection && !available())}
                    onChange={() => props.onChange(option().id)}
                  />
                  <span class="provider-picker-logo-frame">
                    <ProviderLogo provider={option().id} class="provider-picker-logo" />
                  </span>
                  <span class="provider-picker-identity">
                    <span class="provider-picker-name">{option().name}</span>
                    <span class="provider-picker-detail">
                      <Show when={row().spinning}>
                        <Spinner size="sm" />
                      </Show>
                      <span class="provider-picker-detail-text">{row().subtitle}</span>
                    </span>
                    <Show when={option().checkError}>
                      {(checkError) => <span class="provider-picker-check-error">{checkError()}</span>}
                    </Show>
                  </span>
                </label>
                <div class="provider-picker-actions">
                  <span class="provider-picker-dot" data-tone={row().tone} aria-hidden="true" />
                  <Show when={row().connected}>
                    <span class="provider-picker-connected">
                      <CircleCheck aria-hidden="true" />
                      {t("providers.connected")}
                    </span>
                  </Show>
                  <Show when={row().reconnect}>
                    {(action) => (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        class="provider-picker-reconnect"
                        aria-label={action().ariaLabel}
                        title={t("providers.reconnect")}
                        disabled={props.disabled || props.refreshingProviders}
                        onClick={() => void action().run()}
                      >
                        <RefreshCw aria-hidden="true" />
                      </Button>
                    )}
                  </Show>
                  <Show when={row().action}>
                    {(action) => (
                      <Button
                        type="button"
                        variant={action().variant}
                        size="xs"
                        class="provider-picker-action"
                        aria-label={action().ariaLabel}
                        aria-busy={action().busy ? "true" : undefined}
                        disabled={props.disabled || props.refreshingProviders}
                        onClick={() => void action().run()}
                      >
                        <Show when={action().busy}>
                          <Spinner size="sm" />
                        </Show>
                        {action().label}
                      </Button>
                    )}
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={props.hint}>{(hint) => <p class="provider-picker-hint">{hint()}</p>}</Show>
    </div>
  );
}

function isCheckingOption(option: ProviderPickerOption): boolean {
  return (
    option.connectionState !== "connecting" &&
    !option.runtimeStatus &&
    (option.state === "checking" || option.state === "not-started")
  );
}

function stateDetails(state: AgentProviderState): { subtitle: string; tone: ProviderTone } {
  if (state === "sign-in-required") return { subtitle: t("providers.notConnected"), tone: "warning" };
  if (state === "not-installed") return { subtitle: t("providers.notInstalled"), tone: "neutral" };
  if (state === "outdated") return { subtitle: t("providers.updateRequired"), tone: "warning" };
  if (state === "error") return { subtitle: t("providers.unavailable"), tone: "danger" };
  return { subtitle: t("providers.checking"), tone: "progress" };
}

function providerActionLabel(state: AgentProviderState, connecting: boolean): TranslationKey {
  if (connecting) return "providers.restart";
  return state === "available" ? "providers.reconnect" : "providers.connect";
}

function percent(progress: number | null): number {
  return Math.round(Math.max(0, Math.min(100, progress ?? 0)));
}
