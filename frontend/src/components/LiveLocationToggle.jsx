import { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext.jsx";

const EMIT_INTERVAL_MS = 10000; // don't emit more often than this, even if GPS updates faster

export default function LiveLocationToggle() {
  const { shareLocation, connected } = useSocket();
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef(null);
  const lastEmitRef = useRef(0);

  function start() {
    if (!navigator.geolocation || !connected) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastEmitRef.current < EMIT_INTERVAL_MS) return;
        lastEmitRef.current = now;
        shareLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.error("Location watch error:", err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharing(true);
  }

  function stop() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  }

  // Stop sharing automatically if the socket disconnects, so contacts don't
  // see a stale "last known location" indefinitely without knowing it's stale.
  useEffect(() => {
    if (!connected && sharing) stop();
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stop(), []); // cleanup on unmount

  return (
    <button
      onClick={sharing ? stop : start}
      disabled={!connected}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-40 ${
        sharing
          ? "bg-green-50 border-green-300 text-green-700"
          : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
      }`}
    >
      {sharing ? "● Sharing location" : "Share live location"}
    </button>
  );
}
