import type { CityConfig, LatLng } from "@/domain/countries";

export interface Place {
  /** The address as the geocoder understood it, shown back to the user. */
  label: string;
  location: LatLng;
}

/** Turns a typed address into coordinates, one implementation per country. */
export interface Geocoder {
  geocode(query: string, near: CityConfig): Promise<Place | null>;
}
