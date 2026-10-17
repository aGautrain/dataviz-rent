import type { SearchCriteria } from "@/domain/search";
import { alertLinks } from "@/sources/registry";

/**
 * Alerts v0.1: each site's own search page with the same filters, where the
 * tester saves the alert. Travel time is not passed on: no site supports it.
 */
export function AlertLinks({ criteria }: { criteria: SearchCriteria }) {
  const links = alertLinks(criteria);
  if (links.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <p className="text-zinc-600 dark:text-zinc-400">
        Être prévenu des nouvelles annonces : ouvrez la recherche sur le site, avec vos
        filtres déjà remplis, puis créez l&apos;alerte depuis cette page.
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.source}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-blue-600 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
          >
            Créer une alerte sur {link.name}
          </a>
        ))}
      </div>
    </section>
  );
}
