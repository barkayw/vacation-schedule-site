# Vacation Schedule Site

A password-protected, single-page trip itinerary site: destinations, day-by-day plans, flights, lodging, rental car, and booked activities — all driven by one JSON file. No framework, no database, deploys as static files.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/NiranEC77/vacation-schedule-site)

This repo ships with a fictional worked example — the Rivera Family's 8 days in Lisbon & the Algarve — so it runs and looks right immediately. Replace it with your own trip in one of two ways:

## Option A — Hand it to a coding agent

1. Drop your forwarded confirmation emails, booking PDFs, and itinerary notes into `inputs/`.
2. Open the repo in a coding agent (Claude Code, Cursor, etc.) and run `/fill-trip`, or paste the prompt from [`AGENTS.md`](./AGENTS.md).
3. The agent extracts every trip fact it can find and writes `data/trip.json`, following `schema/trip.schema.json`. It flags anything missing or ambiguous instead of guessing.

## Option B — Edit the config by hand

Open [`data/trip.json`](./data/trip.json) and replace the example trip, field by field, against [`schema/trip.schema.json`](./schema/trip.schema.json). The example is a complete worked reference — every field the schema supports is used somewhere in it.

## Quickstart

```
npm install
cp .env.example .env        # then set SITE_PASSWORD
npm run validate            # check data/trip.json against the schema
npm run dev                 # http://localhost:4000
```

If `SITE_PASSWORD` is unset, the build falls back to the demo password `demo` so the template still runs out of the box.

## Project structure

```
data/trip.json          Single source of truth for the trip — edit this
schema/trip.schema.json JSON Schema data/trip.json is validated against
inputs/                 Drop raw travel docs here for an agent to read (gitignored)
AGENTS.md                Agent prompt + field-mapping guide for populating the trip
index.html               Static page shell (password screen + mount points)
css/style.css             All styling — colors/background are theme-able via meta.theme
js/render.js              Pure functions: trip data → HTML for each section
js/app.js                 Bootstraps auth, fetches data/trip.json, wires interactivity
scripts/build.js          Validates data, hashes SITE_PASSWORD, templates the <head>
scripts/validate.js       Schema validation, also runnable standalone
scripts/serve.js          Zero-dependency static file server for local dev
images/                   Background + lodging photos referenced from trip.json
```

## How the password works

The site is gated by a password screen, not real authentication — anyone with the password (or who reads the client-side JS) can view it. `npm run build` reads `SITE_PASSWORD` from the environment and writes only its SHA-256 hash into `generated/site-config.js` (gitignored, regenerated every build); the page hashes what the visitor types and compares hashes, so the plaintext password is never committed or shipped in a readable form. This is meant to keep a trip page out of search engines and casual link-sharing, not to protect genuinely sensitive information.

## Deploying

Deploys as a static site — no server required. On Vercel:

1. Click the "Deploy with Vercel" button above, or import the repo manually.
2. Set the `SITE_PASSWORD` environment variable in the Vercel project settings.
3. Vercel runs `npm run build` (see `vercel.json`) before serving, which regenerates the password hash and templates the page `<head>` from `data/trip.json`.

The included `.github/workflows/deploy.yml` also deploys to Vercel on push to `main`, using the standard `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` repo secrets.

## Stack notes

Plain HTML/CSS/vanilla JS (ES modules), no bundler, no framework, no runtime dependencies. Trip data loads client-side via `fetch('data/trip.json')`. The only build-time step is `scripts/build.js`, which exists solely to keep the password out of git and template the page `<head>` (title/description/favicon) from the trip config — the page itself doesn't need a build step to run; `npm run dev` runs the build once and then serves the files as-is.

The map uses [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles, loaded from a CDN. Fonts are Google Fonts, also CDN-loaded. No analytics, no tracking.

## License

MIT — see [LICENSE](./LICENSE).
