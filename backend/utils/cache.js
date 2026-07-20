import Cache from "../models/Cache.js";

// Tier 1: in-process memory. Fastest possible — zero network/DB round trip
// — but wiped every time the server restarts, and not shared across
// multiple server instances if you ever scale horizontally.
const memoryCache = new Map();

// Tier 2: MongoDB, with a TTL index (see models/Cache.js) so entries expire
// automatically. Survives restarts and is shared across server instances.
// This is the tier that actually protects your Overpass/ORS quota.

export async function getCached(key) {
  const hot = memoryCache.get(key);
  if (hot && hot.expireAt > Date.now()) {
    return hot.value;
  }
  if (hot) memoryCache.delete(key); // stale, evict

  const doc = await Cache.findOne({ key });
  if (!doc) return null;

  // Warm the memory tier so the next request for this key (likely within
  // seconds, e.g. a user re-rendering the map) skips the DB entirely.
  memoryCache.set(key, { value: doc.value, expireAt: doc.expireAt.getTime() });
  return doc.value;
}

export async function setCached(key, type, value, ttlSeconds) {
  const expireAt = new Date(Date.now() + ttlSeconds * 1000);
  memoryCache.set(key, { value, expireAt: expireAt.getTime() });
  await Cache.findOneAndUpdate(
    { key },
    { key, type, value, expireAt },
    { upsert: true }
  );
}
