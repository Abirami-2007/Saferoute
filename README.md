# SafeRoute

Safety-aware navigation web app (PWA). Combines Google Directions' alternate
routes with crowdsourced incident reports to recommend the route with the
best safety/time tradeoff, not just the fastest one.

## Structure

```
saferoute/
  backend/     Express + MongoDB API, safety scoring logic
  frontend/    React + Vite PWA, Leaflet map UI
```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# fill in MONGO_URI, JWT_SECRET, GOOGLE_MAPS_API_KEY
npm run dev
```

You need:
- A MongoDB instance (local or Atlas free tier)
- A free **OpenRouteService** API key: sign up at openrouteservice.org/dev,
  no credit card required, 2000 requests/day on the free tier

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173. On a phone, use "Add to Home Screen" from the
browser menu to install it as a PWA.

## How the safety scoring works

1. `POST /api/routes/safe` geocodes the origin/destination (via ORS's Pelias
   geocoder, skipped if you already pass `"lat,lng"`), then calls
   OpenRouteService Directions with `alternative_routes`, getting 2-3
   candidate routes.
2. Each route's polyline is decoded and sampled at ~20 evenly spaced points.
3. For each sample point:
   - We geo-query MongoDB (`Incident` collection, 2dsphere index) for
     crowdsourced reports within 150m.
   - We check OSM lighting data (fetched once per route via the Overpass
     API — street lamp nodes and ways explicitly tagged `lit=yes/no`) for
     lamps or lit ways within 80m.
4. Each nearby incident contributes to risk, weighted by category
   (harassment/incident > isolation > poor lighting) and severity (1-5).
   Nearby lighting nudges risk down; an explicitly unlit stretch nudges it
   up. Missing OSM data is treated as neutral, not risky. The whole thing is
   multiplied up at night, down during the day.
5. Routes are ranked by risk score. The safest route is recommended unless it
   adds more than 50% extra travel time over the fastest option — in that case
   both are shown so the user decides.

See `backend/utils/safetyScore.js` for the scoring logic, and
`backend/utils/osmLighting.js` for the Overpass integration — these two files
are the heart of the project and the best place to keep iterating.

## Known gaps / next steps

- **Incident data is empty until users report things.** The OSM lighting
  signal (`osmLighting.js`) partially offsets this cold-start problem, but
  OSM's `lit` tag coverage varies a lot by region — check how well-tagged
  your target city is before relying on it.
- **Overpass API is a shared public service with fair-use limits.** Fine for
  dev/demo use; for production traffic, self-host an Overpass instance or
  cache results more aggressively than the current "once per route" call.
- **ORS's free tier is 2000 requests/day.** Fine for a project/demo; a real
  deployment would need a paid tier or a self-hosted OSRM instance.
- **No background location tracking.** This is a web PWA; for "alert my
  contact if I go off-route with the screen locked," you'd need a native app
  (React Native, reusing this same logic) — see the stack discussion above.
- **SOS/live-location socket events exist server-side** (`server.js`) but
  there's no frontend UI wired to them yet — that's a good next feature.
- Auth routes exist but the frontend doesn't have login/register screens yet;
  incident reporting requires a logged-in user (`protect` middleware).
