import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import type { AgentApproval, BrowserPreview, BrowserTab } from "@lunabot/contracts/ipc";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, RadioGroup } from "./ui";

export function ChoiceCard(props: {
  title: string;
  hint?: string;
  choices: string[];
  customChoice?: string;
  pending?: boolean;
  onSubmit: (answer: string) => Promise<boolean>;
}) {
  const [answer, setAnswer] = createSignal("");
  const [customSelected, setCustomSelected] = createSignal(false);
  let customInput: HTMLInputElement | undefined;
  const selectedChoice = () => (customSelected() ? (props.customChoice ?? "") : answer());
  const submit = async () => {
    const value = answer().trim();
    if (value && !props.pending) await props.onSubmit(value);
  };
  return (
    <div class="choice-card">
      <div class="choice-card-heading">
        <div>
          <strong>{props.title}</strong>
          <span>{props.hint ?? t("conversation.prompts.choiceHint")}</span>
        </div>
      </div>
      <RadioGroup.Root
        class="choice-options"
        aria-label={props.title}
        value={selectedChoice()}
        disabled={props.pending}
        onChange={(choice) => {
          if (choice === props.customChoice) {
            setAnswer("");
            setCustomSelected(true);
            queueMicrotask(() => customInput?.focus());
            return;
          }
          setCustomSelected(false);
          setAnswer(choice);
          void props.onSubmit(choice);
        }}
      >
        <For each={props.choices}>
          {(choice, index) => (
            <RadioGroup.Item class="choice-option-item" value={choice} disabled={props.pending}>
              <RadioGroup.ItemInput aria-label={choice} />
              <RadioGroup.ItemControl
                class={[
                  "choice-option",
                  {
                    "choice-option-selected": choice === props.customChoice ? customSelected() : answer() === choice,
                  },
                ]}
              >
                <span class="choice-key">{String.fromCharCode(65 + index())}</span>
                <span>{choice}</span>
              </RadioGroup.ItemControl>
            </RadioGroup.Item>
          )}
        </For>
      </RadioGroup.Root>
      <Input
        ref={(element) => (customInput = element)}
        class="choice-input"
        value={answer()}
        placeholder={t("conversation.prompts.customPlaceholder")}
        aria-label={t("conversation.prompts.customAnswer")}
        maxlength={INPUT_LIMITS.promptAnswerText}
        disabled={props.pending}
        onValueChange={(value) => {
          setCustomSelected(true);
          setAnswer(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
    </div>
  );
}

export function ApprovalCard(props: {
  approval: AgentApproval;
  onApprove: () => Promise<boolean>;
  onReject: () => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = createSignal(false);
  const submit = async (decision: "accept" | "decline") => {
    if (submitting()) return;
    setSubmitting(true);
    const completed = await (decision === "accept" ? props.onApprove() : props.onReject());
    if (!completed) setSubmitting(false);
  };

  return (
    <section class="approval-card approval-card-approval" aria-label={t("conversation.approval.label")}>
      <header class="approval-card-header">
        <span class="approval-card-icon" data-kind="approval">
          <ApprovalIcon />
        </span>
        <div>
          <strong>{approvalTitle(props.approval)}</strong>
        </div>
      </header>
      <div class="approval-card-content">
        <Show when={props.approval.command}>
          {(command) => (
            <div class="approval-command-block">
              <Show when={props.approval.cwd}>
                <div class="approval-cwd">{props.approval.cwd}</div>
              </Show>
              <code>{command()}</code>
            </div>
          )}
        </Show>
        <Show when={props.approval.kind === "file-change"}>
          <div class="approval-detail-row">
            <span class="approval-detail-label">{t("conversation.approval.files")}</span>
            <strong>{props.approval.grantRoot ?? t("conversation.approval.workspace")}</strong>
          </div>
        </Show>
        <Show when={props.approval.kind === "permissions"}>
          <PermissionDetails permissions={props.approval.permissions} />
        </Show>
        <Show when={props.approval.reason}>{(reason) => <p class="approval-reason">{reason()}</p>}</Show>
      </div>
      <footer class="approval-card-footer approval-card-footer-end">
        <div class="approval-card-actions">
          <Button
            variant="ghost"
            type="button"
            class="approval-button approval-button-ghost"
            disabled={submitting()}
            onClick={() => void submit("decline")}
          >
            {submitting() ? t("conversation.approval.waiting") : t("conversation.approval.reject")}
          </Button>
          <Button
            variant="default"
            type="button"
            class="approval-button approval-button-primary"
            disabled={submitting()}
            onClick={() => void submit("accept")}
          >
            {submitting() ? t("conversation.approval.sending") : t("conversation.approval.approve")}
            <ReturnIcon />
          </Button>
        </div>
      </footer>
    </section>
  );
}

export function BrowserTakeoverCard(props: {
  botName: string;
  tab: BrowserTab | undefined;
  preview: BrowserPreview | null;
  previewStatus: "idle" | "loading" | "ready" | "failed";
  decision?: "complete" | "cancel" | null;
  onComplete: () => Promise<boolean>;
  onCancel: () => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = createSignal<"complete" | "cancel" | null>(null);
  const pageDetails = createMemo(() => browserPageDetails(props.tab));
  const completed = () => props.decision === "complete";
  const cancelled = () => props.decision === "cancel";
  const accessibleLabel = () =>
    completed()
      ? t("conversation.takeover.labelComplete")
      : cancelled()
        ? t("conversation.takeover.labelCancelled")
        : t("conversation.takeover.label");
  const submit = async (decision: "complete" | "cancel") => {
    if (submitting() || props.decision) return;
    setSubmitting(decision);
    const completed = await (decision === "complete" ? props.onComplete() : props.onCancel());
    if (!completed) setSubmitting(null);
  };

  return (
    <section
      class="browser-takeover-card"
      data-decision={props.decision ?? undefined}
      aria-label={accessibleLabel()}
      aria-busy={submitting() ? "true" : undefined}
    >
      <span class="browser-takeover-moon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="#f3e7c3" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
        </svg>
      </span>
      <div class="browser-takeover-copy" role="status">
        <h2>
          {completed()
            ? t("conversation.takeover.stepCompleted", { host: pageDetails().host })
            : cancelled()
              ? t("conversation.takeover.stepCancelled", { host: pageDetails().host })
              : t("conversation.takeover.completeStep", { host: pageDetails().host })}
        </h2>
        <span title={pageDetails().title}>
          {completed()
            ? `${t("conversation.takeover.done")} · ${t("conversation.takeover.botContinuing", { name: props.botName })}`
            : cancelled()
              ? t("conversation.takeover.cancelled")
              : t("conversation.takeover.actionRequired")}
        </span>
      </div>
      <Show when={!props.decision}>
        <footer class="browser-takeover-actions">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="approval-button"
            loading={submitting() === "cancel"}
            loadingLabel={t("conversation.takeover.cancelling")}
            disabled={Boolean(submitting())}
            onClick={() => void submit("cancel")}
          >
            {t("conversation.takeover.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            type="button"
            class="approval-button"
            loading={submitting() === "complete"}
            loadingLabel={t("conversation.takeover.returning")}
            disabled={Boolean(submitting())}
            onClick={() => void submit("complete")}
          >
            {t("conversation.takeover.imDone")}
          </Button>
        </footer>
      </Show>
    </section>
  );
}

function browserPageDetails(tab: BrowserTab | undefined): { title: string; host: string } {
  const title = tab?.title.trim() || t("conversation.takeover.browserPage");
  if (!tab?.url) return { title, host: t("conversation.takeover.theBrowser") };
  try {
    return { title, host: new URL(tab.url).hostname || t("conversation.takeover.theBrowser") };
  } catch {
    return { title, host: tab.url };
  }
}

function approvalTitle(approval: AgentApproval | undefined) {
  if (approval?.kind === "command") return t("conversation.approval.runCommand");
  if (approval?.kind === "file-change") return t("conversation.approval.approveFileChanges");
  return t("conversation.approval.grantPermissions");
}

function PermissionDetails(props: { permissions: AgentApproval["permissions"] }) {
  const details = createMemo(() => {
    const permissions = props.permissions;
    if (!permissions) return [];
    return [
      ...(permissions.network ? [t("conversation.approval.networkAccess")] : []),
      ...permissions.fileSystem.read.map((path) => t("conversation.approval.readPath", { path })),
      ...permissions.fileSystem.write.map((path) => t("conversation.approval.writePath", { path })),
    ];
  });
  return (
    <section class="approval-permissions" aria-label={t("conversation.approval.requestedPermissions")}>
      <For each={details()}>{(detail) => <span>{detail}</span>}</For>
    </section>
  );
}

function ApprovalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 2.5 16.2 5v4.3c0 3.8-2.4 6.5-6.2 8.2-3.8-1.7-6.2-4.4-6.2-8.2V5L10 2.5Z" />
      <path d="m7.3 10 1.8 1.8 3.7-4" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M4 4.5h5.5a2.5 2.5 0 0 1 0 5H6.8M6.8 7.5l-2.8 2 2.8 2" />
    </svg>
  );
}
