import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import incidentRoutes from "./routes/incidentRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/users", userRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

// Every socket connection must present the same JWT used for REST calls.
// This is what stops the old design's core problem: previously the client
// told the server "I am user X, alert contacts Y and Z" and the server just
// believed it — meaning anyone could spam SOS alerts to arbitrary users.
// Now identity comes from a verified token, not a request payload.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  // Auto-join a room named after the verified user ID — no client-supplied
  // "join" event needed, and no way to join someone else's room.
  socket.join(socket.userId);

  socket.on("sos", async ({ lat, lng }) => {
    try {
      const user = await User.findById(socket.userId);
      if (!user) return;

      // Contacts are looked up server-side from the DB, not trusted from
      // the client payload. Only contacts linked to a real account
      // (contactUserId set — see userRoutes.js) can receive a live alert.
      const linkedContactIds = user.emergencyContacts
        .filter((c) => c.contactUserId)
        .map((c) => c.contactUserId.toString());

      linkedContactIds.forEach((contactId) => {
        io.to(contactId).emit("sos-alert", {
          fromUserId: socket.userId,
          fromName: user.name,
          lat,
          lng,
          timestamp: Date.now(),
        });
      });
    } catch (err) {
      console.error("Failed to process SOS event:", err.message);
    }
  });

  socket.on("live-location", async ({ lat, lng }) => {
    try {
      const user = await User.findById(socket.userId);
      if (!user) return;

      const linkedContactIds = user.emergencyContacts
        .filter((c) => c.contactUserId)
        .map((c) => c.contactUserId.toString());

      linkedContactIds.forEach((contactId) => {
        io.to(contactId).emit("location-update", {
          fromUserId: socket.userId,
          fromName: user.name,
          lat,
          lng,
          timestamp: Date.now(),
        });
      });
    } catch (err) {
      console.error("Failed to process live-location event:", err.message);
    }
  });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));
