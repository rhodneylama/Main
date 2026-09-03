/**
 * Hosting dashboards hand you empty strings, not missing variables. Railway in
 * particular reads `.env.example` and pre-creates every name it finds, so a
 * variable you never filled in arrives as "" — and `??` treats that as a real
 * value, because it only falls back on null and undefined.
 *
 * Everything that reads configuration goes through here, so a blank field in a
 * hosting dashboard behaves the same as an absent one.
 */
export function nonEmpty(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
