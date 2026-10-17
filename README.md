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

### Ajouter un autre projet sur le VPS

Choisis un `project_name`, un domaine et un port local libre (à ajouter au tableau ci-dessus), et
copie le principe de `webproxy.yml` : un fichier de site nginx à son nom, sans `default_server`.
