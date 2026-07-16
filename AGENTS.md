# Agent Instructions: Populating This Trip Site

This repo is a template. It ships with a fictional worked example (`data/trip.json` — "Rivera Family, Lisbon & the Algarve") that shows the schema in use, and a background job for you: turn a folder of raw travel documents into a real trip.

## The prompt

Paste this to a coding agent (Claude Code, Cursor, etc.) with this repo open, after the user has dropped their confirmation emails, PDFs, and notes into `inputs/`:

> Read every file in `inputs/` — forwarded confirmation emails, booking PDFs, itinerary notes, screenshots, anything dropped there. Extract every trip fact you can find: travelers, dates, destinations, flights, rental car, lodging, day-by-day plans, and any booked tours or activities with their confirmation numbers.
>
> Populate `data/trip.json` from what you find, following `schema/trip.schema.json` exactly (see the field-mapping guide in this file for how raw email fields map to schema fields). Replace the fictional Rivera Family example data entirely — don't leave any of it mixed in.
>
> If any lodging or activity includes a listing photo, save it into `images/` and reference it from the corresponding `image` field. If the user provided a background image, do the same and set `meta.theme.backgroundImage`. If no images were provided, leave those fields out — don't invent placeholder photos.
>
> Set `site.title`, `site.description`, and `site.favicon` (a single emoji fitting the trip) based on the trip's destination and travelers.
>
> Run `npm run validate` and fix any schema errors before finishing.
>
> If something is missing or ambiguous — a confirmation number you can't find, a date that conflicts between two emails, an unclear traveler name — do NOT guess. Leave the field out (if optional) or use an obviously-fake placeholder marked `TODO` (if required), and list everything you skipped or guessed around in your final summary so the user can fill it in by hand.
>
> When done, run `npm run dev` and confirm the site loads with the new trip data.

## Field-mapping guide

Raw source → `data/trip.json` field:

| Found in source | Maps to |
|---|---|
| Trip name / how you refer to the vacation | `meta.tripName` |
| Family or group name | `meta.groupName` |
| Names of everyone traveling | `travelers[].name` (add `emoji` for a small icon, e.g. 🧔👩👦👧) |
| Departure/return dates | `meta.startDate`, `meta.endDate` |
| Home airport on the outbound ticket | `meta.homeBase` |
| Currency booking amounts are in | `meta.currency` |
| Each city/region you stay in, in order | one entry per leg in `destinations[]` |
| Lat/long for the map (look up the destination if not given) | `destinations[].coordinates` |
| Drive time between legs (from a note, or estimate from a map) | `destinations[].driveFromPrevious` |
| Flight confirmation email: airline, flight #, times, airports, confirmation code, class, baggage, price | `flights[]` (one entry per direction) |
| Rental car voucher: company, vehicle, confirmation #, pickup/dropoff, cost, deposit, driver name, contact phone | `car` |
| Airbnb/hotel confirmation: property name, host, confirmation #, phone, check-in/out, cost, address, listing URL, listing photo | `lodging[]` |
| Tour/activity booking: name, confirmation #, date/time, tickets, price breakdown, cancellation policy, meeting point | `activities[]` |
| Day-by-day plan (yours or drafted from the above) | `days[]` — each day references a `destinationId`; use `type: "event"` for single lines, `type: "drive"` for transit segments, `type: "venue"` for a place with its own card (link a venue to a booked activity via `activityId`) |
| Flight seat assignments | `travelers[].seats` |
| Any "what to expect weather-wise" note | `weather` |

Full field definitions, types, and validation rules live in `schema/trip.schema.json` — read it before writing `data/trip.json`, it's the source of truth for what's allowed.

## Handling missing data

- **Optional fields** (most of them — check `required` arrays in the schema): just omit if you don't have the information. The renderer skips absent fields and, for entire missing sections (no `car`, no `activities`, etc.), hides that nav link and section automatically.
- **Required fields you can't find** (e.g. `lodging[].checkIn`): use a clearly-fake placeholder like `"TBD"` so validation passes, and flag it in your summary — don't fabricate a plausible-looking date or number.
- **Conflicting information** between two sources (e.g. two different confirmation numbers for what looks like the same booking): pick the one from the more authoritative source (a confirmation email over a note), and flag the conflict in your summary.
- Never invent confirmation numbers, prices, or addresses. If you're not confident a value is correct, flag it rather than guess.

## After populating

```
npm install     # first time only
npm run validate
npm run dev      # http://localhost:4000
```

See `README.md` for the full quickstart and deploy instructions.
