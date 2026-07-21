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

### 1\. Backend

```bash
cd backend
npm install
cp .env.example .env
# fill in MONGO\\\_URI, JWT\\\_SECRET, GOOGLE\\\_MAPS\\\_API\\\_KEY
npm run dev
```

You need:

* A MongoDB instance (local or Atlas free tier)
* A free **OpenRouteService** API key: sign up at openrouteservice.org/dev,
no credit card required, 2000 requests/day on the free tier

### 2\. Frontend

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
OpenRouteService Directions with `alternative\\\_routes`, getting 2-3
candidate routes.
2. Each route's polyline is decoded and sampled at \~20 evenly spaced points.
3. For each sample point:

   * We geo-query MongoDB (`Incident` collection, 2dsphere index) for
crowdsourced reports within 150m.
   * We check OSM-derived area signals (fetched once per route via the
Overpass API, see `backend/utils/chennaiSafetySignals.js`):

     * **Police stations** within 300m — strongest safety signal, pulls risk down
     * **Activity density** (shops, restaurants, pharmacies) within 150m —
a footfall/"people around" proxy, pulls risk down
     * **Road classification** — a quiet residential/`living\\\_street` stretch
with no busy road and no activity nearby reads as isolated, pulls risk up
     * **Lighting** (`lit=\\\*` tags, street lamp nodes) — kept as a *minor*
secondary nudge rather than a primary signal, since OSM's lighting
tags are sparsely and inconsistently applied in Chennai (roads here
are tagged by bus-route coverage, not lighting)
4. Each nearby incident contributes to risk, weighted by category
(harassment/incident > isolation > poor lighting) and severity (1-5).
The whole per-point risk is multiplied up at night, down during the day.
5. Routes are ranked by risk score. The safest route is recommended unless it
adds more than 50% extra travel time over the fastest option — in that case
both are shown so the user decides.

See `backend/utils/safetyScore.js` for the scoring logic, and
`backend/utils/chennaiSafetySignals.js` for the Overpass integration — these
two files are the heart of the project and the best place to keep iterating.

**Why police/activity/road-type instead of just lighting:** OSM's `lit=\\\*`
tag has poor, inconsistent coverage in Chennai specifically. Police stations
and shop/food POIs are tagged far more reliably there, so they're used as
the primary signals; lighting is kept as a small bonus rather than load-bearing.

## OSM safety data: manually imported, not live-fetched

Area signals (police stations, shops, roads, lighting) are **not** fetched
from Overpass or any external OSM API while serving a request. Instead,
they're imported once into your own MongoDB collection (`OsmFeature`) and
queried locally — a normal indexed `$geoWithin` query, same as the
`Incident` collection.

### Getting the OSM data

1. Go to **overpass-turbo.eu** in your browser (this is a one-time manual
step you do yourself, not something the app calls at runtime).
2. Paste this query (already scoped to the Chennai metro area — adjust the
bounding box if you need a different region):

```
   \\\[out:json]\\\[timeout:60];
   (
     node\\\["amenity"="police"](12.83,80.10,13.25,80.33);
     way\\\["amenity"="police"](12.83,80.10,13.25,80.33);
     node\\\["shop"](12.83,80.10,13.25,80.33);
     node\\\["amenity"\\\~"^(restaurant|cafe|fast\\\_food|pharmacy)$"](12.83,80.10,13.25,80.33);
     node\\\["highway"="street\\\_lamp"](12.83,80.10,13.25,80.33);
     way\\\["lit"](12.83,80.10,13.25,80.33);
     way\\\["highway"\\\~"^(trunk|primary|secondary)$"](12.83,80.10,13.25,80.33);
     way\\\["highway"\\\~"^(living\\\_street|residential|unclassified|track)$"](12.83,80.10,13.25,80.33);
   );
   out center;
   ```

3. Click **Run**, then **Export** → **download as GeoJSON**.
4. Save the file as `backend/data/chennai-safety-features.geojson` (create
the `data/` folder if it doesn't exist).

### Importing it into MongoDB

```bash
cd backend
npm run seed:osm
# or, if you saved the file somewhere else:
npm run seed:osm -- path/to/your-file.geojson
```

This clears and repopulates the `OsmFeature` collection and prints a
breakdown of how many features landed in each category. Re-run it any time
you want to refresh the data (e.g. a newer Overpass Turbo export) — it's
safe to run repeatedly.

**Note on file size**: the Chennai metro bounding box above will return a
meaningful number of shops/roads — likely a few thousand features, a few MB
as GeoJSON. That's fine for MongoDB and fine to keep out of git (see
`.gitignore` — the `data/` folder is ignored by default so you don't commit
a multi-MB file; each developer runs the export/import once locally).

`fetchAreaSignals()` in `backend/utils/chennaiSafetySignals.js` now does a
single local `$geoWithin` query per route instead of a network call —
faster, no rate limits, and works fully offline once imported.

## API usage optimization (caching architecture)

Two external calls happen per route search — ORS geocoding and ORS
directions — and both are cached to avoid burning through the free quota on
repeat/nearby requests. See `backend/utils/cache.js` and `backend/models/Cache.js`.

**Two-tier cache**: an in-process `Map` (fastest, but wiped on server
restart) sits in front of a MongoDB collection with a TTL index (persists
across restarts, shared if you ever run multiple server instances). A cache
miss checks memory, then Mongo, then finally calls the external API and
backfills both tiers.

|What's cached|Where|TTL|Why this TTL|
|-|-|-|-|
|Geocode results (address → coords)|`utils/geocode.js`|90 days|Addresses essentially never move|
|ORS directions (route geometry)|`routes/routeRoutes.js`|6 hours|Route shape/duration barely changes hour to hour; re-searches of the same trip are common and now free|

**OSM area signals (police/activity/roads/lighting) aren't in this table**
because they're no longer an external call at all — see the section above.
They're a local MongoDB query against data imported once via `npm run seed:osm`, so there's nothing to rate-limit or cache; it's as fast and free
as any other database read.

**What's deliberately NOT cached**: incident-based risk scoring itself. Route
*geometry* is cached, but `rankRoutes()` still recomputes the actual risk
score fresh on every request — because it depends on the current time of day
and the latest crowdsourced reports, both of which change independently of
the route shape.

MongoDB incident queries were also collapsed from up to 20 `$near` calls per
route (one per sampled point) down to a single `$geoWithin` bounding-box
query, with precise distance filtering done in memory afterward.

## SOS \& live location sharing

Real-time alerts run over Socket.io, authenticated with the same JWT as the
REST API (`socket.handshake.auth.token`, verified in `server.js`). A few
design decisions worth knowing:

* **Identity comes from the verified token, not the client payload.** The
original stub let the client say "I am user X, alert contacts Y and Z" —
which meant anyone could spam SOS alerts to arbitrary users. Now the
server verifies who's connected and looks up their real emergency
contacts from MongoDB itself.
* **Contacts must be linked to a registered account to get real-time
alerts.** `User.emergencyContacts` can hold a name/phone for display even
if the contact hasn't signed up, but only entries with a resolved
`contactUserId` (matched by email on `POST /api/users/me/contacts`) can
actually receive a live Socket.io event — a phone number alone has no
socket to deliver to. See `pages/ContactsPage.jsx`.
* **SOS requires a press-and-hold**, not a tap, to avoid accidental triggers
(`components/SOSButton.jsx`, 1.2s hold).
* **Live location sharing is throttled** to one emit per 10 seconds even if
the browser's GPS reports faster, and stops automatically if the socket
disconnects rather than silently going stale (`components/LiveLocationToggle.jsx`).
* **Route search itself stays public** (no login required) — only SOS,
live-location sharing, and managing contacts require an account.

**Known limitation:** this only reaches contacts who are also logged into
the app in a browser tab at that moment (Socket.io requires an open
connection). A production version would need push notifications (web push
for the PWA) or SMS fallback (e.g. Twilio) for contacts who aren't actively
using the app — right now, an emergency contact who's offline won't be
reached at all.

## Known gaps / next steps

* **Incident data is empty until users report things.** The OSM-derived
signals (police, activity density, road type) partially offset this, but
for a convincing demo you'll want to seed a few real `Incident` entries
along your actual demo routes.
* **OSM data goes stale until you re-run the import.** Since it's no longer
fetched live, a new police station or shop that opens after your Overpass
Turbo export won't show up until you re-export and re-run `npm run seed:osm`.
* **SOS/live-location only reaches contacts who are actively connected**
(browser tab open). No push notification or SMS fallback yet.
* **Incident-reporting still has no UI** — the API exists
(`POST /api/incidents`) but there's no form to submit a report yet.
* **The road-classification isolation heuristic is approximate.** It flags
quiet residential/`living\\\_street` stretches with no busy road or activity
nearby — this is a reasonable proxy, not ground truth.
* **ORS's free tier is 2000 requests/day.** Fine for a project/demo; a real
deployment would need a paid tier or a self-hosted OSRM instance. (This is
a separate service from the OSM data import above — ORS handles routing
and geocoding, not the police/shop/road safety signals.) This is a web PWA; for "alert my
contact if I go off-route with the screen locked," you'd need a native app
(React Native, reusing this same logic) — see the stack discussion above.
* **SOS/live-location socket events exist server-side** (`server.js`) but
there's no frontend UI wired to them yet — that's a good next feature.
* Auth routes exist but the frontend doesn't have login/register screens yet;
incident reporting requires a logged-in user (`protect` middleware).

