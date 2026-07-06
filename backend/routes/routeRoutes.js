import express from "express";
import axios from "axios";
import { rankRoutes } from "../utils/safetyScore.js";
import { geocode } from "../utils/geocode.js";

const router = express.Router();

const ORS_BASE = "https://api.openrouteservice.org";

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

// POST /api/routes/safe
// body: { origin, destination, departureTime?, profile? }
// origin/destination can be "lat,lng" or a free-text address/place name.
// profile defaults to walking, since that's the scenario this app targets;
// pass "driving-car" or "cycling-regular" to switch.
router.post("/safe", async (req, res) => {
  try {
    const { origin, destination, departureTime, profile = "foot-walking" } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ message: "origin and destination are required" });
    }

    const [originCoord, destCoord] = await Promise.all([geocode(origin), geocode(destination)]);

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

    const normalizedRoutes = data.routes.map((route, idx) => ({
      summary: `Route ${idx + 1}`,
      distanceText: metersToDistanceText(route.summary.distance),
      durationText: secondsToDurationText(route.summary.duration),
      durationSeconds: route.summary.duration,
      // ORS's default (non-geojson) response encodes geometry as a
      // Google-compatible polyline, so our existing decoder works as-is.
      polyline: route.geometry,
    }));

    const travelTime = departureTime ? new Date(departureTime) : new Date();
    const result = await rankRoutes(normalizedRoutes, travelTime);

    res.json(result);
  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(500).json({ message: "Failed to fetch safe routes", detail });
  }
});

export default router;
