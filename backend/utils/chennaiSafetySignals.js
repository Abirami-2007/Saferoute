import axios from "axios";

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

const EMPTY_SIGNALS = {
  police: [],
  activity: [],
  lamps: [],
  litWays: [],
  unlitWays: [],
  busyRoads: [],
  quietRoads: [],
};

/**
 * Queries Overpass once per route for several safety-relevant OSM layers,
 * scoped to work well for Chennai specifically.
 *
 * OSM's lit=* tag is sparsely and inconsistently applied in Chennai — roads
 * here are tagged by bus-route coverage, not lighting — so lighting is kept
 * as a minor secondary signal below. The primary signals are ones OSM
 * actually has decent coverage for in Chennai: police stations, shop/food
 * POI density (a footfall/activity proxy), and road classification
 * (busy arterial vs quiet residential/living_street).
 */
export async function fetchAreaSignals(points) {
  const { south, west, north, east } = bboxFromPoints(points);
  const bbox = `${south},${west},${north},${east}`;

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="police"](${bbox});
      way["amenity"="police"](${bbox});
      node["shop"](${bbox});
      node["amenity"~"^(restaurant|cafe|fast_food|pharmacy)$"](${bbox});
      node["highway"="street_lamp"](${bbox});
      way["lit"](${bbox});
      way["highway"~"^(trunk|primary|secondary)$"](${bbox});
      way["highway"~"^(living_street|residential|unclassified|track)$"](${bbox});
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

    const signals = {
      police: [],
      activity: [],
      lamps: [],
      litWays: [],
      unlitWays: [],
      busyRoads: [],
      quietRoads: [],
    };

    for (const el of data.elements) {
      const coord =
        el.type === "node"
          ? [el.lat, el.lon]
          : el.center
          ? [el.center.lat, el.center.lon]
          : null;
      if (!coord) continue;

      const tags = el.tags || {};

      if (tags.amenity === "police") {
        signals.police.push(coord);
      } else if (tags.shop || ["restaurant", "cafe", "fast_food", "pharmacy"].includes(tags.amenity)) {
        signals.activity.push(coord);
      } else if (tags.highway === "street_lamp") {
        signals.lamps.push(coord);
      } else if (tags.lit === "yes") {
        signals.litWays.push(coord);
      } else if (tags.lit) {
        signals.unlitWays.push(coord);
      } else if (["trunk", "primary", "secondary"].includes(tags.highway)) {
        signals.busyRoads.push(coord);
      } else if (["living_street", "residential", "unclassified", "track"].includes(tags.highway)) {
        signals.quietRoads.push(coord);
      }
    }

    return signals;
  } catch (err) {
    console.error("Overpass query failed, skipping area signals:", err.message);
    // Fail soft — if Overpass is slow or unreachable, scoring proceeds
    // without these signals instead of breaking the request.
    return EMPTY_SIGNALS;
  }
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
