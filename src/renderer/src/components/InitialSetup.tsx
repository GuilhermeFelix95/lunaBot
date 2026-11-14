import type {
  AgentProviderId,
  AgentProviderState,
  AgentStatus,
  AppSetupState,
  DesktopPlatform,
} from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { ComputerUseMacSetup } from "./ComputerUseMacSetup";
import { ProviderPicker, type ProviderPickerOption } from "./ProviderPicker";
import { Button, Dialog } from "./ui";

interface InitialSetupProps {
  reviewing?: boolean;
  state: AppSetupState;
  agentStatus: AgentStatus;
  platform: DesktopPlatform;
  onSave: (provider: AgentProviderId) => Promise<void>;
  onRefreshProviders?: () => void | Promise<void>;
  onClose?: () => void;
}

const PROVIDERS: Array<{ id: AgentProviderId; name: string }> = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
  { id: "grok", name: "Grok" },
];

export function InitialSetup(props: InitialSetupProps) {
  const [selectedProvider, setSelectedProvider] = createSignal<AgentProviderId | null>(
    untrack(() => props.state.preferredProvider),
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const providerOptions = createMemo<ProviderPickerOption[]>(() =>
    PROVIDERS.map((provider) => {
      const status = props.agentStatus.providers?.find((candidate) => candidate.id === provider.id);
      return {
        ...provider,
        state: status?.state ?? fallbackProviderState(props.agentStatus),
        message: status?.message,
        email: status?.email,
        checkError: status?.checkError,
      };
    }),
  );
  const availableProviders = createMemo(() => providerOptions().filter((provider) => provider.state === "available"));

  createEffect(
    () => ({
      options: providerOptions(),
      available: availableProviders(),
      selected: selectedProvider(),
      preferredProvider: props.state.preferredProvider,
    }),
    ({ options, available, selected, preferredProvider }) => {
      if (selected && options.some((provider) => provider.id === selected)) return;
      const preferred = options.find((provider) => provider.id === preferredProvider);
      setSelectedProvider(preferred?.id ?? available[0]?.id ?? options[0]?.id ?? null);
    },
  );

  async function saveLocal(): Promise<void> {
    const provider = selectedProvider();
    if (!provider || saving()) return;
    setSaving(true);
    setError("");
    try {
      await props.onSave(provider);
    } catch (cause) {
      setError(errorMessage(cause, t("onboarding.setup.saveError")));
      setSaving(false);
    }
  }

  const title = () => {
    if (!props.reviewing) return t("onboarding.setup.title");
    return props.platform === "darwin" ? t("onboarding.setup.reviewTitleMac") : t("onboarding.setup.reviewTitle");
  };

  const description = () => {
    if (!props.reviewing) return t("onboarding.setup.description");
    return props.platform === "darwin"
      ? t("onboarding.setup.reviewDescriptionMac")
      : t("onboarding.setup.reviewDescription");
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && props.onClose?.()}>
      <main class="initial-setup-screen">
        <Dialog.Content as="section" class="initial-setup" data-dialog-surface="unstyled">
          <header class="initial-setup-header">
            <p class="initial-setup-eyebrow">{t("onboarding.setup.eyebrow")}</p>
            <Dialog.Title as="h1" id="initial-setup-title">
              {title()}
            </Dialog.Title>
            <Dialog.Description as="p" id="initial-setup-description" class="initial-setup-intro">
              {description()}
            </Dialog.Description>
          </header>

          <div class="setup-local-content">
            <ProviderPicker
              value={selectedProvider()}
              options={providerOptions()}
              ariaLabel={t("onboarding.provider.defaultLabel")}
              label={t("onboarding.provider.defaultLabel")}
              hint={t("onboarding.setup.providerHint")}
              disabled={saving()}
              allowUnavailableSelection
              focusFirst
              onChange={setSelectedProvider}
              onRefreshProviders={props.onRefreshProviders}
            />

            <ComputerUseMacSetup platform={props.platform} variant="compact" />
          </div>

          <Show when={error()}>
            <p class="initial-setup-error" role="alert">
              {error()}
            </p>
          </Show>

          <div class="initial-setup-actions">
            <Show when={props.reviewing}>
              <Button variant="ghost" type="button" class="initial-setup-secondary" onClick={props.onClose}>
                {t("onboarding.common.cancel")}
              </Button>
            </Show>
            <Button
              variant="default"
              type="button"
              class="initial-setup-save"
              disabled={saving() || !selectedProvider()}
              onClick={() => void saveLocal()}
            >
              {saving()
                ? t("onboarding.common.saving")
                : props.reviewing
                  ? t("onboarding.setup.saveChanges")
                  : selectedProvider()
                    ? t("onboarding.setup.continueWith", { provider: providerName(selectedProvider()) })
                    : t("onboarding.setup.chooseProvider")}
            </Button>
          </div>
        </Dialog.Content>
      </main>
    </Dialog.Root>
  );
}

function providerName(provider: AgentProviderId | null): "Claude" | "Codex" | "Grok" {
  if (provider === "claude") return "Claude";
  if (provider === "grok") return "Grok";
  return "Codex";
}

function fallbackProviderState(status: AgentStatus): AgentProviderState {
  return status.phase === "starting" || status.phase === "restarting" ? "checking" : "error";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
