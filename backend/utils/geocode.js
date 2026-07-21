import axios from "axios";
import { getCached, setCached } from "./cache.js";
import { CHENNAI_BBOX } from "./chennaiBounds.js";

const ORS_BASE = "https://api.openrouteservice.org";
const GEOCODE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days — addresses don't move

// If the input already looks like "lat,lng", skip the geocoding call entirely.
const COORD_REGEX = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;

/**
 * Accepts either "lat,lng" or a free-text address/place name, and always
 * returns [lng, lat] — the coordinate order OpenRouteService expects.
 *
 * This is a FALLBACK path — the frontend's autocomplete (see routeRoutes.js
 * GET /autocomplete) is the primary way locations get resolved now, since
 * it lets the user pick an exact match instead of hoping free text resolves
 * correctly. This still gets used if origin/destination arrive as raw text
 * (e.g. a direct API call, or "lat,lng" typed manually).
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
      // Restrict results to the Chennai metro bbox — without this, a typo
      // or ambiguous name can silently match somewhere else entirely and
      // produce a route that looks completely wrong.
      "boundary.rect.min_lon": CHENNAI_BBOX.west,
      "boundary.rect.min_lat": CHENNAI_BBOX.south,
      "boundary.rect.max_lon": CHENNAI_BBOX.east,
      "boundary.rect.max_lat": CHENNAI_BBOX.north,
    },
  });

  if (!data.features?.length) {
    throw new Error(
      `Could not find "${input}" in Chennai. Try picking a suggestion from the dropdown instead of typing the full address.`
    );
  }

  const coord = data.features[0].geometry.coordinates; // already [lng, lat]
  await setCached(cacheKey, "geocode", coord, GEOCODE_TTL_SECONDS);
  return coord;
}
