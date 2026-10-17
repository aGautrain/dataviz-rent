import type { AreaUnit, CurrencyCode } from "./countries";

/** Prices are stored in minor units (cents, pence) to avoid float rounding. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

const SQFT_PER_M2 = 10.763910417;

export function toSquareMeters(value: number, unit: AreaUnit): number {
  return unit === "m2" ? value : value / SQFT_PER_M2;
}

export function fromSquareMeters(valueM2: number, unit: AreaUnit): number {
  return unit === "m2" ? valueM2 : valueM2 * SQFT_PER_M2;
}

export function money(amount: number, currency: CurrencyCode): Money {
  return { amountMinor: Math.round(amount * 100), currency };
}

/** UK listings often quote rent per week; we normalise everything to per month. */
export function weeklyToMonthly(amountMinor: number): number {
  return Math.round((amountMinor * 52) / 12);
}

export function formatMoney(value: Money, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: 0,
  }).format(value.amountMinor / 100);
}

export function formatArea(valueM2: number, unit: AreaUnit, locale: string): string {
  const value = Math.round(fromSquareMeters(valueM2, unit));
  const suffix = unit === "m2" ? "m²" : "sq ft";
  return `${new Intl.NumberFormat(locale).format(value)} ${suffix}`;
}
