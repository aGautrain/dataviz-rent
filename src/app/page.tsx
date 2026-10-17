import { CITIES, COUNTRIES } from "@/domain/countries";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">DatavizRent</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Trouvez un logement en location selon votre temps de trajet porte à porte,
          votre budget et la surface souhaitée.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">Villes de la beta</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {CITIES.map((city) => {
            const country = COUNTRIES[city.country];
            return (
              <li
                key={city.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="font-medium">{city.name}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {country.name} · {country.currency}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-sm text-zinc-500">
        Recherche et carte à venir : les annonces et les temps de trajet arrivent dans les
        prochaines étapes.
      </p>
    </main>
  );
}
