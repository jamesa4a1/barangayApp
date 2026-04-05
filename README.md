# Barangay San Isidro PWA

Offline-first Progressive Web App for Barangay San Isidro, Bohol.

## Features

- Welcome-first landing page with intro and about sections
- Professional sign-in and sign-up modal flow
- Role-based actor access (Resident, Secretary, Admin, Tanod, Captain)
- Local incident reporting with optional image evidence and GPS
- Offline directory search and filtering
- Background sync with retry handling

## Tech Stack

- HTML
- Tailwind CSS
- Vanilla JavaScript
- IndexedDB

## Project Structure

- `styles.css` - Custom visual theme and glassmorphism effects
- `app.js` - UI logic, IndexedDB integration, manual/automatic sync
- `sw.js` - Offline caching and background sync worker
- `manifest.webmanifest` - PWA manifest
- `assets/icons/` - PWA icons

## Run Locally

Because Service Workers require an HTTP context, run with a local server (not `file://`).

Install and run:

```bash
npm install
npm run start
```

## Welcome Sign-In and Sign-Up

On first load, the app opens on the welcome page and prompts for sign-in.

- `Sign In`: Use an existing actor account
- `Sign Up`: Register a new actor account locally for demo/testing

Starter actor accounts are automatically seeded on first run:

- `resident@sanisidro.local` / `Resident123!`
- `secretary@sanisidro.local` / `Secretary123!`
- `admin@sanisidro.local` / `Admin123!`
- `tanod@sanisidro.local` / `Tanod123!`
- `captain@sanisidro.local` / `Captain123!`

Note: This is a local demo authentication flow. Replace with real secure authentication in production.

Then open:

```text
http://localhost:8080
```

## Run Verifier Backend

Install backend dependencies:

```bash
npm run server:install
```

Create a server environment file from [server/.env.example](server/.env.example) and set at least:

- `SIGNING_SECRET` only if you enable `SIGNING_REQUIRED=true`
- `SYNC_AUTH_MODE` and `SYNC_AUTH_SECRET` only if you enable auth
- `SQLITE_DB_PATH` for persistent storage location (default: `./data/incidents.db`)

Start verifier backend:

```bash
npm run server:start
```

Backend default URL:

```text
http://localhost:4000/api/incidents
```

Backend persistence:

- Incidents are stored in SQLite (file-backed) instead of memory.
- Default DB file: `server/data/incidents.db`
- Duplicate local submissions are handled safely using `localId` uniqueness.
- Frontend sync defaults to `http://localhost:4000/api/incidents` with `authMode=none` for local development.

Optional helper to run backend and frontend together:

```bash
npm run dev:all
```

## Sync Behavior

- Local development now syncs to `http://localhost:4000/api/incidents` by default.
- Sync config is persisted in IndexedDB and shared with the Service Worker.
- For production, set a secure HTTPS endpoint and enable auth/signing as needed.

## Incident Monitor

- Admin, Secretary, and Captain roles can access `Incident Monitor` in the dashboard.
- The monitor loads incidents already persisted on the backend and supports text + severity filtering.

## Expected API Contract

- Method: `POST`
- Content-Type: `multipart/form-data`
- Fields:
  - `description` (text)
  - `createdAt` (ISO datetime)
  - `image` (file, optional)
- Optional response fields for remote ID mapping:
  - `id`
  - `incidentId`
  - `data.id`

The included backend in [server/index.js](server/index.js) implements this contract, verifies signed requests, and persists incidents in SQLite.

If sync fails, the report remains in the local outbox and retries automatically through Background Sync.

## HMAC Request Signing

When enabled, each upload sends additional headers:

- `x-signature-version: v1`
- Signature header (default `x-signature`)
- Timestamp header (default `x-signature-timestamp`)
- Nonce header (default `x-signature-nonce`)

Signature algorithm:

- `HMAC-SHA256`
- Base64 output
- Canonical payload includes: `localId`, `description`, `createdAt`, image metadata (`present`, `size`, `type`), plus request `timestamp` and `nonce`.

Backend should verify:

- Timestamp freshness window (e.g. 5 minutes)
- Nonce uniqueness (anti-replay)
- Recomputed HMAC matches provided signature

## Retry Backoff Strategy

- On each failed sync attempt, retry delay grows exponentially: 1, 2, 4, 8 ... up to 60 minutes.
- Each report stores `syncAttempts`, `lastError`, and `nextRetryAt` locally for operator visibility.
- Manual sync respects retry windows to avoid repeated server hammering.

## Deploy Over HTTPS

PWA installability and Background Sync require secure contexts in production.

Recommended static hosts:

- GitHub Pages
- Netlify
- Vercel

All three provide HTTPS by default. After deployment, open the app once online so the Service Worker can install and cache assets.

Deployment config files included in this project:

- `netlify.toml` for Netlify publish/headers/SPA fallback
- `vercel.json` for Vercel rewrites and PWA-friendly headers

## Production Notes

- Add auth/token headers for protected APIs.
- Add server-side image validation and storage policies.
- Replace SVG icons with PNG if your target install flow requires PNG-only icons.
