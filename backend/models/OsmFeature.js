import mongoose from "mongoose";

// Stores OSM features that used to be fetched live from Overpass at request
// time. Now populated once via `npm run seed:osm` (see scripts/importOsmData.js)
// from a manually-downloaded export, and queried locally like any other
// collection — no external API call happens while serving a route request.
const osmFeatureSchema = new mongoose.Schema(
  {
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    category: {
      type: String,
      enum: ["police", "activity", "lamp", "lit_way", "unlit_way", "busy_road", "quiet_road"],
      required: true,
    },
    osmId: { type: String, default: null }, // for traceability back to the source data, not used in scoring
    tags: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

osmFeatureSchema.index({ location: "2dsphere" });
osmFeatureSchema.index({ category: 1 });

export default mongoose.model("OsmFeature", osmFeatureSchema);
