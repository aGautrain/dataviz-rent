import { describe, expect, it } from "vitest";
import { getCity, type CityConfig } from "@/domain/countries";
import { createBanGeocoder } from "@/geocoding/ban";
import { createNominatimGeocoder } from "@/geocoding/nominatim";

const paris = getCity("paris") as CityConfig;
const london = getCity("london") as CityConfig;

function fakeFetch(body: unknown, seen: URL[] = []) {
  return (async (url: URL) => {
    seen.push(url);
    return Response.json(body);
  }) as unknown as typeof fetch;
}

describe("BAN geocoder", () => {
  it("returns the best match near the city", async () => {
    const seen: URL[] = [];
    const geocoder = createBanGeocoder(
      fakeFetch(
        {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [2.3376, 48.8606] },
              properties: { label: "8 Rue de Rivoli 75004 Paris", score: 0.93 },
            },
          ],
        },
        seen,
      ),
    );
    expect(await geocoder.geocode("8 rue de rivoli", paris)).toEqual({
      label: "8 Rue de Rivoli 75004 Paris",
      location: { lat: 48.8606, lng: 2.3376 },
    });
    expect(seen[0].origin + seen[0].pathname).toBe("https://data.geopf.fr/geocodage/search");
    expect(seen[0].searchParams.get("lat")).toBe("48.8566");
  });

  it("ignores weak matches", async () => {
    const geocoder = createBanGeocoder(
      fakeFetch({
        features: [{ geometry: { coordinates: [2, 48] }, properties: { label: "Paray", score: 0.2 } }],
      }),
    );
    expect(await geocoder.geocode("zzzz", paris)).toBeNull();
  });
});

describe("Nominatim geocoder", () => {
  it("shortens the label and stays in the country", async () => {
    const seen: URL[] = [];
    const geocoder = createNominatimGeocoder(
      fakeFetch(
        [
          {
            lat: "51.5033635",
            lon: "-0.1276248",
            display_name: "10 Downing Street, Westminster, London, Greater London, England, United Kingdom",
          },
        ],
        seen,
      ),
    );
    expect(await geocoder.geocode("10 Downing Street", london)).toEqual({
      label: "10 Downing Street, Westminster, London",
      location: { lat: 51.5033635, lng: -0.1276248 },
    });
    expect(seen[0].searchParams.get("countrycodes")).toBe("gb");
  });

  it("returns null when nothing matches", async () => {
    expect(await createNominatimGeocoder(fakeFetch([])).geocode("nowhere", london)).toBeNull();
  });
});
