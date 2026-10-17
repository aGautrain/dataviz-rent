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
 * The day every travel time is computed for: a regular Monday, outside school
 * and public holidays in France and England. MOTIS loads only this day's
 * timetables (`first_day` in routing/config.yml, which a test keeps equal), so
 * the data never goes stale and needs no refresh. Changing it means importing
 * the timetables again.
 */
export const TIMETABLE_DAY = "2026-11-02";

/** Arriving at `hour` local time in `timeZone` on `day` (YYYY-MM-DD). */
export function timetableArrival(timeZone: string, day = TIMETABLE_DAY, hour = 9): Date {
  const [year, month, date] = day.split("-").map(Number);
  // The wall-clock time, shifted by the zone's offset at that moment.
  const wall = Date.UTC(year, month - 1, date, hour);
  const guess = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(guess, timeZone));
}
