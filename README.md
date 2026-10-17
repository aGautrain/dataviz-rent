# DatavizRent

Appli web pour trouver des logements en location selon le temps de trajet porte à porte
vers une adresse, le prix, le nombre de chambres et la surface. Beta : Paris, Rennes, Londres.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/domain/` | Modèle métier indépendant du pays : pays et villes (`countries.ts`), unités et devises (`units.ts`), format commun d'une annonce (`listing.ts`). |
| `src/db/` | Schéma Postgres/PostGIS (Drizzle) et accès aux annonces. |
| `src/lib/beta-access.ts` | Accès réservé aux testeurs (authentification HTTP Basic). |
| `src/proxy.ts` | Applique l'accès beta à toutes les pages, sauf `/api/health`. |
| `drizzle/` | Migrations SQL. |
| `deploy/` | Configuration du reverse proxy HTTPS (Caddy). |

### Multi-pays

Tout ce qui varie selon le marché est décrit dans `src/domain/countries.ts` : devise, unité de
surface, façon de compter les pièces (« pièces » en France, « bedrooms » au Royaume-Uni). Les
annonces sont stockées dans un format commun : loyer mensuel en centimes avec sa devise, surface en
m², chambres et pièces, position GPS. Ajouter une ville revient à l'ajouter à `CITIES`.

## Développement local

Prérequis : Node 22 et Docker (ou un Postgres avec PostGIS).

```bash
npm install
cp .env.example .env.local        # DATABASE_URL suffit en local
docker compose -f docker-compose.dev.yml up -d
npm run db:migrate
npm run dev                       # http://localhost:3000
```

Sans `BETA_USERS`, l'appli est ouverte en développement et fermée en production.

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires. Les tests base de données tournent si `TEST_DATABASE_URL` pointe vers une base jetable. |
| `npm run lint` / `npm run typecheck` | Vérifications statiques. |
| `npm run db:generate` | Génère une migration après une modification de `src/db/schema.ts`. |

## Mise en ligne (VPS)

Un VPS avec Docker suffit, avec 4 Go de RAM au départ puis 8 à 16 Go quand le moteur d'itinéraires
arrivera. Il faut aussi un nom de domaine qui pointe vers le serveur.

```bash
git clone https://github.com/aGautrain/dataviz-rent && cd dataviz-rent
cp .env.example .env              # DOMAIN, POSTGRES_PASSWORD, BETA_USERS
docker compose up -d --build
```

Caddy obtient le certificat HTTPS automatiquement. Les migrations sont appliquées à chaque
démarrage. Pour ajouter un testeur, complète `BETA_USERS` (`login:motdepasse` séparés par des
virgules) puis lance `docker compose up -d app`.
