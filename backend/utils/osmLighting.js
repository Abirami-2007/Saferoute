import axios from "axios";
// NOTE: fetchLightingData/lightingRiskForPoint below are no longer called
// at request time (see safetyScore.js, which now reads precomputed scores
// from the SafetySegment collection instead). haversineMeters is still used
// by scripts/buildSafetyGrid.js. The other two functions are kept here for
// reference / in case you want a live fallback for areas outside your
// precomputed grid, but they are currently unused in the live request path.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bboxFromPoints(points, paddingDeg = 0.004) {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return {
    south: Math.min(...lats) - paddingDeg,
    north: Math.max(...lats) + paddingDeg,
    west: Math.min(...lngs) - paddingDeg,
    east: Math.max(...lngs) + paddingDeg,
  };
}

/**
 * Queries Overpass once per route (not per point, to stay within Overpass's
 * fair-use limits) for street lamp nodes and any way explicitly tagged
 * lit=yes/no within the route's bounding box.
 */
export async function fetchLightingData(points) {
  const { south, west, north, east } = bboxFromPoints(points);
  const query = `
    [out:json][timeout:25];
    (
      node["highway"="street_lamp"](${south},${west},${north},${east});
      way["lit"](${south},${west},${north},${east});
    );
    out center;
  `;

  try {
    const { data } = await axios.post(
      OVERPASS_URL,
      `data=${encodeURIComponent(query)}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
      }
    );

    const lamps = [];
    const litWays = [];
    const unlitWays = [];

    for (const el of data.elements) {
      if (el.type === "node") {
        lamps.push([el.lat, el.lon]);
      } else if (el.type === "way" && el.center) {
        const isLit = el.tags?.lit === "yes";
        (isLit ? litWays : unlitWays).push([el.center.lat, el.center.lon]);
      }
    }
    return { lamps, litWays, unlitWays };
  } catch (err) {
    console.error("Overpass query failed, skipping lighting signal:", err.message);
    // Fail soft — if OSM/Overpass is slow or unreachable, scoring just
    // proceeds without the lighting signal instead of breaking the request.
    return { lamps: [], litWays: [], unlitWays: [] };
  }
}

/**
 * Returns a risk contribution for a single point based on nearby OSM
 * lighting data: negative (safer) if a lamp or explicitly-lit way is
 * close by, positive (riskier) if the nearest tagged way is explicitly
 * unlit and nothing else nearby helps. Zero (neutral) if OSM simply has
 * no lighting data for the area — absence of data isn't evidence of risk.
 */
export function lightingRiskForPoint(point, lightingData, radiusMeters = 80) {
  const { lamps, litWays, unlitWays } = lightingData;

  const hasNearbyLamp = lamps.some((l) => haversineMeters(point, l) <= radiusMeters);
  const hasNearbyLitWay = litWays.some((w) => haversineMeters(point, w) <= radiusMeters);
  const hasNearbyUnlitWay = unlitWays.some(
    (w) => haversineMeters(point, w) <= radiusMeters * 1.5
  );

  if (hasNearbyLamp || hasNearbyLitWay) return -0.5;
  if (hasNearbyUnlitWay) return 1.5;
  return 0;
}
