# inputs/

Drop your raw trip material here — nothing else in this folder is committed to git (see `.gitignore`), only this file.

What to put here:

- Forwarded confirmation emails, saved as `.eml` or pasted into `.txt` files
- Booking PDFs (flights, hotels, rental cars, tours)
- Itinerary notes, screenshots, or a rough day-by-day plan you typed up yourself
- Photos you want used as stay/background images

Then open this repo in a coding agent (Claude Code, Cursor, etc.) and point it at **[AGENTS.md](../AGENTS.md)** in the repo root — it has a ready-to-paste prompt that reads everything in this folder and turns it into `data/trip.json`.

Nothing in this folder needs to be tidy. Forward the confirmation emails as-is; the agent's job is to extract the useful fields.
