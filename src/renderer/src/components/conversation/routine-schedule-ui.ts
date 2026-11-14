import type { RoutineSchedule } from "@lunabot/contracts/ipc";
import { locale, t } from "../../i18n";

export interface RoutineSelectOption {
  value: string;
  label: string;
}

// Labels are read through functions, not module constants, so they follow the locale at render time.
export function routineScheduleKindOptions(): RoutineSelectOption[] {
  return [
    { value: "hourly", label: t("settings.schedule.kind.hourly") },
    { value: "daily", label: t("settings.schedule.kind.daily") },
    { value: "weekdays", label: t("settings.schedule.kind.weekdays") },
    { value: "weekly", label: t("settings.schedule.kind.weekly") },
    { value: "monthly", label: t("settings.schedule.kind.monthly") },
    { value: "interval", label: t("settings.schedule.kind.interval") },
    { value: "advanced", label: t("settings.schedule.kind.advanced") },
    { value: "custom", label: t("settings.schedule.kind.custom") },
  ];
}

const ROUTINE_WEEKDAY_KEYS = [
  "settings.schedule.weekday.sunday",
  "settings.schedule.weekday.monday",
  "settings.schedule.weekday.tuesday",
  "settings.schedule.weekday.wednesday",
  "settings.schedule.weekday.thursday",
  "settings.schedule.weekday.friday",
  "settings.schedule.weekday.saturday",
] as const;

export function routineWeekdayOptions(): RoutineSelectOption[] {
  return ROUTINE_WEEKDAY_KEYS.map((key, value) => ({
    value: String(value),
    label: t(key),
  }));
}

export function routineIntervalUnitOptions(): RoutineSelectOption[] {
  return [
    { value: "minutes", label: t("settings.schedule.unitOption.minutes") },
    { value: "hours", label: t("settings.schedule.unitOption.hours") },
    { value: "days", label: t("settings.schedule.unitOption.days") },
  ];
}

export function routineShortIntervalUnitOptions(): RoutineSelectOption[] {
  return routineIntervalUnitOptions().slice(0, 2);
}

export function routineDayKindOptions(): RoutineSelectOption[] {
  return [
    { value: "every-day", label: t("settings.schedule.dayKind.everyDay") },
    { value: "days-of-week", label: t("settings.schedule.dayKind.daysOfWeek") },
    { value: "days-of-month", label: t("settings.schedule.dayKind.daysOfMonth") },
  ];
}

export function routineTimeModeOptions(): RoutineSelectOption[] {
  return [
    { value: "at-time", label: t("settings.schedule.timeMode.atTime") },
    { value: "every", label: t("settings.schedule.timeMode.every") },
  ];
}

export const ROUTINE_HOUR_MINUTE_OPTIONS: RoutineSelectOption[] = [0, 15, 30, 45].map((minute) => ({
  value: String(minute),
  label: `:${String(minute).padStart(2, "0")}`,
}));

export const ROUTINE_TIME_OPTIONS: RoutineSelectOption[] = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { value, label: formatRoutineClock(value) };
});

export function defaultRoutineSchedule(kind: RoutineSchedule["kind"]): RoutineSchedule {
  switch (kind) {
    case "hourly":
      return { kind, minute: 0 };
    case "daily":
    case "weekdays":
      return { kind, time: "09:00" };
    case "weekly":
      return { kind, weekday: 1, time: "09:00" };
    case "monthly":
      return { kind, day: 1, time: "09:00" };
    case "interval":
      return { kind, amount: 15, unit: "minutes", anchorAt: new Date().toISOString() };
    case "advanced":
      return {
        kind,
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        days: { kind: "every-day" },
        time: { kind: "at-time", time: "09:00" },
      };
    case "custom":
      return { kind, expression: "0 9 * * 1-5" };
  }
}

export function routineScheduleSummary(schedule: RoutineSchedule, sentence = false): string {
  switch (schedule.kind) {
    case "hourly":
      return t("settings.schedule.summary.hourly", { minute: String(schedule.minute).padStart(2, "0") });
    case "daily":
      return t(sentence ? "settings.schedule.summary.dailyOn" : "settings.schedule.summary.daily", {
        time: formatRoutineClock(schedule.time),
      });
    case "weekdays":
      return t(sentence ? "settings.schedule.summary.weekdaysOn" : "settings.schedule.summary.weekdays", {
        time: formatRoutineClock(schedule.time),
      });
    case "weekly":
      return t(sentence ? "settings.schedule.summary.weeklyOn" : "settings.schedule.summary.weekly", {
        day: t(ROUTINE_WEEKDAY_KEYS[schedule.weekday]),
        time: formatRoutineClock(schedule.time),
      });
    case "monthly":
      return t(sentence ? "settings.schedule.summary.monthlyOn" : "settings.schedule.summary.monthly", {
        day: schedule.day,
        time: formatRoutineClock(schedule.time),
      });
    case "interval":
      return t("settings.schedule.summary.interval", {
        amount: schedule.amount,
        unit: routineIntervalUnitWord(schedule.unit, schedule.amount),
      });
    case "advanced":
      return t("settings.schedule.summary.advanced");
    case "custom":
      return t("settings.schedule.summary.custom", { expression: schedule.expression });
  }
}

function routineIntervalUnitWord(unit: Extract<RoutineSchedule, { kind: "interval" }>["unit"], count: number): string {
  switch (unit) {
    case "minutes":
      return t("settings.schedule.unitWord.minutes", { count });
    case "hours":
      return t("settings.schedule.unitWord.hours", { count });
    case "days":
      return t("settings.schedule.unitWord.days", { count });
  }
}

export function formatRoutineClock(value: string): string {
  const [hourText = "0", minuteText = "0"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hour, minute),
  );
}

export function routineTimeMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function routineScheduleKind(value: string): RoutineSchedule["kind"] {
  if (
    value === "hourly" ||
    value === "daily" ||
    value === "weekdays" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "interval" ||
    value === "advanced" ||
    value === "custom"
  ) {
    return value;
  }
  return "daily";
}

export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "hourly",
): Extract<RoutineSchedule, { kind: "hourly" }> | null;
export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "weekly",
): Extract<RoutineSchedule, { kind: "weekly" }> | null;
export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "monthly",
): Extract<RoutineSchedule, { kind: "monthly" }> | null;
export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "interval",
): Extract<RoutineSchedule, { kind: "interval" }> | null;
export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "custom",
): Extract<RoutineSchedule, { kind: "custom" }> | null;
export function scheduleOfKind(
  value: RoutineSchedule,
  kind: "advanced",
): Extract<RoutineSchedule, { kind: "advanced" }> | null;
export function scheduleOfKind(value: RoutineSchedule, kind: RoutineSchedule["kind"]): RoutineSchedule | null {
  return value.kind === kind ? value : null;
}

export function dailyRoutineSchedule(
  value: RoutineSchedule,
): Extract<RoutineSchedule, { kind: "daily" | "weekdays" }> | null {
  return value.kind === "daily" || value.kind === "weekdays" ? value : null;
}

export function routineAtTime(
  value: Extract<RoutineSchedule, { kind: "advanced" }>["time"],
): Extract<Extract<RoutineSchedule, { kind: "advanced" }>["time"], { kind: "at-time" }> | null {
  return value.kind === "at-time" ? value : null;
}

export function routineIntervalUnit(value: string): "minutes" | "hours" | "days" {
  return value === "hours" || value === "days" ? value : "minutes";
}

export function routineShortIntervalUnit(value: string): "minutes" | "hours" {
  return value === "hours" ? "hours" : "minutes";
}

export function routineDayKind(value: string): "every-day" | "days-of-week" | "days-of-month" {
  return value === "days-of-week" || value === "days-of-month" ? value : "every-day";
}

export function routineIntegerValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function routineNumberList(value: string): number[] {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));
}
