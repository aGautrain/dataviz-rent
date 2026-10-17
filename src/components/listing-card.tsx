import { COUNTRIES } from "@/domain/countries";
import { sizeLabel, type Listing } from "@/domain/listing";
import { formatArea, formatMoney } from "@/domain/units";
import { getAdapter } from "@/sources/registry";

/** The interface is in French whatever the market, so numbers are too. */
export const UI_LOCALE = "fr-FR";

function areaLabel(listing: Listing): string | null {
  if (listing.areaM2 === null) return null;
  const m2 = formatArea(listing.areaM2, "m2", UI_LOCALE);
  return COUNTRIES[listing.country].areaUnit === "sqft"
    ? `${m2} (${formatArea(listing.areaM2, "sqft", UI_LOCALE)})`
    : m2;
}

export function ListingCard({ listing, timeZone }: { listing: Listing; timeZone: string }) {
  const country = COUNTRIES[listing.country];
  const details = [
    sizeLabel(listing, country.roomConvention),
    areaLabel(listing),
    listing.furnished === true ? "meublé" : listing.furnished === false ? "non meublé" : null,
  ].filter((part) => part !== null);
  const published = listing.publishedAt
    ? new Intl.DateTimeFormat(UI_LOCALE, { day: "numeric", month: "short", timeZone }).format(
        listing.publishedAt,
      )
    : null;

  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-lg border border-zinc-200 p-2 hover:border-blue-500 dark:border-zinc-800"
    >
      {listing.photoUrl ? (
        // Remote photos from many hosts: next/image would need each one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-20 w-28 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-20 w-28 shrink-0 rounded bg-zinc-100 dark:bg-zinc-900" />
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold">
          {formatMoney(listing.rent, UI_LOCALE)}
          <span className="font-normal text-zinc-500"> /mois</span>
          {listing.chargesIncluded && (
            <span className="text-xs font-normal text-zinc-500"> charges comprises</span>
          )}
        </p>
        <p className="text-sm">{details.join(" · ")}</p>
        <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{listing.title}</p>
        <p className="text-xs text-zinc-500">
          {getAdapter(listing.source)?.name ?? listing.source}
          {published && ` · publiée le ${published}`}
        </p>
      </div>
    </a>
  );
}
