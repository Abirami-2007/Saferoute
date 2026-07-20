// One-time (or occasional) data import — run manually with:
//   npm run seed:osm -- path/to/chennai-safety-features.geojson
//
// This is NOT called during route scoring. It reads a GeoJSON file you've
// already downloaded (see README's "Getting the OSM data" section for how
// to export one from Overpass Turbo's web UI) and loads it into the
// OsmFeature collection, which is then queried locally at request time.

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import OsmFeature from "../models/OsmFeature.js";

dotenv.config();

const filePath = process.argv[2] || "./data/chennai-safety-features.geojson";

// Same categorization rules that used to run against live Overpass results —
// unchanged, just applied to a file instead of an API response.
function categorize(tags) {
  if (!tags) return null;
  if (tags.amenity === "police") return "police";
  if (tags.shop || ["restaurant", "cafe", "fast_food", "pharmacy"].includes(tags.amenity)) return "activity";
  if (tags.highway === "street_lamp") return "lamp";
  if (tags.lit === "yes") return "lit_way";
  if (tags.lit) return "unlit_way";
  if (["trunk", "primary", "secondary"].includes(tags.highway)) return "busy_road";
  if (["living_street", "residential", "unclassified", "track"].includes(tags.highway)) return "quiet_road";
  return null;
}

// Ways (roads, building outlines) come through as LineString/Polygon
// geometry rather than a single point — approximate with a centroid, the
// same simplification Overpass's `out center;` was doing for us before.
function centroidOf(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Point") return geometry.coordinates;

  const coords = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates;
  if (!coords || coords.length === 0) return null;

  const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  return [lng, lat];
}

async function run() {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    console.error('Export the Chennai data from Overpass Turbo first — see the README\'s "Getting the OSM data" section.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  // Accepts either a GeoJSON FeatureCollection (Overpass Turbo's "export as
  // GeoJSON") or raw Overpass JSON ("elements" array) — whichever you have.
  const features = raw.features || raw.elements || [];

  if (features.length === 0) {
    console.error("No features found in that file — check the export actually returned results.");
    process.exit(1);
  }

  const docs = [];
  let skipped = 0;

  for (const f of features) {
    const tags = f.properties?.tags || f.properties || f.tags;
    const category = categorize(tags);
    if (!category) {
      skipped++;
      continue;
    }

    let coord = null;
    if (f.geometry) {
      coord = centroidOf(f.geometry); // GeoJSON export shape
    } else if (f.lat != null && f.lon != null) {
      coord = [f.lon, f.lat]; // raw Overpass node shape
    } else if (f.center) {
      coord = [f.center.lon, f.center.lat]; // raw Overpass way shape
    }

    if (!coord) {
      skipped++;
      continue;
    }

    docs.push({
      location: { type: "Point", coordinates: coord },
      category,
      osmId: String(f.id ?? f.properties?.["@id"] ?? ""),
      tags,
    });
  }

  console.log(`Parsed ${docs.length} usable features (${skipped} skipped — no matching category or geometry).`);

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  console.log("Clearing existing OsmFeature data...");
  await OsmFeature.deleteMany({});

  console.log(`Inserting ${docs.length} features...`);
  await OsmFeature.insertMany(docs);

  const counts = await OsmFeature.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
  console.log("Done. Breakdown by category:");
  counts.forEach((c) => console.log(`  ${c._id}: ${c.count}`));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
