export function readDevelopmentInstanceId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^\d{4,5}$/u.test(trimmed) ? trimmed : null;
}

export function developmentUserDataName(instanceId: string | null = null): string {
  const base = "Luna Bot Dev";
  return instanceId ? `${base} ${instanceId}` : base;
}
