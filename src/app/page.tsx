import { Suspense } from "react";
import { AlertLinks } from "@/components/alert-links";
import { ListingCard, UI_LOCALE } from "@/components/listing-card";
import { ListingMap, type MapPoint } from "@/components/listing-map";
import { SearchForm } from "@/components/search-form";
import { getDb } from "@/db/client";
import { searchListings } from "@/db/listings";
import { CITIES, isCityId } from "@/domain/countries";
import { parseCriteria } from "@/domain/search";
import { formatMoney } from "@/domain/units";

const RESULT_LIMIT = 300;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex w-full flex-1 flex-col lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Chargement…</p>}>
        <Search searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Search({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const query = await searchParams;
  const criteria = parseCriteria(query, isCityId);
  const city = CITIES.find((candidate) => candidate.id === criteria.cityId)!;
  const results = await searchListings(getDb(), criteria, RESULT_LIMIT);

  const points: MapPoint[] = results.flatMap((listing, index) =>
    listing.location
      ? [
          {
            id: index,
            lat: listing.location.lat,
            lng: listing.location.lng,
            title: listing.title,
            price: formatMoney(listing.rent, UI_LOCALE),
            url: listing.url,
          },
        ]
      : [],
  );

  // On a phone: filters, then the map, then the list. On a wide screen the
  // map sits in its own column and stays in view while the list scrolls.
  return (
    <>
      <div className="flex flex-col gap-4 p-4 lg:col-start-1">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">DatavizRent</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Locations à {city.name}, filtrées par budget, taille et surface.
          </p>
        </header>
        <SearchForm key={JSON.stringify(criteria)} criteria={criteria} />
        <AlertLinks criteria={criteria} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {results.length === 0
            ? "Aucune annonce ne correspond à ces critères."
            : results.length === RESULT_LIMIT
              ? `Les ${RESULT_LIMIT} annonces les plus récentes.`
              : `${results.length} annonce${results.length > 1 ? "s" : ""}.`}
        </p>
      </div>
      <div className="h-[50vh] lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-screen">
        <ListingMap points={points} bbox={[...city.bbox]} />
      </div>
      <ul className="flex flex-col gap-2 p-4 lg:col-start-1 lg:pt-0">
        {results.map((listing) => (
          <li key={`${listing.source}:${listing.sourceId}`}>
            <ListingCard listing={listing} timeZone={city.timeZone} />
          </li>
        ))}
      </ul>
    </>
  );
}
