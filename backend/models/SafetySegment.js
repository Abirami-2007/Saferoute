import mongoose from "mongoose";

/**
 * One document per ~100m chunk of road, precomputed offline by
 * scripts/buildSafetyGrid.js from OSM data (road type, lit tag, nearby
 * streetlamps, nearby POIs). This is the "static" half of the safety
 * score — it changes rarely and is looked up cheaply at request time
 * instead of being recomputed live.
 */
const safetySegmentSchema = new mongoose.Schema(
  {
    wayId: { type: Number, index: true }, // OSM way id this segment belongs to
    highway: String, // OSM highway tag, e.g. "residential", "footway"
    lit: { type: Boolean, default: null }, // explicit OSM lit=yes/no, null if untagged
    lampNearby: { type: Boolean, default: false }, // a street_lamp node within ~50m
    poiCount: { type: Number, default: 0 }, // shops/amenities within ~100m (proxy for foot traffic)
    riskBase: { type: Number, required: true }, // precomputed static risk, 0 = safest, higher = riskier
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat] - GeoJSON order
    },
  },
  { timestamps: true }
);

safetySegmentSchema.index({ location: "2dsphere" });

export default mongoose.model("SafetySegment", safetySegmentSchema);
