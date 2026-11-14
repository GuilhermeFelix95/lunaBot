import type { AccountUsage, AgentStatus, AppInfo, UpdateStatus } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { locale, t } from "../i18n";
import { platformLayout } from "../platform-layout";
import { presentUpdateStatus } from "../update-status";
import { AccountUpdateIsland } from "./AccountUpdateIsland";
import {
  Badge,
  Button,
  buttonVariants,
  CalendarClock,
  ChevronUp,
  CircleArrowDown,
  Gauge,
  Popover,
  RadialProgress,
  RefreshCw,
  Settings,
  ShieldCheck,
  Tooltip,
} from "./ui";

interface AccountDockProps {
  appInfo: AppInfo | null;
  agentStatus: AgentStatus;
  accountUsage: AccountUsage | null;
  updateStatus: UpdateStatus;
  compact: boolean;
  withLeadingColumn: boolean;
  onRefreshUsage: () => Promise<AccountUsage>;
  onUpdateAction: () => Promise<void>;
  onOpenPermissions: () => void;
  onOpenSettings: (trigger: HTMLElement) => void;
}

export function AccountDock(props: AccountDockProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [usageOpen, setUsageOpen] = createSignal(false);
  const [usageTooltipOpen, setUsageTooltipOpen] = createSignal(false);
  const [usageLoading, setUsageLoading] = createSignal(false);
  const [usageRefreshAcknowledging, setUsageRefreshAcknowledging] = createSignal(false);
  const [usageError, setUsageError] = createSignal<string | null>(null);
  const [menuError, setMenuError] = createSignal<string | null>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  let initialUsageRequested = false;
  let usageRefreshTimer: number | undefined;
  let legacyTrigger: HTMLButtonElement | undefined;
  let menuTrigger: HTMLButtonElement | undefined;
  let usageTrigger: HTMLButtonElement | undefined;
  let settingsTrigger: HTMLButtonElement | undefined;

  const hybridLayout = createMemo(
    () => platformLayout(props.appInfo?.platform).macOSChrome && props.withLeadingColumn && !props.compact,
  );
  const weeklyUsage = createMemo(() => {
    const limit =
      props.accountUsage?.limits.find((candidate) => candidate.id === "codex") ?? props.accountUsage?.limits[0];
    if (!limit) return null;
    return (
      [limit.primary, limit.secondary].find((window) => window?.windowDurationMins === 10_080) ??
      limit.secondary ??
      limit.primary
    );
  });
  const weeklyUsageRemaining = createMemo(() => {
    const usage = weeklyUsage();
    return usage ? Math.max(0, Math.round(100 - usage.usedPercent)) : null;
  });
  const usageValue = createMemo(() => weeklyUsageRemaining() ?? 0);
  const usageTone = createMemo(() => {
    const remaining = weeklyUsageRemaining();
    if (remaining === null || remaining >= 30) return "neutral";
    return remaining < 10 ? "critical" : "warning";
  });
  const usageRadialTone = createMemo(() => {
    const tone = usageTone();
    if (tone === "critical") return "danger";
    return tone === "warning" ? "warning" : "accent";
  });
  const usageButtonLabel = createMemo(() => {
    if (usageLoading() && weeklyUsageRemaining() === null) return t("sidebar.account.weeklyUsageLoading");
    if (weeklyUsageRemaining() === null) return t("sidebar.account.weeklyUsageUnavailable");
    return t("sidebar.account.weeklyUsageLeft", { percent: weeklyUsageRemaining() ?? 0 });
  });
  const usageRefreshActive = createMemo(() => usageLoading() || usageRefreshAcknowledging());
  const weeklyUsageReset = createMemo(() => {
    const resetsAt = weeklyUsage()?.resetsAt;
    if (resetsAt === null || resetsAt === undefined) return null;
    const date = new Date(resetsAt * 1_000);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale(), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  });
  const updatePresentation = createMemo(() => presentUpdateStatus(props.updateStatus));
  const accountMenuError = createMemo(
    () => menuError() ?? updateError() ?? (props.updateStatus.phase === "error" ? props.updateStatus.message : null),
  );

  onCleanup(() => {
    if (usageRefreshTimer !== undefined) window.clearTimeout(usageRefreshTimer);
  });

  createEffect(
    () => [hybridLayout(), props.agentStatus.phase, props.accountUsage] as const,
    ([hybrid, agentPhase, accountUsage]) => {
      if (!hybrid || agentPhase !== "ready" || accountUsage || initialUsageRequested) return;
      initialUsageRequested = true;
      void refreshUsage();
    },
  );

  createEffect(
    () => props.updateStatus.phase,
    () => {
      setUpdateError(null);
    },
  );

  function restoreFocusWhenDockIsIdle(target: HTMLButtonElement | undefined) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (target?.isConnected && !menuOpen() && !usageOpen() && document.activeElement === document.body) {
          target.focus();
        }
      });
    });
  }

  async function refreshUsage() {
    if (usageLoading() || props.agentStatus.phase !== "ready") return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      await props.onRefreshUsage();
    } catch (cause) {
      setUsageError(cause instanceof Error ? cause.message : t("sidebar.account.usageError"));
    } finally {
      setUsageLoading(false);
    }
  }

  function refreshUsageWithFeedback() {
    if (usageRefreshActive()) return;
    setUsageRefreshAcknowledging(true);
    if (usageRefreshTimer !== undefined) window.clearTimeout(usageRefreshTimer);
    usageRefreshTimer = window.setTimeout(() => {
      usageRefreshTimer = undefined;
      setUsageRefreshAcknowledging(false);
    }, 600);
    void refreshUsage();
  }

  async function runUpdateAction(): Promise<void> {
    setMenuError(null);
    setUpdateError(null);
    try {
      await props.onUpdateAction();
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : t("sidebar.account.updateFailed"));
    }
  }

  function accountMenu(includeDockActions = false) {
    return (
      <>
        <Show when={includeDockActions}>
          <section class="account-menu-group" aria-label={t("sidebar.account.group")}>
            <Button
              variant="ghost"
              type="button"
              class="account-menu-row"
              aria-label={usageButtonLabel()}
              onClick={refreshUsageWithFeedback}
              disabled={usageRefreshActive() || props.agentStatus.phase !== "ready"}
            >
              <Gauge class="account-menu-icon" aria-hidden="true" />
              <span>{t("sidebar.account.weeklyUsage")}</span>
              <small>{weeklyUsageRemaining() === null ? "—" : `${weeklyUsageRemaining()}%`}</small>
            </Button>
            <Button
              variant="ghost"
              type="button"
              class="account-menu-row"
              onClick={() => {
                setMenuOpen(false);
                if (legacyTrigger) props.onOpenSettings(legacyTrigger);
              }}
            >
              <Settings class="account-menu-icon" aria-hidden="true" />
              <span>{t("sidebar.account.settings")}</span>
            </Button>
          </section>
          <div class="account-menu-separator" />
        </Show>
        <section class="account-menu-group" aria-label="Luna Bot">
          <Show
            when={props.updateStatus.phase !== "unsupported" && (!hybridLayout() || !updatePresentation().available)}
          >
            <Button
              variant="ghost"
              type="button"
              class="account-menu-row"
              onClick={() => void runUpdateAction()}
              disabled={updatePresentation().busy}
            >
              <CircleArrowDown
                class={updatePresentation().busy ? "account-menu-icon account-menu-icon-spinning" : "account-menu-icon"}
                aria-hidden="true"
              />
              <span>{updatePresentation().actionLabel}</span>
              <small>{updatePresentation().detail}</small>
            </Button>
          </Show>
          <Button
            variant="ghost"
            type="button"
            class="account-menu-row"
            onClick={() => {
              setMenuOpen(false);
              props.onOpenPermissions();
            }}
          >
            <ShieldCheck class="account-menu-icon" aria-hidden="true" />
            <span>{t("sidebar.account.providersPermissions")}</span>
          </Button>
        </section>

        <Show when={accountMenuError()}>{(message) => <p class="account-popover-error">{message()}</p>}</Show>
        <Show when={includeDockActions ? usageError() : null}>
          {(message) => <p class="account-popover-error">{message()}</p>}
        </Show>
      </>
    );
  }

  function legacyDock() {
    return (
      <Popover.Root
        open={menuOpen()}
        onOpenChange={(nextOpen) => {
          setMenuOpen(nextOpen);
          if (nextOpen) {
            setMenuError(null);
            if (!props.accountUsage && !usageLoading()) void refreshUsage();
          } else {
            restoreFocusWhenDockIsIdle(legacyTrigger);
          }
        }}
        placement="top-start"
        gutter={8}
      >
        <Popover.Trigger
          ref={(element) => (legacyTrigger = element)}
          as="button"
          type="button"
          class={buttonVariants({ variant: "ghost", class: "account-dock-trigger" })}
          aria-label={t("sidebar.account.openMenu")}
          aria-expanded={menuOpen() ? "true" : "false"}
        >
          <span class="account-dock-copy">
            <strong>Luna Bot</strong>
            <Show when={props.appInfo}>
              {(info) => (
                <span class="sr-only" data-testid="app-version">
                  {t("sidebar.account.version", { version: info().version, platform: info().platform })}
                </span>
              )}
            </Show>
          </span>
          <Show when={updatePresentation().available}>
            <Badge class="sidebar-update-pill" tone="accent" shape="pill">
              {t("sidebar.account.updateBadge")}
            </Badge>
            <span class="sr-only">{t("sidebar.account.updateAvailable")}</span>
          </Show>
          <ChevronUp class="account-dock-chevron" aria-hidden="true" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            class="ui-popover-menu-surface account-popover"
            aria-hidden={menuOpen() ? undefined : "true"}
          >
            <Popover.Title class="sr-only">{t("sidebar.account.actionsTitle")}</Popover.Title>
            {accountMenu(true)}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  function hybridDock() {
    return (
      <div class="account-dock-hybrid-shelf">
        <Popover.Root
          open={menuOpen()}
          onOpenChange={(nextOpen) => {
            setMenuOpen(nextOpen);
            if (nextOpen) {
              setUsageOpen(false);
              setMenuError(null);
            } else {
              restoreFocusWhenDockIsIdle(menuTrigger);
            }
          }}
          placement="top-start"
          gutter={10}
        >
          <Popover.Trigger
            ref={(element) => (menuTrigger = element)}
            as="button"
            type="button"
            class={buttonVariants({ variant: "ghost", class: "account-dock-hybrid-identity" })}
            aria-label={t("sidebar.account.openActions")}
            aria-expanded={menuOpen() ? "true" : "false"}
          >
            <span class="account-dock-copy">
              <strong>Luna Bot</strong>
              <Show when={props.appInfo}>
                {(info) => (
                  <span class="sr-only" data-testid="app-version">
                    {t("sidebar.account.version", { version: info().version, platform: info().platform })}
                  </span>
                )}
              </Show>
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              class="ui-popover-menu-surface account-popover"
              aria-hidden={menuOpen() ? undefined : "true"}
            >
              <Popover.Title class="sr-only">{t("sidebar.account.actionsTitle")}</Popover.Title>
              {accountMenu()}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Tooltip.Root
          open={usageTooltipOpen()}
          onOpenChange={(nextOpen) => setUsageTooltipOpen(usageOpen() ? false : nextOpen)}
          openDelay={250}
          closeDelay={75}
          placement="top"
          gutter={8}
        >
          <Tooltip.Trigger as="div" class="account-dock-tooltip-trigger">
            <Popover.Root
              open={usageOpen()}
              onOpenChange={(nextOpen) => {
                setUsageOpen(nextOpen);
                if (nextOpen) {
                  setUsageTooltipOpen(false);
                  setMenuOpen(false);
                  if (!props.accountUsage && !usageLoading()) void refreshUsage();
                } else {
                  restoreFocusWhenDockIsIdle(usageTrigger);
                }
              }}
              placement="top-end"
              gutter={10}
            >
              <Popover.Trigger
                ref={(element) => (usageTrigger = element)}
                as="button"
                type="button"
                class={buttonVariants({ variant: "ghost", class: "account-dock-usage-trigger" })}
                aria-label={usageButtonLabel()}
                aria-expanded={usageOpen() ? "true" : "false"}
                data-usage-tone={usageTone()}
              >
                <span class="account-dock-usage-chip">
                  <Gauge aria-hidden="true" />
                  <strong>{weeklyUsageRemaining() === null ? "—" : `${weeklyUsageRemaining()}%`}</strong>
                </span>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  class="ui-popover-menu-surface account-usage-popover"
                  aria-hidden={usageOpen() ? undefined : "true"}
                >
                  <header class="account-usage-popover-header">
                    <div class="account-usage-popover-heading">
                      <Gauge aria-hidden="true" />
                      <Popover.Title class="account-usage-popover-title">
                        {t("sidebar.account.weeklyUsage")}
                      </Popover.Title>
                    </div>
                    <Button
                      variant="ghost"
                      type="button"
                      size="icon-sm"
                      class="account-usage-refresh"
                      aria-label={
                        usageRefreshActive()
                          ? t("sidebar.account.refreshing")
                          : usageError()
                            ? t("sidebar.account.tryAgain")
                            : t("sidebar.account.refresh")
                      }
                      title={t("sidebar.account.refreshUsage")}
                      onClick={refreshUsageWithFeedback}
                      disabled={usageRefreshActive() || props.agentStatus.phase !== "ready"}
                    >
                      <RefreshCw
                        class={usageRefreshActive() ? "account-menu-icon-spinning" : undefined}
                        aria-hidden="true"
                      />
                    </Button>
                  </header>
                  <div class="account-usage-popover-meter">
                    <RadialProgress
                      value={usageValue()}
                      tone={usageRadialTone()}
                      aria-label={t("sidebar.account.usageRemaining")}
                      aria-valuetext={
                        usageLoading() && weeklyUsageRemaining() === null
                          ? t("sidebar.account.loading")
                          : weeklyUsageRemaining() === null
                            ? t("sidebar.account.unavailable")
                            : t("sidebar.account.valueLeft", { percent: weeklyUsageRemaining() ?? 0 })
                      }
                    >
                      <strong>
                        {usageLoading() && weeklyUsageRemaining() === null
                          ? "…"
                          : weeklyUsageRemaining() === null
                            ? "—"
                            : `${weeklyUsageRemaining()}%`}
                      </strong>
                    </RadialProgress>
                  </div>
                  <div class="account-usage-popover-reset">
                    <CalendarClock aria-hidden="true" />
                    <span>{t("sidebar.account.resets")}</span>
                    <strong>
                      {weeklyUsageReset()
                        ? weeklyUsageReset()
                        : usageLoading()
                          ? t("sidebar.account.checking")
                          : t("sidebar.account.unavailable")}
                    </strong>
                  </div>
                  <Show when={usageError()}>{(message) => <p class="account-usage-popover-error">{message()}</p>}</Show>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content class="ui-tooltip">{t("sidebar.account.weeklyUsage")}</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        <Tooltip.Root openDelay={250} closeDelay={75} placement="top" gutter={8}>
          <Tooltip.Trigger as="div" class="account-dock-tooltip-trigger">
            <Button
              ref={(element) => (settingsTrigger = element)}
              variant="ghost"
              type="button"
              class="account-dock-icon-button"
              aria-label={t("sidebar.account.settings")}
              onClick={() => {
                setMenuOpen(false);
                setUsageOpen(false);
                if (settingsTrigger) props.onOpenSettings(settingsTrigger);
              }}
            >
              <Settings aria-hidden="true" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content class="ui-tooltip">{t("sidebar.account.settings")}</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
  }

  return (
    <div
      class={[
        "account-dock",
        {
          "account-dock-with-leading-column": props.withLeadingColumn,
          "account-dock-compact": props.compact,
          "account-dock-hybrid": hybridLayout(),
        },
      ]}
    >
      <Show when={hybridLayout()} fallback={legacyDock()}>
        <AccountUpdateIsland
          updateStatus={props.updateStatus}
          errorMessage={updateError()}
          onUpdateAction={runUpdateAction}
        />
        {hybridDock()}
      </Show>
    </div>
  );
}
