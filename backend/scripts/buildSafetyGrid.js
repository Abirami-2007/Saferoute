import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import SafetySegment from "../models/SafetySegment.js";
import { haversineMeters } from "../utils/osmLighting.js";

dotenv.config();

/**
 * Precomputes a static safety grid for ONE city, once, and stores it in
 * MongoDB. Run this offline (e.g. `npm run build:grid`), not per request.
 * Re-run it occasionally (monthly is plenty) to pick up OSM edits — road
 * safety data doesn't change minute to minute like live incident reports do.
 *
 * Set the city's bounding box via env vars before running:
 *   CITY_BBOX_SOUTH, CITY_BBOX_WEST, CITY_BBOX_NORTH, CITY_BBOX_EAST
 * Easiest way to get these: go to bboxfinder.com, draw a box around your
 * city, copy the 4 numbers (they come out as minLng,minLat,maxLng,maxLat —
 * map that to west,south,east,north).
 */

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

const BBOX = {
  south: parseFloat(process.env.CITY_BBOX_SOUTH),
  west: parseFloat(process.env.CITY_BBOX_WEST),
  north: parseFloat(process.env.CITY_BBOX_NORTH),
  east: parseFloat(process.env.CITY_BBOX_EAST),
};

const SEGMENT_LENGTH_METERS = 100; // chop each road into ~100m chunks
const POI_RADIUS_METERS = 100; // "nearby shop/amenity" radius, our foot-traffic proxy
const LAMP_RADIUS_METERS = 50; // "nearby streetlamp" radius

// Heuristic base risk by road type (0 = safest, higher = riskier).
// These are starting weights, not ground truth — tune them once you have
// user reports to compare against.
const ROAD_TYPE_RISK = {
  primary: 0.5,
  trunk: 0.6,
  secondary: 0.7,
  tertiary: 0.9,
  living_street: 0.8,
  pedestrian: 0.6,
  residential: 1.0,
  unclassified: 1.2,
  footway: 1.3,
  path: 1.8,
  track: 2.0,
  steps: 1.5,
};

async function overpassQuery(query) {
  const { data } = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
  });
  return data.elements;
}

function bboxStr() {
  return `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
}

async function fetchRoads() {
  const query = `[out:json][timeout:60];
  (
    way["highway"~"^(${Object.keys(ROAD_TYPE_RISK).join("|")})$"](${bboxStr()});
  );
  out geom;`;
  return overpassQuery(query);
}

async function fetchLamps() {
  const query = `[out:json][timeout:60];
  node["highway"="street_lamp"](${bboxStr()});
  out;`;
  return overpassQuery(query);
}

async function fetchPOIs() {
  const query = `[out:json][timeout:60];
  (
    node["amenity"](${bboxStr()});
    node["shop"](${bboxStr()});
  );
  out;`;
  return overpassQuery(query);
}

// Walks a way's node list and drops a segment marker every ~100m,
// carrying the way's highway/lit tags with it.
function splitWayIntoSegments(way) {
  if (!way.geometry || way.geometry.length < 2) return [];
  const coords = way.geometry.map((g) => [g.lat, g.lon]);
  const segments = [];
  let accDist = 0;

  for (let i = 1; i < coords.length; i++) {
    accDist += haversineMeters(coords[i - 1], coords[i]);
    if (accDist >= SEGMENT_LENGTH_METERS || i === coords.length - 1) {
      segments.push({
        point: coords[i],
        wayId: way.id,
        highway: way.tags?.highway,
        lit: way.tags?.lit,
      });
      accDist = 0;
    }
  }
  return segments;
}

function countNearby(point, list, radiusMeters) {
  let count = 0;
  for (const p of list) {
    if (haversineMeters(point, p) <= radiusMeters) count++;
  }
  return count;
}

async function run() {
  if (Object.values(BBOX).some((v) => Number.isNaN(v))) {
    console.error(
      "Missing bounding box. Set CITY_BBOX_SOUTH / CITY_BBOX_WEST / CITY_BBOX_NORTH / CITY_BBOX_EAST in .env first (see comment at the top of this file for how to get them)."
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB. Fetching OSM data for bbox ${bboxStr()}...`);

  const [roadElements, lampElements, poiElements] = await Promise.all([
    fetchRoads(),
    fetchLamps(),
    fetchPOIs(),
  ]);

  const lamps = lampElements.map((n) => [n.lat, n.lon]);
  const pois = poiElements.map((n) => [n.lat, n.lon]);
  console.log(
    `Got ${roadElements.length} road ways, ${lamps.length} streetlamps, ${pois.length} POIs.`
  );

  let allSegments = [];
  for (const way of roadElements) {
    allSegments.push(...splitWayIntoSegments(way));
  }
  console.log(`Split into ${allSegments.length} segments (~${SEGMENT_LENGTH_METERS}m each).`);

  console.log("Scoring segments (checking each against nearby lamps + POIs)...");
  const ops = allSegments.map((seg) => {
    const roadTypeRisk = ROAD_TYPE_RISK[seg.highway] ?? 1.0;
    const lampNearby = countNearby(seg.point, lamps, LAMP_RADIUS_METERS) > 0;
    const poiCount = countNearby(seg.point, pois, POI_RADIUS_METERS);
    const litTag = seg.lit === "yes" ? true : seg.lit === "no" ? false : null;

    let risk = roadTypeRisk;
    if (litTag === true || lampNearby) risk -= 1.0; // lit or a lamp nearby -> safer
    if (litTag === false) risk += 1.0; // explicitly tagged unlit -> riskier
    risk -= Math.min(poiCount, 5) * 0.2; // more nearby shops/amenities -> more foot traffic -> safer
    risk = Math.max(risk, 0);

    const coordinates = [seg.point[1], seg.point[0]]; // -> [lng, lat]

    return {
      updateOne: {
        filter: { wayId: seg.wayId, "location.coordinates": coordinates },
        update: {
          $set: {
            wayId: seg.wayId,
            highway: seg.highway,
            lit: litTag,
            lampNearby,
            poiCount,
            riskBase: Number(risk.toFixed(2)),
            location: { type: "Point", coordinates },
          },
        },
        upsert: true,
      },
    };
  });

  console.log(`Writing ${ops.length} segments to MongoDB...`);
  const BATCH = 1000;
  for (let i = 0; i < ops.length; i += BATCH) {
    await SafetySegment.bulkWrite(ops.slice(i, i + BATCH));
    console.log(`  ${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }

  console.log("Done. Re-run this script whenever you want to refresh OSM data (monthly is plenty).");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
