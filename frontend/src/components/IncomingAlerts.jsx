import { useSocket } from "../context/SocketContext.jsx";

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export default function IncomingAlerts() {
  const { incomingAlerts, dismissAlert } = useSocket();

  if (incomingAlerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4 space-y-2">
      {incomingAlerts.map((alert, idx) => (
        <div
          key={`${alert.fromUserId}-${alert.timestamp}`}
          className="bg-red-600 text-white rounded-xl shadow-lg p-4 flex items-start gap-3"
        >
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 font-bold">
            !
          </div>
          <div className="flex-1">
            <p className="font-semibold">{alert.fromName || "A contact"} needs help</p>
            <p className="text-sm text-red-100 mt-0.5">
              Location: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)} · {timeAgo(alert.timestamp)}
            </p>
            <a
              href={`https://www.openstreetmap.org/?mlat=${alert.lat}&mlon=${alert.lng}#map=17/${alert.lat}/${alert.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline font-semibold inline-block mt-1"
            >
              View location on map
            </a>
          </div>
          <button
            onClick={() => dismissAlert(idx)}
            className="text-white/70 hover:text-white text-lg leading-none"
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
