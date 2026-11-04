/** Pure validation and aggregation helpers for study sessions. */

export interface SessionLimits {
  min: number;
  max: number;
}

/** Today's date as YYYY-MM-DD in UTC. Dates are compared as UTC calendar days throughout. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Returns a list of validation errors (empty when the session is valid). */
export function validateSession(
  input: { date: string; minutes: number },
  limits: SessionLimits,
  today: string = todayUtc(),
): string[] {
  const errors: string[] = [];
  if (!isValidDateString(input.date)) {
    errors.push('date must be a valid date in YYYY-MM-DD format');
  } else if (input.date > today) {
    errors.push('date cannot be in the future');
  }
  if (input.minutes < limits.min || input.minutes > limits.max) {
    errors.push(`minutes must be between ${limits.min} and ${limits.max}`);
  }
  return errors;
}

/** Monday (UTC) of the week containing the given YYYY-MM-DD date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Minutes per week for the last `weeks` weeks, oldest first, including empty weeks. */
export function weeklyMinutes(
  sessions: { date: Date | string; minutes: number }[],
  weeks = 6,
  today: string = todayUtc(),
): { weekStart: string; minutes: number }[] {
  const buckets = new Map<string, number>();
  const current = new Date(`${weekStart(today)}T00:00:00Z`);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of sessions) {
    const day = typeof s.date === 'string' ? s.date : s.date.toISOString().slice(0, 10);
    const key = weekStart(day);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + s.minutes);
  }
  return [...buckets].map(([week, minutes]) => ({ weekStart: week, minutes }));
}
