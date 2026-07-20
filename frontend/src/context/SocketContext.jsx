import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [incomingAlerts, setIncomingAlerts] = useState([]); // SOS alerts from contacts
  const [contactLocations, setContactLocations] = useState({}); // fromUserId -> latest location

  useEffect(() => {
    // No token yet (not logged in) — don't attempt a connection at all.
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token }, // verified server-side in server.js's io.use() middleware
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err) => {
      console.error("Socket connection failed:", err.message);
      setConnected(false);
    });

    socket.on("sos-alert", (payload) => {
      setIncomingAlerts((prev) => [payload, ...prev]);
    });

    socket.on("location-update", (payload) => {
      setContactLocations((prev) => ({ ...prev, [payload.fromUserId]: payload }));
    });

    return () => socket.disconnect();
  }, [token]);

  function sendSOS(lat, lng) {
    socketRef.current?.emit("sos", { lat, lng });
  }

  function shareLocation(lat, lng) {
    socketRef.current?.emit("live-location", { lat, lng });
  }

  function dismissAlert(index) {
    setIncomingAlerts((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <SocketContext.Provider
      value={{ connected, incomingAlerts, contactLocations, sendSOS, shareLocation, dismissAlert }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside <SocketProvider>");
  return ctx;
}
