---
description: Populate data/trip.json from the raw travel docs dropped in inputs/
---

Read every file in `inputs/` — forwarded confirmation emails, booking PDFs, itinerary notes, screenshots, anything dropped there. Extract every trip fact you can find: travelers, dates, destinations, flights, rental car, lodging, day-by-day plans, and any booked tours or activities with their confirmation numbers.

Populate `data/trip.json` from what you find, following `schema/trip.schema.json` exactly (see the field-mapping guide in `AGENTS.md` for how raw email fields map to schema fields). Replace the fictional Rivera Family example data entirely — don't leave any of it mixed in.

If any lodging or activity includes a listing photo, save it into `images/` and reference it from the corresponding `image` field. If the user provided a background image, do the same and set `meta.theme.backgroundImage`. If no images were provided, leave those fields out — don't invent placeholder photos.

Set `site.title`, `site.description`, and `site.favicon` (a single emoji fitting the trip) based on the trip's destination and travelers.

Run `npm run validate` and fix any schema errors before finishing.

If something is missing or ambiguous — a confirmation number you can't find, a date that conflicts between two emails, an unclear traveler name — do NOT guess. Leave the field out (if optional) or use an obviously-fake placeholder marked `TODO` (if required), and list everything you skipped or guessed around in your final summary so the user can fill it in by hand.

When done, run `npm run dev` and confirm the site loads with the new trip data.
