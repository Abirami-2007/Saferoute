import Incident from "../models/Incident.js";
import { fetchAreaSignals, areaRiskForPoint } from "./chennaiSafetySignals.js";

/**
 * Decodes a Google polyline into an array of [lat, lng] points.
 */
export function decodePolyline(encoded) {
  let points = [];
  let index = 0,
    lat = 0,
    lng = 0;

  while (index < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Reduces a dense polyline down to N evenly spaced sample points,
 * since checking every single point against the DB is wasteful.
 */
function sampleRoutePoints(points, maxSamples = 20) {
  if (points.length <= maxSamples) return points;
  const step = Math.floor(points.length / maxSamples);
  const sampled = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
  return sampled;
}

function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

const SEVERITY_WEIGHT = {
  harassment: 3,
  unsafe_incident: 3,
  isolated_area: 2,
  poor_lighting: 1.5,
  positive_feedback: -1.5, // pulls the score down (safer)
};

const NIGHT_MULTIPLIER = {
  morning: 0.6,
  afternoon: 0.6,
  evening: 1,
  night: 1.5,
};

const SEARCH_RADIUS_METERS = 150;

/**
 * Scores a single route by checking each sampled point against nearby
 * incident reports AND OSM-derived area signals (police proximity, activity
 * density, road classification, and lighting as a minor secondary signal).
 * Returns a normalized risk score (0 = safest, higher = riskier) plus
 * breakdown counts for transparency in the UI.
 */
export async function scoreRoute(encodedPolyline, travelTime = new Date()) {
  const allPoints = decodePolyline(encodedPolyline);
  const samples = sampleRoutePoints(allPoints);
  const timeOfDay = getTimeOfDay(travelTime);
  const timeMultiplier = NIGHT_MULTIPLIER[timeOfDay];

  // One Overpass call per route (not per point) to stay within fair-use limits.
  const areaSignals = await fetchAreaSignals(samples);

  let totalRisk = 0;
  let incidentCount = 0;
  let unlitPointCount = 0;
  let isolatedPointCount = 0;
  let policeNearbyCount = 0;
  const flaggedSegments = [];

  for (const [lat, lng] of samples) {
    const nearbyIncidents = await Incident.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: SEARCH_RADIUS_METERS,
        },
      },
    }).limit(20);

    let pointRisk = 0;
    for (const incident of nearbyIncidents) {
      const weight = SEVERITY_WEIGHT[incident.category] ?? 1;
      // Incidents reported at a similar time of day are more relevant.
      const relevance = incident.timeOfDay === timeOfDay ? 1.3 : 1;
      pointRisk += weight * incident.severity * relevance;
      incidentCount++;
    }

    const { risk: areaRisk, flags } = areaRiskForPoint([lat, lng], areaSignals);
    if (flags.unlit) unlitPointCount++;
    if (flags.isolated) isolatedPointCount++;
    if (flags.hasPolice) policeNearbyCount++;
    pointRisk += areaRisk;

    // Everything matters more after dark: reported incidents, isolation,
    // and lack of lighting are all riskier at night than at noon.
    pointRisk *= timeMultiplier;
    totalRisk += pointRisk;

    if (pointRisk > 5) {
      flaggedSegments.push({ lat, lng, risk: Number(pointRisk.toFixed(1)) });
    }
  }

  // Normalize by number of samples so longer routes aren't unfairly penalized
  // just for having more points checked.
  const normalizedRisk = samples.length ? totalRisk / samples.length : 0;

  return {
    riskScore: Number(normalizedRisk.toFixed(2)),
    incidentCount,
    unlitPointCount,
    isolatedPointCount,
    policeNearbyCount,
    flaggedSegments,
    timeOfDay,
  };
}

/**
 * Given multiple candidate routes — already normalized to
 * { summary, distanceText, durationText, durationSeconds, polyline } —
 * scores each and returns them ranked safest-first, along with a
 * recommended pick that balances safety against extra travel time.
 */
export async function rankRoutes(routes, travelTime = new Date()) {
  const scored = await Promise.all(
    routes.map(async (route) => {
      const safety = await scoreRoute(route.polyline, travelTime);
      return { ...route, ...safety };
    })
  );

  // Sort by risk first (ascending = safer first)
  scored.sort((a, b) => a.riskScore - b.riskScore);

  const fastest = [...scored].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  const safest = scored[0];

  // Recommend the safest route unless it adds more than ~50% extra time
  // over the fastest option, in which case flag both and let the user decide.
  const extraTimeRatio = safest.durationSeconds / fastest.durationSeconds;
  const recommended = extraTimeRatio <= 1.5 ? safest : fastest;

  return {
    routes: scored,
    recommended,
    safest,
    fastest,
    tradeoffWarning: extraTimeRatio > 1.5,
  };
}
