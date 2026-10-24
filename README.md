# DEBRIX

DEBRIX coordinates construction and demolition (C&D) waste pickup, transport, facility receipt, processing and recovery. It is a conventional non-AI web application: bookings, status transitions and recovery totals are validated by deterministic server-side rules.

## Workflow

1. **Customer** submits material, estimated quantity, pickup address, preferred date, instructions and a required pickup pin. A booking access token lets the same customer review private booking details and evidence.
2. **Operator** reviews a request and either rejects it with a recorded reason or assigns it to a configured transporter, vehicle, pickup date and facility.
3. **Transporter** sees only bookings assigned to that account and records pickup, transit and optional device GPS updates.
4. **Recycler** confirms the assigned facility's receipt, actual weight, discrepancy note where the received quantity differs by more than 5%, and supporting evidence. The recycler then records sorting, recovered outputs and residual destination.
5. **Customer** sees the timestamped status history and completion evidence.

The map uses Leaflet and OpenStreetMap tiles. A location update is only recorded when the transporter explicitly shares browser GPS; no simulated tracking is presented as live.

## Architecture and current limits

- The browser app is plain HTML, CSS and JavaScript in `public/`.
- `server.mjs` is the local Node HTTP server. It persists local workflow data in SQLite at `data/debrix.sqlite`, enables foreign keys and WAL, and writes booking events with actor, role and timestamp.
- `api/[...path].mjs` is the Vercel serverless adapter. It stores a shared JSON document in Vercel Blob. It is persistent, but it is not a relational database and does not provide the same transaction or constraint guarantees as SQLite. The local and Vercel adapters also still contain duplicated route logic.
- Seeded bookings and offers are marked **DEMO**. New records are not labelled demo. Demo records are illustrative and are not official municipal or regulatory data.
- Staff sessions are signed, role-bound, HTTP-only cookies. With `DEBRIX_STAFF_ACCOUNTS_JSON`, accounts are matched by role, username and passcode, and transporter assignments must reference a configured transporter account.
- Customer access is token-based rather than a conventional registered customer account. Keep the access token private; anyone with it can access that booking.

This is a functional demo/staging application, not yet a full-scale production data platform. Before high-volume or regulated deployment, migrate the Vercel adapter to a relational database with transactions, foreign keys, migrations and row-level authorization; replace customer access tokens with a supported customer identity flow if required; and verify facility, transporter and evidence policies for the operating jurisdiction.

## Run locally

Requires Node.js 24 or newer.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and configure staff accounts. Do not commit `.env`.
3. Start the server: `npm start`.
4. Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

On first run, the local database is seeded with clearly marked demo records. To reset a local demo database, stop the server and remove `data/debrix.sqlite` and its `-wal` / `-shm` files. This also removes records entered locally.

## Staff account configuration

For deployment, prefer an explicit account list and a unique session signing secret. Set these as Vercel environment variables for every environment that should use the application.

```json
[
  {"role":"operator","username":"dispatch1","passcode":"replace-with-a-long-random-secret"},
  {"role":"transporter","username":"driver1","passcode":"replace-with-a-different-long-secret"},
  {"role":"recycler","username":"facility1","passcode":"replace-with-another-long-secret"}
]
```

Set that JSON as `DEBRIX_STAFF_ACCOUNTS_JSON`. Each passcode must contain at least 12 characters. Account-list mode disables passcode-only fallback. Give every staff account a unique username. The legacy `DEBRIX_ADMIN_PASSCODE` can sign in to the operator role only; transporter and recycler roles require their own passcode or an explicit account entry. Use a random, stable `DEBRIX_SESSION_SECRET`; changing it signs out all staff sessions.

For a local single-operator demo, `DEBRIX_ADMIN_PASSCODE` is still accepted. Role-specific passcodes can be set with `DEBRIX_OPERATOR_PASSCODE`, `DEBRIX_TRANSPORTER_PASSCODE`, and `DEBRIX_RECYCLER_PASSCODE`. Use the explicit account list for real assignment ownership.

## Verification

```sh
npm run check
npm test
```

The workflow tests launch an isolated SQLite server and exercise authentication, role scoping, assignment, transporter updates, GPS ownership, receipt variance, evidence access, recovery balance, closure and rejection. They do not write to a configured production database.

## Deploying to Vercel

The Vercel function requires the `@vercel/blob` integration and a valid `BLOB_READ_WRITE_TOKEN`. Configure the staff variables above in Project Settings ڷ^~)޶ Environment Variables, then deploy. Keep separate credentials between Preview and Production. The Vercel adapter uses Blob-backed document persistence, so it is appropriate for the current demo/staging scale only; do not treat it as transactional storage for concurrent production dispatch until it is migrated to a database.

Optional `PORT` defaults to `4173` locally. Optional `DEBRIX_DATA_DIR` selects the local SQLite data directory. No AI provider key, model, chatbot, vector store or external analytics service is used.
