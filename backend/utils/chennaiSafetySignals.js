import OsmFeature from "../models/OsmFeature.js";

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

// Padding must comfortably exceed the largest radius checked in
// areaRiskForPoint() below (300m, for police) so we never miss a feature
// just outside the sample points' immediate bbox.
function paddedBbox(points, paddingDeg = 0.004) {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return {
    south: Math.min(...lats) - paddingDeg,
    north: Math.max(...lats) + paddingDeg,
    west: Math.min(...lngs) - paddingDeg,
    east: Math.max(...lngs) + paddingDeg,
  };
}

const CATEGORY_TO_SIGNAL_KEY = {
  police: "police",
  activity: "activity",
  lamp: "lamps",
  lit_way: "litWays",
  unlit_way: "unlitWays",
  busy_road: "busyRoads",
  quiet_road: "quietRoads",
};

/**
 * Reads safety-relevant OSM features (police, shops, roads, lighting) for a
 * route's bounding box — from our own MongoDB collection, populated once via
 * `npm run seed:osm` (see scripts/importOsmData.js). No external API call
 * happens here; this is a single indexed local query.
 *
 * OSM's lit=* tag is sparsely and inconsistently applied in Chennai — roads
 * here are tagged by bus-route coverage, not lighting — so lighting is kept
 * as a minor secondary signal below (see areaRiskForPoint). The primary
 * signals are ones OSM actually has decent coverage for in Chennai: police
 * stations, shop/food POI density (a footfall/activity proxy), and road
 * classification (busy arterial vs quiet residential/living_street).
 */
export async function fetchAreaSignals(points) {
  const bbox = paddedBbox(points);

  const features = await OsmFeature.find({
    location: {
      $geoWithin: {
        $box: [
          [bbox.west, bbox.south],
          [bbox.east, bbox.north],
        ],
      },
    },
  }).lean();

  const signals = {
    police: [],
    activity: [],
    lamps: [],
    litWays: [],
    unlitWays: [],
    busyRoads: [],
    quietRoads: [],
  };

  for (const feature of features) {
    const key = CATEGORY_TO_SIGNAL_KEY[feature.category];
    if (!key) continue;
    const [lng, lat] = feature.location.coordinates;
    signals[key].push([lat, lng]);
  }

  return signals;
}

/**
 * Returns a risk contribution for a single point plus flags describing
 * which signals fired, so the UI can show *why* a stretch was flagged.
 */
export function areaRiskForPoint(point, signals) {
  let risk = 0;
  const flags = { unlit: false, isolated: false, hasPolice: false, hasActivity: false };

  // Police presence — checked over a wider radius since a station 250m
  // away on a side street still matters. Strongest safety signal available.
  const hasPolice = signals.police.some((p) => haversineMeters(point, p) <= 300);
  if (hasPolice) {
    risk -= 1.5;
    flags.hasPolice = true;
  }

  // Activity density (shops, food, pharmacies) — a footfall/"people around" proxy.
  const nearbyActivity = signals.activity.filter((p) => haversineMeters(point, p) <= 150);
  if (nearbyActivity.length > 0) {
    risk -= Math.min(nearbyActivity.length * 0.3, 1.5);
    flags.hasActivity = true;
  }

  // Road classification — a quiet residential/living_street stretch with no
  // busy road and no activity nearby reads as more isolated.
  const hasBusyRoadNearby = signals.busyRoads.some((r) => haversineMeters(point, r) <= 150);
  const hasQuietRoadNearby = signals.quietRoads.some((r) => haversineMeters(point, r) <= 100);
  if (hasQuietRoadNearby && !hasBusyRoadNearby && !flags.hasActivity) {
    risk += 1;
    flags.isolated = true;
  }

  // Lighting — kept as a minor secondary nudge, not a primary driver, since
  // OSM's lit-tag coverage in Chennai is too sparse to trust on its own.
  const hasNearbyLamp = signals.lamps.some((l) => haversineMeters(point, l) <= 80);
  const hasNearbyLitWay = signals.litWays.some((w) => haversineMeters(point, w) <= 80);
  const hasNearbyUnlitWay = signals.unlitWays.some((w) => haversineMeters(point, w) <= 120);

  if (hasNearbyLamp || hasNearbyLitWay) {
    risk -= 0.3;
  } else if (hasNearbyUnlitWay) {
    risk += 0.5;
    flags.unlit = true;
  }

  return { risk, flags };
}
