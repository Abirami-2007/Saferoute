import express from "express";
import axios from "axios";
import { rankRoutes } from "../utils/safetyScore.js";
import { geocode } from "../utils/geocode.js";
import { getCached, setCached } from "../utils/cache.js";
import { CHENNAI_BBOX } from "../utils/chennaiBounds.js";

const router = express.Router();

const ORS_BASE = "https://api.openrouteservice.org";
const DIRECTIONS_TTL_SECONDS = 60 * 60 * 6; // 6 hours
const AUTOCOMPLETE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const VALID_PROFILES = ["foot-walking", "driving-car", "cycling-regular"];

function metersToDistanceText(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function secondsToDurationText(s) {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs} hr${rem ? ` ${rem} min` : ""}`;
}

function roundCoord([lng, lat]) {
  return `${lng.toFixed(4)},${lat.toFixed(4)}`;
}

// GET /api/routes/autocomplete?text=...
// Powers the frontend's type-ahead location search. Returns exact
// coordinates per suggestion, so once the user picks one, no further
// geocoding/guessing happens for that location — this is what actually
// fixes both the "wrong route" and "no suggestions for a typo" problems,
// since the suggestions themselves are the correction mechanism.
router.get("/autocomplete", async (req, res) => {
  try {
    const { text } = req.query;
    if (!text || text.trim().length < 3) {
      return res.json({ suggestions: [] });
    }

    const cacheKey = `autocomplete:${text.trim().toLowerCase()}`;
    const cached = await getCached(cacheKey);
    if (cached) return res.json({ suggestions: cached });

    const { data } = await axios.get(`${ORS_BASE}/geocode/autocomplete`, {
      params: {
        api_key: process.env.ORS_API_KEY,
        text,
        size: 6,
        "boundary.rect.min_lon": CHENNAI_BBOX.west,
        "boundary.rect.min_lat": CHENNAI_BBOX.south,
        "boundary.rect.max_lon": CHENNAI_BBOX.east,
        "boundary.rect.max_lat": CHENNAI_BBOX.north,
      },
    });

    const suggestions = data.features.map((f) => ({
      label: f.properties.label,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));

    await setCached(cacheKey, "autocomplete", suggestions, AUTOCOMPLETE_TTL_SECONDS);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ message: "Autocomplete failed", detail: err.response?.data || err.message });
  }
});

// POST /api/routes/safe
// body: { origin, destination, departureTime?, profile? }
// origin/destination should be "lat,lng" (from an autocomplete selection)
// but free text still works as a fallback via geocode().
// profile: "foot-walking" (default), "driving-car", or "cycling-regular".
router.post("/safe", async (req, res) => {
  try {
    const { origin, destination, departureTime } = req.body;
    let { profile = "foot-walking" } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ message: "origin and destination are required" });
    }
    if (!VALID_PROFILES.includes(profile)) {
      profile = "foot-walking"; // silently fall back rather than error on a bad value
    }

    const [originCoord, destCoord] = await Promise.all([geocode(origin), geocode(destination)]);

    const directionsCacheKey = `directions:${profile}:${roundCoord(originCoord)}:${roundCoord(destCoord)}`;
    let normalizedRoutes = await getCached(directionsCacheKey);

    if (!normalizedRoutes) {
      const { data } = await axios.post(
        `${ORS_BASE}/v2/directions/${profile}`,
        {
          coordinates: [originCoord, destCoord],
          // Asks ORS for up to 3 meaningfully different alternatives, not
          // just minor variations of the same road.
          alternative_routes: { target_count: 3, weight_factor: 1.4, share_factor: 0.6 },
          instructions: false,
        },
        {
          headers: {
            Authorization: process.env.ORS_API_KEY,
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );

      normalizedRoutes = data.routes.map((route, idx) => ({
        summary: `Route ${idx + 1}`,
        distanceText: metersToDistanceText(route.summary.distance),
        durationText: secondsToDurationText(route.summary.duration),
        durationSeconds: route.summary.duration,
        polyline: route.geometry,
      }));

      await setCached(directionsCacheKey, "directions", normalizedRoutes, DIRECTIONS_TTL_SECONDS);
    }

    const travelTime = departureTime ? new Date(departureTime) : new Date();
    const result = await rankRoutes(normalizedRoutes, travelTime);

    res.json(result);
  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(500).json({ message: err.message || "Failed to fetch safe routes", detail });
  }
});

export default router;
