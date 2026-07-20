import mongoose from "mongoose";

// A generic cache table for anything expensive/rate-limited to fetch:
// Overpass area signals, ORS geocode results, ORS directions responses.
// One collection, distinguished by `type`, so we don't need a new schema
// every time we cache a new external call.
const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // "area_signals" | "geocode" | "directions"
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  expireAt: { type: Date, required: true },
});

// TTL index: MongoDB automatically deletes documents once `expireAt` has
// passed (expireAfterSeconds: 0 means "expire exactly at this timestamp,
// not N seconds after it").
cacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Cache", cacheSchema);
