import axios from "axios";
//this file Converts a location entered by the user into geographic coordinates.
const ORS_BASE = "https://api.openrouteservice.org";

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

  return data.features[0].geometry.coordinates; // already [lng, lat]
}
