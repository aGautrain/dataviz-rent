import type { CityId } from "@/domain/countries";
import type { SearchCriteria } from "@/domain/search";
import { bienici } from "./adapters/bienici";
import { rightmove } from "./adapters/rightmove";
import type { SourceAdapter } from "./types";

/** Every supported listing site. Adding a site = adding its adapter here. */
export const ADAPTERS: readonly SourceAdapter[] = [bienici, rightmove];

export function adaptersFor(cityId: CityId): SourceAdapter[] {
  return ADAPTERS.filter((adapter) => adapter.cities.includes(cityId));
}

export function getAdapter(id: string): SourceAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}

export interface AlertLink {
  source: string;
  name: string;
  url: string;
}

/** Alerts v0.1: one pre-filled search page per site covering the city. */
export function alertLinks(criteria: SearchCriteria): AlertLink[] {
  return adaptersFor(criteria.cityId).map((adapter) => ({
    source: adapter.id,
    name: adapter.name,
    url: adapter.buildSearchUrl(criteria),
  }));
}
