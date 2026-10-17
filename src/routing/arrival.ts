import type { CityConfig, CountryCode } from "@/domain/countries";

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
 * The day travel times are computed for, per country: an ordinary weekday
 * outside school and public holidays. MOTIS loads only these days' timetables
 * (`first_day` and `num_days` in routing/config.yml, checked by a test), from
 * files downloaded once and kept, so the data never goes stale and needs no
 * refresh. London's feed starts later than the French ones, hence its own day.
 */
export const TIMETABLE_DAYS: Record<CountryCode, string> = {
  FR: "2026-10-15",
  GB: "2026-10-19",
};

/** Arriving at `hour` local time in `timeZone` on `day` (YYYY-MM-DD). */
export function arrivalOn(day: string, timeZone: string, hour = 9): Date {
  const [year, month, date] = day.split("-").map(Number);
  // The wall-clock time, shifted by the zone's offset at that moment.
  const wall = Date.UTC(year, month - 1, date, hour);
  const guess = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(guess, timeZone));
}

/** The arrival every commute in this city is computed for: 9 am on its country's day. */
export function timetableArrival(city: Pick<CityConfig, "country" | "timeZone">): Date {
  return arrivalOn(TIMETABLE_DAYS[city.country], city.timeZone);
}
