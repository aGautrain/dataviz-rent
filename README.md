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
| `src/sources/` | Collecte des annonces : contrat commun des sites (`types.ts`), pipeline (`collect.ts`), registre (`registry.ts`) et un adaptateur par site dans `adapters/`. |
| `src/routing/`, `src/geocoding/`, `routing/` | Temps de trajet : client MOTIS, géocodeurs par pays, et la configuration du serveur MOTIS. |
| `src/app/page.tsx`, `src/components/` | Page de recherche : filtres (dans l'URL, donc partageables), liste, carte MapLibre (fond OpenFreeMap) et liens « Créer une alerte » vers chaque site. |
| `src/app/api/cron/collect` | Lance une collecte, appelé toutes les 6 h par le conteneur `scheduler`. |
| `drizzle/` | Migrations SQL. |
| `deploy/` | Configuration du reverse proxy HTTPS (Caddy). |

### Multi-pays

Tout ce qui varie selon le marché est décrit dans `src/domain/countries.ts` : devise, unité de
surface, façon de compter les pièces (« pièces » en France, « bedrooms » au Royaume-Uni). Les
annonces sont stockées dans un format commun : loyer mensuel en centimes avec sa devise, surface en
m², chambres et pièces, position GPS. Ajouter une ville revient à l'ajouter à `CITIES`.

### Ajouter un site d'annonces

Chaque site est un adaptateur qui implémente `SourceAdapter` (`src/sources/types.ts`) :

- `search(critères)` renvoie les annonces brutes du site, page après page. Si le site plafonne ses
  résultats, l'adaptateur lève `SearchTruncated`, et la collecte ne marque alors rien comme retiré.
- `normalize(annonce)` la convertit au format commun `Listing`, ou renvoie `null` si elle est inutilisable.
- `buildSearchUrl(critères)` donne la page de recherche du site, déjà filtrée, où créer une alerte.

Pour ajouter un site, il suffit d'écrire son fichier dans `src/sources/adapters/`, de l'ajouter à
`ADAPTERS` dans `registry.ts` et de tester son parsing sur un vrai échantillon dans `tests/fixtures/`.
`LIVE_SOURCES=1 npx vitest run tests/live-sources.test.ts` vérifie chaque site contre les vraies pages.

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

## Mise en ligne (VPS partagé)

L'appli tourne sur le même VPS que [ratelflix-transcriptions](https://github.com/aGautrain/ratelflix-transcriptions).
Chaque projet garde son propre dossier, son propre port local et son propre site nginx, ce qui
permet d'en ajouter d'autres sans toucher aux projets déjà en place.

| Ressource sur le VPS | Partagée | Propre à chaque projet |
|---|---|---|
| nginx (80/443), certbot, ufw, fail2ban, clé SSH | ✓ (mis en place par `bootstrap.yml` de ratelflix) | |
| Dossier d'installation | | `/opt/<projet>` |
| Port local derrière nginx | | ratelflix `8787`, dataviz-rent `3100` |
| Site nginx et certificat | | `/etc/nginx/sites-available/<projet>.conf`, un certificat par domaine |
| Conteneurs, réseau et volumes Docker | | préfixés `dataviz-rent` (`name:` dans `docker-compose.yml`) |

Le port de l'appli n'écoute que sur `127.0.0.1`, parce que Docker contourne ufw pour les ports
publiés. Postgres n'est pas exposé du tout.

### Déployer

Les playbooks Ansible sont dans `deploy/ansible/`. Ils supposent que le VPS a déjà été sécurisé par
`bootstrap.yml` de ratelflix.

```bash
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
cp inventory.example.ini inventory.ini        # IP du VPS (la même que ratelflix)
cp production.env.example production.env      # mots de passe Postgres et testeurs
# Renseigner `domain` dans group_vars/all.yml, et faire pointer son DNS vers le VPS.
ansible-playbook site.yml                     # Docker, appli, puis site nginx + HTTPS
```

Pour les mises à jour suivantes : `ansible-playbook deploy.yml`. Pour ajouter un testeur, modifie
`BETA_USERS` dans `production.env`, puis relance `deploy.yml`.

### Temps de trajet (MOTIS)

Les temps de trajet porte à porte viennent de [MOTIS](https://github.com/motis-project/motis),
auto-hébergé dans le même `docker compose` (service `routing`, désactivé par défaut). Il charge les
rues d'OpenStreetMap et les horaires GTFS d'Île-de-France Mobilités, du STAR et de Londres (Bus Open
Data Service : bus, métro, DLR, tram). L'appli lui demande en une requête le temps de trajet de
chaque annonce vers l'adresse saisie, pour une arrivée à 9 h un lundi ordinaire fixé une fois pour
toutes (`TIMETABLE_DAY` dans `src/routing/arrival.ts`, et `first_day` dans `routing/config.yml`) :
le 2 novembre 2026, hors vacances scolaires et jours fériés. Les horaires de ce jour sont importés
une seule fois et ne périment pas, il n'y a rien à rafraîchir. Les adresses
sont géocodées par la Base Adresse Nationale (France) et Nominatim (Royaume-Uni).

Le tout est dimensionné pour le petit VPS actuel (2 vCPU, 1,8 Go de RAM) :

- zones de carte serrées (Paris et petite couronne, Rennes Métropole, Grand Londres) ;
- un seul jour d'horaires et un seul thread de calcul ;
- MOTIS plafonné à 700 Mo de RAM et un cœur : au-delà il utilise le swap, ce qui ralentit les
  réponses (plusieurs secondes, jusqu'à une minute) sans prendre de mémoire aux autres projets ;
- l'import tourne surtout dans le swap (8 Go, créé par `routing.yml`) ;
- les temps calculés sont gardés en base (`travel_time_cache`) : chaque annonce n'est calculée
  qu'une fois par adresse, même après un redémarrage, et changer un filtre de loyer ou de surface
  ne relance pas le calcul. Les réponses des géocodeurs sont gardées de même (`geocode_cache`),
  pour ne demander chaque adresse qu'une fois à la BAN et à Nominatim.

Sur un serveur plus gros, il suffit de relever les limites `ROUTING_*` dans `production.env`.
Pour l'activer :

1. Dans `production.env`, décommenter `COMPOSE_PROFILES=routing` et `MOTIS_URL=http://routing:8080`.
2. `ansible-playbook deploy.yml`, puis `ansible-playbook routing.yml`, qui ajoute le swap s'il n'y
   en a pas, télécharge les données et les importe. `prepare.sh` vérifie que chaque fichier
   d'horaires couvre le jour fixé. Le STAR ne publie qu'une semaine à l'avance : lancé plus tôt,
   l'import laisse Rennes sans transports (trajets à pied) et le signale ; relancer
   `routing.yml` dans la semaine qui précède le jour fixé l'ajoute, sans retélécharger le reste.

Changer de jour : modifier les deux constantes, supprimer le volume `routing-input` et relancer
`routing.yml`. Les temps déjà en base pour l'ancien jour ne sont plus lus.

Sans MOTIS, la recherche fonctionne et signale que les temps de trajet sont indisponibles. Le
code passe par l'interface `TravelTimeEngine` (`src/routing/`), ce qui permet de changer de
moteur sans toucher à la recherche. Le job CI `routing` vérifie le client contre la vraie image
MOTIS, sur un petit réseau de test (`routing/test/make_fixture.py`).

Limite connue : Londres n'a pas encore l'Overground ni l'Elizabeth line, qui viennent des données
National Rail (compte gratuit nécessaire).

### Ajouter un autre projet sur le VPS

Choisis un `project_name`, un domaine et un port local libre (à ajouter au tableau ci-dessus), et
copie le principe de `webproxy.yml` : un fichier de site nginx à son nom, sans `default_server`.
