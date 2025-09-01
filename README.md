# MTG_DeckBuilder

Static site + serverless endpoints for searching decks and commanders.

## Live locally
- Open `index.html` directly, or
- `python -m http.server 8000` → http://localhost:8000

## Deploy
- **GitHub Pages** for the static site.
- **Vercel** for serverless functions under `/api/*`.

## Endpoints
- `POST /api/archidekt-search` — search Archidekt decks by colors/formats.
- `GET  /api/archidekt-deck?id=12345` — fetch one Archidekt deck (optional).
- `POST /api/scryfall-search` — search Scryfall for cards (commander candidates).

## Notes
- Keep requests modest; cache where possible.
- No scraping. Scryfall API is public; Archidekt JSON endpoints are accessible but not formally documented.
