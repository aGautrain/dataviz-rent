import { describe, expect, it } from "vitest";
import { getCity, type CityConfig } from "@/domain/countries";
import { withGeocodeCache, type GeocodeStore } from "@/geocoding/cache";
import type { Place } from "@/geocoding/types";

const paris = getCity("paris") as CityConfig;
const london = getCity("london") as CityConfig;
const rivoli: Place = {
  label: "8 Rue de Rivoli 75004 Paris",
  location: { lat: 48.8606, lng: 2.3376 },
};

function memoryStore(): GeocodeStore & { rows: Map<string, Place | null> } {
  const rows = new Map<string, Place | null>();
  return {
    rows,
    async get(cityId, query) {
      return rows.get(`${cityId}|${query}`);
    },
    async put(cityId, query, place) {
      rows.set(`${cityId}|${query}`, place);
    },
  };
}

describe("geocode cache", () => {
  it("asks the geocoder once per address and city, misses included", async () => {
    const asked: string[] = [];
    const geocode = withGeocodeCache(async (query, city) => {
      asked.push(`${city.id}:${query}`);
      return query.includes("rivoli") ? rivoli : null;
    });
    expect(await geocode(" 8 rue de rivoli ", paris)).toEqual(rivoli);
    expect(await geocode("8  Rue de RIVOLI", paris)).toEqual(rivoli);
    expect(await geocode("nowhere", paris)).toBeNull();
    expect(await geocode("nowhere", paris)).toBeNull();
    expect(await geocode("8 rue de rivoli", london)).toEqual(rivoli);
    expect(asked).toEqual(["paris:8 rue de rivoli", "paris:nowhere", "london:8 rue de rivoli"]);
  });

  it("keeps answers in the store across restarts", async () => {
    const store = memoryStore();
    let calls = 0;
    const geocoder = async () => {
      calls++;
      return rivoli;
    };
    await withGeocodeCache(geocoder, { store })("8 rue de Rivoli", paris);
    expect(store.rows.get("paris|8 rue de rivoli")).toEqual(rivoli);
    // A new process: empty memory, same store.
    expect(await withGeocodeCache(geocoder, { store })("8 RUE DE RIVOLI", paris)).toEqual(rivoli);
    expect(calls).toBe(1);
  });

  it("does not remember failures", async () => {
    let fail = true;
    const geocode = withGeocodeCache(async () => {
      if (fail) throw new Error("down");
      return rivoli;
    });
    await expect(geocode("rivoli", paris)).rejects.toThrow("down");
    fail = false;
    expect(await geocode("rivoli", paris)).toEqual(rivoli);
  });
});
