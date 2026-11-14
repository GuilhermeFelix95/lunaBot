import type { RoutineRun } from "@lunabot/contracts/ipc";
import { For, Show } from "solid-js";
import { locale, t } from "../../i18n";
import { Button, Check, CirclePause, Clock3, TriangleAlert, X } from "../ui";

interface RoutineRunHistoryProps {
  runs: RoutineRun[];
  onOpenRun?: (messageId: string) => void;
}

export function RoutineRunHistory(props: RoutineRunHistoryProps) {
  const visibleRuns = () => props.runs.slice(0, 10);
  return (
    <section class="agent-routine-history" aria-labelledby="routine-history-heading">
      <h3 id="routine-history-heading">{t("conversation.routineHistory.title")}</h3>
      <Show
        when={visibleRuns().length > 0}
        fallback={<p class="agent-routines-empty">{t("conversation.routineHistory.empty")}</p>}
      >
        <div class="agent-routine-run-list">
          <For each={visibleRuns()}>
            {(run) => {
              const label =
                run.kind === "manual"
                  ? t("conversation.routineHistory.manual", { time: formatRoutineRunTime(run.scheduledFor) })
                  : formatRoutineRunTime(run.scheduledFor);
              const content = (
                <>
                  <span>{label}</span>
                  <RoutineRunStatus status={run.status} />
                </>
              );
              return (
                <Show
                  when={run.deliveryId && props.onOpenRun ? run.deliveryId : null}
                  fallback={<div class="agent-routine-run-row">{content}</div>}
                >
                  {(messageId) => (
                    <Button
                      variant="ghost"
                      type="button"
                      class="agent-routine-run-row agent-routine-run-link"
                      aria-label={t("conversation.routineHistory.openInChat", { label })}
                      onClick={() => props.onOpenRun?.(messageId())}
                    >
                      {content}
                    </Button>
                  )}
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}

function RoutineRunStatus(props: { status: RoutineRun["status"] }) {
  const label = () => routineRunStatusLabel(props.status);
  return (
    <span
      class={`agent-routine-run-icon agent-routine-run-icon-${props.status}`}
      role="img"
      aria-label={label()}
      title={label()}
    >
      <Show when={props.status === "succeeded"}>
        <Check aria-hidden="true" />
      </Show>
      <Show when={props.status === "failed"}>
        <X aria-hidden="true" />
      </Show>
      <Show when={props.status === "needs-attention"}>
        <TriangleAlert aria-hidden="true" />
      </Show>
      <Show when={props.status === "queued" || props.status === "running"}>
        <Clock3 aria-hidden="true" />
      </Show>
      <Show when={props.status === "interrupted" || props.status === "cancelled"}>
        <CirclePause aria-hidden="true" />
      </Show>
    </span>
  );
}

function formatRoutineRunTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(date);
  if (sameCalendarDay(date, today)) return t("conversation.routineHistory.today", { time });
  if (sameCalendarDay(date, yesterday)) return t("conversation.routineHistory.yesterday", { time });
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function sameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function routineRunStatusLabel(status: RoutineRun["status"]): string {
  if (status === "needs-attention") return t("conversation.status.needsAttention");
  if (status === "queued") return t("conversation.status.queued");
  if (status === "running") return t("conversation.status.running");
  if (status === "succeeded") return t("conversation.status.succeeded");
  if (status === "failed") return t("conversation.status.failed");
  if (status === "interrupted") return t("conversation.status.interrupted");
  return t("conversation.status.cancelled");
}
