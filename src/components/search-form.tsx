"use client";

import { useState } from "react";
import { CITIES, COUNTRIES, getCity } from "@/domain/countries";
import type { CommuteCriteria, SearchCriteria } from "@/domain/search";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";

function NumberField({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value: number | undefined;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
      <input
        type="number"
        name={name}
        min={0}
        inputMode="numeric"
        defaultValue={value}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

/**
 * Submits by GET so every search is a URL testers can bookmark or share.
 * The page keys it by the criteria, so the fields reset when the URL changes.
 * Picking another city updates the labels at once, before any search.
 */
export function SearchForm({
  criteria,
  commute,
}: {
  criteria: SearchCriteria;
  commute: CommuteCriteria | null;
}) {
  const [cityId, setCityId] = useState<string>(criteria.cityId);
  const city = getCity(cityId);
  const currency = city ? COUNTRIES[city.country].currency : "EUR";
  const symbol = currency === "GBP" ? "£" : "€";
  const furnished =
    criteria.furnished === true ? "yes" : criteria.furnished === false ? "no" : "";

  return (
    <form method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="col-span-2 flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-1">
        Ville
        <select
          name="city"
          value={cityId}
          onChange={(event) => setCityId(event.target.value)}
          className={inputClass}
        >
          {CITIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-3">
        Adresse de trajet (travail, école…)
        {/* An address belongs to one city, so it is cleared when the city changes. */}
        <input
          key={cityId}
          type="text"
          name="to"
          defaultValue={cityId === criteria.cityId ? commute?.to : undefined}
          placeholder={city?.country === "GB" ? "10 Downing Street" : "8 rue de Rivoli"}
          autoComplete="street-address"
          className={inputClass}
        />
      </label>
      <NumberField name="maxMinutes" label="Trajet max (min)" value={commute?.maxMinutes} />
      <NumberField name="minRent" label={`Loyer min (${symbol}/mois)`} value={criteria.minRent} />
      <NumberField name="maxRent" label={`Loyer max (${symbol}/mois)`} value={criteria.maxRent} />
      <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        Meublé
        <select name="furnished" defaultValue={furnished} className={inputClass}>
          <option value="">Indifférent</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </label>
      <NumberField name="minBedrooms" label="Chambres min" value={criteria.minBedrooms} placeholder="0 = studio" />
      <NumberField name="maxBedrooms" label="Chambres max" value={criteria.maxBedrooms} />
      <NumberField name="minArea" label="Surface min (m²)" value={criteria.minAreaM2} />
      <NumberField name="maxArea" label="Surface max (m²)" value={criteria.maxAreaM2} />
      <button
        type="submit"
        className="col-span-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:col-span-4"
      >
        Rechercher
      </button>
    </form>
  );
}
