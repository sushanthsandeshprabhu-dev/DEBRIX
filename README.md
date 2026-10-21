# DEBRIX × AIRWISE prototype

A small, full-stack Bengaluru C&D materials tracking prototype. It uses the Node.js built-in HTTP server and SQLite module, so it needs no package installation or external database. Data persists in `data/debrix-airwise.sqlite`.

## Run locally

1. Install/use Node.js 22.5 or newer (Node 24 is recommended; the built-in `node:sqlite` module is used).
2. In this folder, start the server:

   ```powershell
   node server.mjs
   ```

3. Open [http://127.0.0.1:4173](http://127.0.0.1:4173).
4. Stop the server with Ctrl+C. The SQLite data remains in `data/` on the next run.

On the first run, the app creates four visibly marked **DEMO** pickup records, including an active citizen request and a completed recovery example. To reset the demo database, stop the server and remove `data/debrix-airwise.sqlite` (and its `-shm` / `-wal` companion files), then start the server again. This clears locally recorded pickups too.

## Optional live air-quality source

The app can fetch nearby OpenAQ v3 station reports. Create a local `.env` from `.env.example`, then set `OPENAQ_API_KEY` to a key from OpenAQ. Optionally set `OPENAQ_COORDINATES` and `OPENAQ_RADIUS_METERS`, restart the server, and use **Refresh** in AIRWISE. The server checks within 25 km of central Bengaluru by default and periodically refreshes while running.

The interface shows reported PM2.5 / PM10 values, station name, source, and observation timestamp. It does **not** compute or certify an official AQI, fill gaps with modeled data, or show seeded air readings. Without a configured API key, air data remains empty and clearly marked unavailable. OpenAQ aggregates measurements from upstream providers; station coverage, quality, and reporting freshness vary.

## Prototype workflows

- **Citizen:** request C&D waste pickup, see booking status, follow the event log, and view any recorded facility recovery outcome. DEBRIX is the main citizen experience; AIRWISE is a small area-context panel.
- **Operator / transporter:** assign a vehicle, confirm pickup, and mark transit. No GPS location is simulated.
- **Recycler / processing facility:** record facility receipt weight, then record recycled, reused, and residual output. The backend validates that those weights balance the received weight (±0.03 t), requires a destination for residuals, and requires an evidence reference.
- **City operations:** review the materials chain alongside source/freshness-labeled air observations. The correlation view describes a comparison method but refuses to calculate a signal from seeded or incomplete inputs.

Every new event is timestamped and attached to a booking. Seed records and their events are labeled **DEMO** in the UI. Recovery records are marked “verified” only in the limited prototype sense that an evidence reference was entered and the weight balance reconciled; this is not an independent audit.

## API outline

The UI uses the local JSON API:

- `GET /api/summary` — role-visible bookings, summary counts, and air-source state.
- `GET /api/bookings` / `POST /api/bookings` — list or register a pickup.
- `PATCH /api/bookings/:id/status` — operator transition (assignment → picked up → in transit).
- `PATCH /api/bookings/:id/receipt` — facility intake and measured weight.
- `PATCH /api/bookings/:id/processing` — balanced material outcome and evidence reference.
- `GET /api/air` / `POST /api/air/refresh` — OpenAQ source state and optional refresh.

Demo role headers restrict which workflow actions are available, and citizens only see bookings for their demo profile. This is **not authentication or production access control**. Before deployment, add real identity and authorization, CSRF protection, input rate limiting, secure secret storage, encrypted transport, private data handling/retention rules, backups, monitoring, production database migrations, and facility/operator verification.

## Known limits

- The Bengaluru map is an illustrative locality map; demo pickup pin locations are not survey-accurate or live GPS.
- Demo vehicles, bookings, and facility events do not describe current municipal operations.
- OpenAQ reports upstream measurements, not necessarily real-time values. The app marks values over six hours old as not fresh for its current summary and shows source timestamps on the station table.
- “Verified recovery” is an evidence-linked prototype record, not proof that a partner or downstream destination has been independently audited.
- The app does not issue dust-suppression alerts or infer pollution causation from waste activity.

