import { describe, expect, it } from "vitest";
import { getCity } from "@/domain/countries";
import { withCityName } from "@/geocoding/query";

const london = getCity("london")!;
const paris = getCity("paris")!;

describe("withCityName", () => {
  it("appends the city's local name when the address doesn't end with it", () => {
    expect(withCityName("1 Downing Street", london)).toBe("1 Downing Street, London");
    expect(withCityName("  8 rue de Rivoli, ", paris)).toBe("8 rue de Rivoli, Paris");
  });

  it("keeps addresses that already end with the city, in either language", () => {
    expect(withCityName("1 Downing Street, London", london)).toBe("1 Downing Street, London");
    expect(withCityName("1 downing street london.", london)).toBe("1 downing street london");
    expect(withCityName("1 Downing Street, Londres", london)).toBe("1 Downing Street, Londres");
    expect(withCityName("8 rue de Rivoli 75001 PARIS", paris)).toBe("8 rue de Rivoli 75001 PARIS");
  });

  it("only matches the city as a whole word", () => {
    expect(withCityName("Rue de Montparis", paris)).toBe("Rue de Montparis, Paris");
  });
});
