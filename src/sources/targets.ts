import type { CollectionTarget } from "./collect";

/**
 * What gets collected for each beta city. Deliberately broad (search filters
 * run in the app afterwards), with rent caps that keep volumes reasonable.
 */
export const COLLECTION_TARGETS: CollectionTarget[] = [
  { criteria: { cityId: "paris", maxRent: 4000 }, maxItems: 3000 },
  { criteria: { cityId: "rennes", maxRent: 2500 }, maxItems: 1500 },
  { criteria: { cityId: "london", maxRent: 5000 }, maxItems: 3000 },
];
