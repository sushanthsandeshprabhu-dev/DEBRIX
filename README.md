# DEBRIX

DEBRIX is a non-AI C&D waste pickup and recovery workflow for citizens, operators, transporters, and recycling facilities. It records a pickup request, assignment, transport events, facility receipt, processing, recovered outputs, residual destination, and customer-visible status history.

This is a demonstration application, not a municipal service, verified recycler directory, payment processor, or independent audit system. Seeded records and unverified product listings are labelled **DEMO**.

## Portals

- **Citizen:** submit a pickup request, select a map location, track it with a private booking key, and browse recycled-material listings.
- **Operator:** review bookings, schedule and assign transporter/vehicle/facility, reject with a reason, and monitor operations.
- **Transporter:** view assigned work and report pickup, transit, and device GPS updates.
- **Recycler:** confirm received weights, report discrepancies, record processing and recovered products, and close the chain of custody.

Staff access is role-bound and configured with `DEBRIX_STAFF_ACCOUNTS_JSON`. Customer access uses the booking's private tracking key. The server validates role permissions and workflow transitions.

## Architecture

- Frontend: static HTML, CSS, and browser JavaScript served by Vercel.
- API: Vercel Node.js Functions in `api/[...path].mjs`.
- Production/preview workflow records: Neon Postgres. Bookings, events, products, orders, metadata, and small evidence files are kept in separate tables. Mutations run in a Postgres transaction and use a transaction-scoped advisory lock to serialize state changes across function instances.
- Local development and workflow tests: SQLite through `server.mjs`.
- Legacy evidence: existing evidence references can still be read from the old private Vercel Blob store when that store is available. New evidence files are stored in Postgres and limited to 2 MB each.

The legacy Blob snapshot is not deleted. The one-time import tool merges its records into Postgres without overwriting non-demo records created there.

## Local setup

Requirements: Node.js 24 or newer.

```sh
npm install
cp .env.example .env
```

Set strong, unique staff passcodes and a session secret in `.env`, then run:

```sh
npm start
```

Open `http://localhost:4173`. Local SQLite data is stored under `data/` by default. Set `DEBRIX_DATA_DIR` to choose another directory. Never commit `.env`.

## Connect Neon to Vercel

1. In the Vercel project, open **Storage → Marketplace** and install the Neon Postgres integration. Choose a plan that fits the demonstration; a free database may scale to zero and is not an uptime guarantee.
2. Connect the database to the DEBRIX project and the Preview and Production environments. Keep separate Neon branches/databases for preview and production where the integration supports them.
3. Pull the intended environment locally without sharing its secrets:
   ```sh
   vercel env pull .env.local
   ```
   The API accepts `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`.
4. Apply the schema:
   ```sh
   node --env-file=.env.local scripts/migrate-db.mjs
   ```
5. Deploy the branch. The first data request creates clearly labelled demo records in the configured database if it is empty.

The migration creates `debrix_bookings`, `debrix_events`, `debrix_products`, `debrix_orders`, `debrix_evidence`, and `debrix_metadata`. Database constraints enforce valid booking states, non-negative inventory, evidence size/type limits, and event/order relationships.

Do not place database credentials in browser code. Vercel Marketplace environment variables are server-side; use separate credentials for Preview and Production. The old `BLOB_READ_WRITE_TOKEN` is not needed for new bookings or evidence uploads.

## Import existing Blob records

The Blob store was suspended after the Vercel Hobby usage limit was exceeded. Its contents remain in that store, but they cannot be read until Vercel restores access. The application no longer depends on Blob for new workflow writes.

After restoring Blob access and pulling the relevant variables into `.env.local`, run the non-destructive import:

```sh
node --env-file=.env.local scripts/import-blob-state.mjs
```

The script tries `debrix/state.json` and `debrix-airwise/state.json` by default. Pass the exact private Blob pathname if your snapshot is elsewhere:

```sh
node --env-file=.env.local scripts/import-blob-state.mjs 'debrix-preview/DEPLOYMENT_KEY/state.json'
```

The script reports a suspended source store without changing it. It does not delete the original Blob snapshot. Review imported demo and live records before using the database for a public demonstration.

## Verification

```sh
npm run check
npm test
```

The tests launch an isolated SQLite server and exercise staff-role scoping, booking creation, assignment, transport, recycler receipt/recovery, evidence handling, booking closure, and rejection. They do not connect to Neon. After connecting Neon, verify the Vercel preview end to end and confirm records survive a redeploy.

## Limitations

- Neon credentials, the schema migration, and a Vercel deployment must be configured before the hosted API can use Postgres.
- Existing Blob data cannot be imported while Vercel reports the store as suspended. No old data is deleted by this change.
- The local SQLite test server and the Vercel Postgres adapter are separate implementations; run a hosted preview smoke test after configuring Neon.
- Postgres stores small evidence files for this demonstration to remove the suspended-Blob dependency. For larger or high-volume evidence, move files to a separately monitored object-storage service.
- Real-time vehicle location comes only from a transporter explicitly sharing device GPS; this is not a continuous GPS feed.
- Seeded material listings and records are demo data. Product quality and facility credentials require independent verification before real construction use.
- AIRWISE and AI functionality are not part of this application.
