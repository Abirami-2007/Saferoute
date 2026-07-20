import axios from "axios";
import { getCached, setCached } from "./cache.js";

const ORS_BASE = "https://api.openrouteservice.org";
const GEOCODE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days — addresses don't move

// If the input already looks like "lat,lng", skip the geocoding call entirely.
const COORD_REGEX = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;

/**
 * Accepts either "lat,lng" or a free-text address/place name, and always
 * returns [lng, lat] — the coordinate order OpenRouteService expects.
 */
export async function geocode(input) {
  if (COORD_REGEX.test(input)) {
    const [lat, lng] = input.split(",").map((n) => parseFloat(n.trim()));
    return [lng, lat];
  }

  const cacheKey = `geocode:${input.trim().toLowerCase()}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const { data } = await axios.get(`${ORS_BASE}/geocode/search`, {
    params: {
      api_key: process.env.ORS_API_KEY,
      text: input,
      size: 1,
    },
  });

  if (!data.features?.length) {
    throw new Error(`Could not find a location matching "${input}"`);
  }

  const coord = data.features[0].geometry.coordinates; // already [lng, lat]
  await setCached(cacheKey, "geocode", coord, GEOCODE_TTL_SECONDS);
  return coord;
}
