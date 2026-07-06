import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import incidentRoutes from "./routes/incidentRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/routes", routeRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

// Basic SOS broadcast: a client in danger emits "sos", we relay it to
// whichever emergency-contact sockets are subscribed to that user's room.
io.on("connection", (socket) => {
  socket.on("join", (userId) => socket.join(userId));

  socket.on("sos", ({ userId, lat, lng, contactIds }) => {
    contactIds?.forEach((contactId) => {
      io.to(contactId).emit("sos-alert", { userId, lat, lng, timestamp: Date.now() });
    });
  });

  socket.on("live-location", ({ userId, lat, lng, contactIds }) => {
    contactIds?.forEach((contactId) => {
      io.to(contactId).emit("location-update", { userId, lat, lng });
    });
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
