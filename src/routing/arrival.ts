/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The commute travel times are computed for: arriving at `hour` local time on
 * the next working day (Monday to Friday) strictly after `now`.
 */
export function nextWorkdayArrival(now: Date, timeZone: string, hour = 9): Date {
  const local = new Date(now.getTime() + zoneOffset(now.getTime(), timeZone));
  for (let days = 1; days <= 7; days++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour));
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    // `day` is the wall-clock time; shift it by the zone's offset at that moment.
    const guess = day.getTime() - zoneOffset(day.getTime(), timeZone);
    return new Date(day.getTime() - zoneOffset(guess, timeZone));
  }
  throw new Error("unreachable: a week always has a working day");
}
