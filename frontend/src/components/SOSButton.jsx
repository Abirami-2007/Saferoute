import { useRef, useState } from "react";
import { useSocket } from "../context/SocketContext.jsx";

const HOLD_DURATION_MS = 1200;

export default function SOSButton() {
  const { sendSOS, connected } = useSocket();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [status, setStatus] = useState(null); // null | "sending" | "sent" | "error"
  const timerRef = useRef(null);
  const startRef = useRef(null);

  function startHold() {
    if (!connected) {
      setStatus("error");
      return;
    }
    setHolding(true);
    setStatus(null);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current);
        triggerSOS();
      }
    }, 30);
  }

  function cancelHold() {
    clearInterval(timerRef.current);
    setHolding(false);
    setProgress(0);
  }

  function triggerSOS() {
    setHolding(false);
    setStatus("sending");

    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendSOS(pos.coords.latitude, pos.coords.longitude);
        setStatus("sent");
        setTimeout(() => setStatus(null), 5000);
      },
      () => setStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        className="relative h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-lg select-none overflow-hidden"
        aria-label="Hold to send SOS alert to your emergency contacts"
      >
        <div
          className="absolute inset-0 bg-red-900/40"
          style={{
            clipPath: `inset(${100 - progress}% 0 0 0)`,
            transition: holding ? "none" : "clip-path 0.15s ease-out",
          }}
        />
        <span className="relative z-10">SOS</span>
      </button>

      <p className="text-xs text-slate-500 text-center w-32">
        {status === "sending" && "Getting your location..."}
        {status === "sent" && (
          <span className="text-green-600 font-semibold">Alert sent to your contacts</span>
        )}
        {status === "error" && (
          <span className="text-red-600 font-semibold">
            {connected ? "Couldn't get location" : "Not connected — check login"}
          </span>
        )}
        {!status && "Press & hold 1s to alert contacts"}
      </p>
    </div>
  );
}
