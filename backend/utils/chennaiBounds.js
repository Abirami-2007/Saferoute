// Rough bounding box for the Chennai metro area. Used to bias/restrict ORS
// geocoding and autocomplete so ambiguous or misspelled place names resolve
// to somewhere in Chennai rather than an unrelated match elsewhere in India
// (or the world) — this is what was causing routes to jump to completely
// wrong parts of the city.
export const CHENNAI_BBOX = {
  south: 12.75,
  west: 79.95,
  north: 13.3,
  east: 80.35,
};
