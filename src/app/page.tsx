import { Suspense } from "react";
import { AlertLinks } from "@/components/alert-links";
import { ListingCard, UI_LOCALE } from "@/components/listing-card";
import { ListingMap, type MapPoint } from "@/components/listing-map";
import { SearchForm } from "@/components/search-form";
import { getDb } from "@/db/client";
import { CITIES, isCityId } from "@/domain/countries";
import { parseCommute, parseCriteria } from "@/domain/search";
import { formatMoney } from "@/domain/units";
import { geocode } from "@/geocoding";
import { getTravelTimeEngine } from "@/routing";
import { runSearch, type SearchOutcome } from "@/search/run-search";

const RESULT_LIMIT = 300;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex w-full flex-1 flex-col lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
      <Suspense
        fallback={
          <p className="p-6 text-sm text-zinc-500">
            Recherche en cours… Avec une adresse de trajet, le calcul peut prendre jusqu&apos;à une
            minute.
          </p>
        }
      >
        <Search searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function summary(outcome: SearchOutcome): string {
  const count = outcome.hits.length;
  if (count === 0) return "Aucune annonce ne correspond à ces critères.";
  if (outcome.truncated) {
    return outcome.destination && !outcome.commuteProblem
      ? `Les ${count} annonces les plus proches en temps de trajet.`
      : `Les ${count} annonces les plus récentes.`;
  }
  return `${count} annonce${count > 1 ? "s" : ""}.`;
}

const PROBLEMS = {
  "address-not-found": "Adresse introuvable : résultats affichés sans temps de trajet.",
  "geocoding-unavailable":
    "La recherche d'adresse ne répond pas : résultats affichés sans temps de trajet.",
  "travel-times-unavailable":
    "Les temps de trajet sont indisponibles pour le moment : résultats affichés sans ce filtre.",
} as const;

async function Search({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const query = await searchParams;
  const criteria = parseCriteria(query, isCityId);
  const commute = parseCommute(query);
  const city = CITIES.find((candidate) => candidate.id === criteria.cityId)!;
  const outcome = await runSearch(criteria, commute, city, RESULT_LIMIT, {
    db: getDb(),
    geocode,
    engine: getTravelTimeEngine(),
    log: console.error,
  });
  const showMinutes = outcome.destination !== null && outcome.commuteProblem === null;

  const points: MapPoint[] = outcome.hits.flatMap(({ listing, minutes }, index) =>
    listing.location
      ? [
          {
            id: index,
            lat: listing.location.lat,
            lng: listing.location.lng,
            title: listing.title,
            price: formatMoney(listing.rent, UI_LOCALE),
            url: listing.url,
            minutes,
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
            Locations filtrées par temps de trajet, budget, taille et surface.
          </p>
        </header>
        <SearchForm key={JSON.stringify([criteria, commute])} criteria={criteria} commute={commute} />
        <AlertLinks criteria={criteria} />
        {outcome.commuteProblem && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {PROBLEMS[outcome.commuteProblem]}
          </p>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {showMinutes && (
            <>
              Trajets en transports vers <strong>{outcome.destination!.label}</strong>, pour une
              arrivée à 9 h un jour de semaine ordinaire.{" "}
            </>
          )}
          {summary(outcome)}
        </p>
      </div>
      <div className="h-[50vh] lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-screen">
        <ListingMap
          points={points}
          bbox={[...city.bbox]}
          destination={outcome.destination?.location ?? null}
        />
      </div>
      <ul className="flex flex-col gap-2 p-4 lg:col-start-1 lg:pt-0">
        {outcome.hits.map(({ listing, minutes }, index) => (
          <li key={`${listing.source}:${listing.sourceId}`}>
            <ListingCard
              listing={listing}
              pointId={listing.location ? index : undefined}
              timeZone={city.timeZone}
              minutes={showMinutes ? minutes : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
