# Instagram Follower Tracker

A containerised Next.js application that tracks Instagram follower counts. The production image now uses PostgreSQL to persist account metadata and daily follower history, while a cron-backed Python worker keeps the database up to date.

## Prerequisites

- Docker (24+) and Docker Compose
- A PostgreSQL 15+ instance accessible with the following defaults:
  - user: `devuser`
  - password: `devpass`
  - database: `insta-followers`
  - host: `postgres` (override with `POSTGRES_HOST`)

> The Docker entrypoint waits for the database, auto-creates the schema, and imports any legacy JSON files from `public/data` the first time it starts.

## Quick start (existing PostgreSQL)

Point the container at your running PostgreSQL instance by exporting the connection variables before launching:

```bash
POSTGRES_HOST=your-postgres-host \
POSTGRES_PORT=5432 \
POSTGRES_USER=devuser \
POSTGRES_PASSWORD=devpass \
POSTGRES_DB=insta-followers \
docker compose up -d --build
```

- When PostgreSQL runs in another container on the same host, set `POSTGRES_HOST` to that container's name and ensure both containers share a Docker network (see below).
- If PostgreSQL is exposed on the host machine, set `POSTGRES_HOST` to the host/IP (for Docker Desktop `host.docker.internal` works; on Linux use the host IP or a shared bridge network).
- Uncomment the volumes in `docker-compose.yml` if you want to mount an `instagram.session` file or inspect the original JSON data while transitioning.

### Sharing a Docker network with PostgreSQL

1. Create or reuse a user-defined Docker network:
   ```bash
   docker network create insta-net   # run once
   ```
2. Attach your existing PostgreSQL container to that network:
   ```bash
   docker network connect insta-net <postgres-container-name>
   ```
3. Uncomment the `networks` section in `docker-compose.yml` and replace `shared` with the network name you created.
4. Launch the web container on the same network:
   ```bash
   POSTGRES_HOST=<postgres-container-name> \
   POSTGRES_PORT=5432 \
   POSTGRES_USER=devuser \
   POSTGRES_PASSWORD=devpass \
   POSTGRES_DB=insta-followers \
   docker compose up -d --build
   ```

To follow logs (app + cron):

```bash
docker compose logs -f web
```

## Environment variables

The application honours the following variables (defaults shown):

- `POSTGRES_HOST=postgres`
- `POSTGRES_PORT=5432`
- `POSTGRES_USER=devuser`
- `POSTGRES_PASSWORD=devpass`
- `POSTGRES_DB=insta-followers`
- `MAX_ACCOUNTS_PER_RUN` (optional; leave unset to process every account each run, or set to a positive integer to cap the batch size if you want additional rate-limit protection)
- `INSTAGRAM_USERNAME` (optional; defaults to `cristianofagundes`, used when loading Instaloader sessions)
- `INSTAGRAM_SESSION_FILE` (optional path to a session file or JSON containing `{ "sessionid": "..." }`; defaults to `/app/instagram.session`)
- `INSTAGRAM_SESSION_ID` (optional; raw `sessionid` value copied from Instagram cookies—overrides the file-based options)

For deployments that use an external database, set these variables (e.g. via `docker run -e` or Compose overrides) so both the Next.js API and the Python scripts point to the correct server.

## Authorising devices for management

Only devices whose UUIDs exist in the `admin_devices` table can add or remove tracked accounts. To allow a device:

1. Open the dashboard, click **Manage Accounts**, and copy the UUID shown under "Device authorization" (the app generates and persists one automatically).
2. Insert it into Postgres:
   ```sql
   INSERT INTO admin_devices (device_uuid, label)
   VALUES ('your-generated-uuid', 'My laptop');
   ```
3. Reload the dashboard so it can validate the UUID via `/api/admin/device/verify`.

Visitors without an authorised UUID remain read-only.
If the browser blocks local storage (e.g. private mode), the UUID is generated for that session only—you will need to keep it on hand if you plan to re-authorise after refreshing.

## Deploying updates

Use the helper script to sync the project and restart the stack remotely:

```bash
scripts/deploy.sh
```

The script rsyncs the repository (excluding build artefacts) to the configured server and runs `docker compose down` followed by `docker compose up -d --build`. Override the defaults by exporting `REMOTE_USER_HOST`/`REMOTE_PATH` or passing `[user@host] [remote_path]` arguments.

## Migrating legacy JSON data

The startup sequence runs `scripts/import_data.py`, which:

1. Creates the `accounts` and `follower_history` tables if they do not exist.
2. Reads every file under `public/data/*.json`.
3. Inserts accounts and history rows with upserts, so it is safe to re-run at any time.

You can trigger the importer manually:

```bash
docker compose exec web /opt/pyenv/bin/python /app/scripts/import_data.py
```

## Cron schedule and manual updates

- The updater runs every day at 03:00 UTC (see `docker/cron/update_followers`).
- All cron output is forwarded to the container logs; check with `docker compose logs -f web`.
- To force an immediate refresh for every account:

  ```bash
  docker compose exec web /opt/pyenv/bin/python /app/scripts/update_followers.py
  ```

- To fetch a single user on demand:

  ```bash
  docker compose exec web /opt/pyenv/bin/python /app/scripts/update_one.py <username>
  ```

### Providing Instagram session credentials

- **Session file**: generate with `instaloader --login your_username`, upload the resulting `.session` file, and set `INSTAGRAM_SESSION_FILE` (or mount it as `/app/instagram.session`).
- **Cookie JSON**: save `{ "sessionid": "<your cookie value>" }` in a file, mount it, and point `INSTAGRAM_SESSION_FILE` to it.
- **Environment variable**: set `INSTAGRAM_SESSION_ID` directly; no file mount is required. Combine with `INSTAGRAM_USERNAME` if the session belongs to another account.
- If none of these options are supplied the updater falls back to anonymous mode, which is subject to heavier Instagram rate limits.

## Deploying on a remote host via SSH

1. Copy the repository to the target server (for example: `rsync -av --exclude node_modules . user@server:/opt/insta-followers`).
2. SSH into the server (`ssh user@server`) and change to the project directory.
3. Provide Instagram credentials (choose one):
   - copy an Instaloader-generated `.session` file or a JSON file containing `{ "sessionid": "..." }` and set `INSTAGRAM_SESSION_FILE` to its container path; or
   - export `INSTAGRAM_SESSION_ID` with the raw cookie value.
   Optionally override `INSTAGRAM_USERNAME` if the session belongs to another account.
4. Start the stack in the background, supplying the correct PostgreSQL connection variables: `POSTGRES_HOST=<host> POSTGRES_PASSWORD=devpass docker compose up -d --build`.
5. Verify the deployment with `docker compose ps` and `docker compose logs -f web`.

## Development notes

- The Next.js API now reads accounts and history directly from PostgreSQL (`lib/db.ts`).
- Python scripts (`scripts/update_followers.py`, `scripts/update_one.py`) use the same connection settings and upsert logic, keeping the database authoritative for follower data.
- Follower snapshots are stored in the `account_followers` table, populated by the update scripts and exposed through the `/api/data/[username]` endpoint for the UI follower breakdown.
- Account deletion is now soft-delete only: `/api/accounts/delete` flags the row so metadata is retained. Soft-deleted profiles remain visible in reports but are processed last by the updaters and absorb any enforced timeouts.
- Device-based authorization: insert trusted device UUIDs into the `admin_devices` table so those browsers can add or remove tracked accounts. Other visitors remain read-only. The UI stores the UUID locally and validates it through `/api/admin/device/verify` before enabling management actions.
- The dashboard chart offers quick filters for the last 7, 15, 30, 90, or 365 days, plus an "Tudo" view to visualise the complete history.
- JSON exports under `public/data` are retained for historical reference and are automatically imported on container start, but the application no longer depends on them at runtime.
