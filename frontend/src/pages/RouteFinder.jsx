import { useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import { fetchSafeRoutes } from "../api.js";
import { decodePolyline } from "../utils/decodePolyline.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import SOSButton from "../components/SOSButton.jsx";
import LiveLocationToggle from "../components/LiveLocationToggle.jsx";
import IncomingAlerts from "../components/IncomingAlerts.jsx";
import LocationAutocomplete from "../components/LocationAutocomplete.jsx";

const RISK_COLORS = {
  low: "#16a34a",
  medium: "#f59e0b",
  high: "#dc2626",
};

const TRAVEL_MODES = [
  { value: "foot-walking", label: "Walking" },
  { value: "driving-car", label: "Driving" },
  { value: "cycling-regular", label: "Cycling" },
];

function riskLevel(score) {
  if (score < 2) return "low";
  if (score < 5) return "medium";
  return "high";
}

export default function RouteFinder() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [origin, setOrigin] = useState(null); // { label, lat, lng } | null
  const [destination, setDestination] = useState(null);
  const [profile, setProfile] = useState("foot-walking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const center = [12.92, 80.23]; // Neelankarai–Sholinganallur corridor

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!origin || !destination) {
      setError("Pick both locations from the suggestion list — typing alone isn't enough to find the exact spot.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const originStr = `${origin.lat},${origin.lng}`;
      const destStr = `${destination.lat},${destination.lng}`;
      const data = await fetchSafeRoutes(originStr, destStr, undefined, profile);
      setResult(data);
      setSelectedIdx(data.routes.findIndex((r) => r === data.recommended) ?? 0);
    } catch (err) {
      setError(err.response?.data?.message || "Could not fetch routes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen md:flex-row">
      <IncomingAlerts />

      {/* Sidebar */}
      <div className="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold">S</div>
              <h1 className="text-xl font-bold text-slate-800">SafeRoute</h1>
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/contacts" className="text-xs font-semibold text-brand-600 hover:underline">
                  Contacts
                </Link>
                <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">
                  Log out
                </button>
              </div>
            ) : (
              <Link to="/login" className="text-xs font-semibold text-brand-600 hover:underline">
                Log in
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">Pick the route that's actually safe, not just fast.</p>

          {user ? (
            <div className="flex items-center justify-between mt-4 gap-3">
              <SOSButton />
              <LiveLocationToggle />
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-3 bg-slate-50 rounded-lg p-2">
              <Link to="/login" className="text-brand-600 font-semibold">
                Log in
              </Link>{" "}
              to enable SOS alerts and live location sharing with your emergency contacts.
            </p>
          )}
          {user && !connected && (
            <p className="text-xs text-amber-600 mt-2">Reconnecting to alert service...</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 border-b border-slate-100">
          <LocationAutocomplete
            label="From"
            placeholder="Search for a starting point"
            onSelect={setOrigin}
          />
          <LocationAutocomplete
            label="To"
            placeholder="Search for a destination"
            onSelect={setDestination}
          />

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Travel mode</label>
            <div className="flex gap-2 mt-1">
              {TRAVEL_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setProfile(mode.value)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition ${
                    profile === mode.value
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Bus/transit routing isn't available yet — walking, driving, and cycling only.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Finding safest route..." : "Find safe route"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        {result && (
          <div className="p-5 space-y-3">
            {result.tradeoffWarning && (
              <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
                The safest route takes noticeably longer. Both options are shown below — choose what feels right for you.
              </div>
            )}
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Route options</h2>
            {result.routes.map((route, idx) => {
              const level = riskLevel(route.riskScore);
              const isRecommended = route === result.recommended;
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    isSelected ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{route.summary || `Route ${idx + 1}`}</span>
                        {isRecommended && (
                          <span className="text-[10px] bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded-full uppercase">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {route.durationText} · {route.distanceText}
                      </p>
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-1 rounded-full text-white shrink-0"
                      style={{ backgroundColor: RISK_COLORS[level] }}
                    >
                      {level === "low" ? "Safer" : level === "medium" ? "Moderate" : "Higher risk"}
                    </span>
                  </div>
                  {(route.incidentCount > 0 ||
                    route.unlitPointCount > 0 ||
                    route.isolatedPointCount > 0 ||
                    route.policeNearbyCount > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {route.incidentCount > 0 && (
                        <span className="text-xs text-slate-500">
                          {route.incidentCount} nearby report{route.incidentCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {route.isolatedPointCount > 0 && (
                        <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                          {route.isolatedPointCount} isolated stretch{route.isolatedPointCount !== 1 ? "es" : ""}
                        </span>
                      )}
                      {route.unlitPointCount > 0 && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          {route.unlitPointCount} unlit stretch{route.unlitPointCount !== 1 ? "es" : ""}
                        </span>
                      )}
                      {route.policeNearbyCount > 0 && (
                        <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                          Police nearby
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer center={center} zoom={13} className="h-full w-full">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {result?.routes.map((route, idx) => {
            const points = decodePolyline(route.polyline);
            const level = riskLevel(route.riskScore);
            const isSelected = idx === selectedIdx;
            return (
              <Polyline
                key={idx}
                positions={points}
                pathOptions={{
                  color: RISK_COLORS[level],
                  weight: isSelected ? 6 : 3,
                  opacity: isSelected ? 0.9 : 0.4,
                }}
                eventHandlers={{ click: () => setSelectedIdx(idx) }}
              />
            );
          })}
          {result?.routes[selectedIdx]?.flaggedSegments.map((seg, i) => (
            <Marker key={i} position={[seg.lat, seg.lng]}>
              <Popup>Flagged area — elevated risk score: {seg.risk}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
