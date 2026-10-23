# DEBRIX

DEBRIX is a runnable Bengaluru C&D materials demo that connects citizen pickup requests, operator dispatch, recycler weighment and recovery, and a recycled-material request market. It is a prototype: seeded records are labelled **DEMO**, and new records are labelled as user-entered operational data. It is not a municipal service, CPCB portal, registered recycler directory, payment processor, or independent audit system.

## Run locally

1. Install Node.js 24 or newer.
2. Copy `.env.example` to `.env` and set `DEBRIX_ADMIN_PASSCODE` to a strong private value of at least 16 characters. Do not commit `.env` or share the passcode in screenshots.
3. Start the app from this folder:

   ```powershell
   npm start
   ```

4. Open [http://127.0.0.1:4173](http://127.0.0.1:4173).
5. Use the Citizen portal on one device. On a second device, open the same hosted app, choose **Admin sign in**, enter the passcode, and switch between **Operator** and **Recycler**.

Locally, SQLite data is stored in `data/debrix-airwise.sqlite`. New booking and market requests persist across restarts. On the first run, the app adds four clearly marked example bookings, three DEMO product offers and two DEMO market requests. To reset local demo state, stop the server and remove the SQLite database and its `-wal` / `-shm` companions. This also removes locally entered records.

## Demonstrate the connected flow

1. On the citizen device, submit a pickup request using a name and phone number you can recognize.
2. On the admin device, sign in and open **Operator → Live dispatch**. The new request appears in the shared list, including address, material, quantity, requested date and citizen contact.
3. Assign a vehicle, confirm pickup, and mark the load in transit. The citizen page refreshes the shared state about every 12 seconds while visible.
4. In the Operator portal, select **Share live GPS** on the in-transit booking and allow browser location access. The citizen booking map shows the latest reported coordinate and update time. Stop sharing when finished.
5. Switch to **Recycler**, receive the load with its measured facility weight and ticket reference, then start processing.
6. Enter each recycled material output by type and measured tonnes, plus reuse, residual and evidence reference. The backend checks that the weights balance within 0.03 t.
7. In **Product inventory**, publish a recovered batch. On the citizen device, request it from **Materials market**. The Recycler confirms the request and records delivery; the citizen can then mark it in use.
8. Only customers who opted in and later marked a delivered product in use appear in the Recycler's active-member list.

For the GPS step, use a current browser on HTTPS (the deployed Vercel domain is HTTPS). Location is requested only after the operator chooses to share. Device GPS can be unavailable or imprecise; the app shows the last device-reported point and accuracy, not a route or arrival estimate.

## Portals and safeguards

- **Citizen:** booking requests, own booking status, a pickup pin when location permission is granted, available recovered-material offers, market requests and optional AIRWISE context.
- **Operator:** new requests and full booking details, dispatch assignments, pickup and transit updates, and opt-in GPS reporting.
- **Recycler:** incoming facility receipts, processing status, weighed material-by-material recovery outputs, residual destination, product inventory, product requests and opted-in active buyers.
- **Administrator access:** operator and recycler views require a backend-validated passcode session. The session uses an `HttpOnly`, `SameSite=Strict` cookie, expires after eight hours, and limits repeated incorrect attempts. Configure the passcode only as a server environment variable.
- **Themes:** the theme button switches between light and dark mode and remembers the choice on that device.
- **Live updates:** portal state refreshes every 12 seconds while visible. This is short-interval polling, not a WebSocket or guaranteed sub-second stream.
- **Persistence:** local workflows use SQLite. The deployed Vercel prototype uses private Vercel Blob JSON state with conditional writes to protect concurrent low-volume updates. Blob is an object/document store, not a relational database; move to managed Postgres before production use, higher write volume or strict transactional guarantees.

## Data provenance and recovery claims

Seeded bookings, orders, inventories and events are labelled **DEMO** and are synthetic. Do not treat the example vehicles, facilities, quantities or names as real city operations. Citizen-entered requests and admin-entered updates are shared application records, but they are not independently verified. A facility evidence reference and balanced mass record are shown as **recorded**, not as proof of an external audit.

New recovery records require a facility-received weight, one or more specific recycled output types and weights, a separate reuse value, a residual value and a supporting evidence reference. The sum must balance the receipt within 0.03 tonnes. The data model keeps mineral debris-derived products distinct from reusable/resalable streams such as metal, wood, plastic and glass.

### Materials and Indian regulatory context

The interface's materials guide reflects the **Environment (Construction and Demolition) Waste Management Rules, 2025**, which took effect on 1 April 2026. The rules list fine aggregate, recycled concrete aggregate, recycled aggregate and manufactured soil as direct outputs, and bricks, blocks, tiles, pavers, kerbs and other precast items as downstream products. They require product quality to meet applicable standards and technical specifications. The rules distinguish debris-derived processed waste from separately handled reusable/resalable materials.

For qualifying construction projects with built-up area of at least 20,000 m², the rules set phased utilisation targets of 5%, 10%, 15%, 20% and 25% across 2026–27 through 2030–31 onward. Their road-construction schedule is 5%, 5%, 10%, 10% and 15% over the same years. Project year, approvals and local applicability matter; these are not household-booking targets. DEBRIX does not calculate statutory compliance or submit to the CPCB portal.

Listed applications—such as road layers, pavers, kerbs, blocks or manufactured soil—are conditional. Check the feedstock, grading, contamination, strength, absorption, durability, current BIS/IRC requirements, test reports, project specification, design approval and applicable local permissions. The market's DEMO offers have no attached test reports. Do not assume structural suitability or certification from a product label.

### AIRWISE context

AIRWISE is a supporting feature only. If `OPENAQ_API_KEY` is configured, the app displays nearby upstream PM2.5 / PM10 measurements with station name, observation time and fetch time. These are not an official DEBRIX AQI or a site measurement. Without a configured source or returned measurements, the UI shows no values. Dust guidance is operational context and does not infer that a waste operation caused a pollution change.

To enable OpenAQ locally, set `OPENAQ_API_KEY` in `.env`. Optional search settings are `OPENAQ_COORDINATES` and `OPENAQ_RADIUS_METERS`.

## Deploy to Vercel

The repository's `vercel.json` serves `public/` as the static frontend and routes `api/[...path].mjs` as the backend function. The Vercel project needs a private Blob store connected so `BLOB_READ_WRITE_TOKEN` is available. Configure `DEBRIX_ADMIN_PASSCODE` as an encrypted or sensitive Vercel environment variable for Production (and Preview only if preview admins need access). Deploy again after changing environment variables. Add `OPENAQ_API_KEY` separately only if the live upstream sensor source is to be enabled.

Do not put the admin passcode in `public/`, browser JavaScript, GitHub, client-visible variables or a screenshot. Changing the Vercel value invalidates existing admin sessions; it also changes what operators/recyclers must enter at sign-in.

## API outline

- `GET /api/session`, `POST /api/session`, `DELETE /api/session` — check, establish and end an administrator session.
- `GET /api/summary`, `GET /api/bookings`, `POST /api/bookings` — citizen-scoped or administrator booking workflows.
- `PATCH /api/bookings/:id/status` — operator assignment and transport updates; recycler processing start.
- `PATCH /api/bookings/:id/location` — operator device-GPS point for an in-transit load.
- `PATCH /api/bookings/:id/receipt` and `/processing` — recycler weighment, outputs and evidence.
- `GET /api/products`, `POST /api/products`, `PATCH /api/products/:id` — citizen listings and recycler stock management.
- `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:id` — market requests, facility confirmation/delivery and citizen in-use update.
- `GET /api/air`, `POST /api/air/refresh` — optional upstream station reports.

## Sources used in the materials guide

- [CPCB — Environment (Construction and Demolition) Waste Management Rules, 2025](https://cpcb.gov.in/uploads/hwmd/C%26D_rules_2025.pdf)
- [MoHUA — C&D waste management manual, processed-waste use guidance](https://mohua.gov.in/upload/uploadfiles/files/Part2.pdf) (older technical guidance; check it against current rules and specifications)
- [CPWD Works Manual 2022 — recycled C&D materials and products](https://cpwd.gov.in/Publication/CPWD_Works_Manual_2022_13122022.pdf)
- [BIS Know Your Standard](https://standards.bis.gov.in/website/standard-details) (look up current IS 383 and product-specific standards)
- [OpenAQ](https://openaq.org/) for optional upstream station measurements

## Prototype limits before public production

This demo has a shared administrator passcode rather than named staff accounts; Operator and Recycler are separate workspaces inside that authenticated session. Each real citizen booking and product request gets a random private access key, stored in that browser, so changing a display name does not reveal another person's contact details. Keep the same browser storage to track those requests; clearing it loses citizen access because account recovery is not implemented. This is a prototype key, not a verified citizen login. The app does not accept uploaded photos, process payments, geocode typed addresses, establish facility/vehicle registration, connect to municipal dispatch or the CPCB EPR portal, validate test certificates, perform independent audits, send SMS, or guarantee delivery. It does not create a statutory record. Before production use, add named accounts and least-privilege authorization, durable relational transactions and backups, secure personal-data retention, upload handling, rate limiting and monitoring, registered-partner checks, and a privacy/consent process for location and contact data.

