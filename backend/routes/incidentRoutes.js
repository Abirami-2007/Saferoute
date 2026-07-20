import express from "express";
import Incident from "../models/Incident.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Report a new incident/observation
router.post("/", protect, async (req, res) => {
  try {
    const { lat, lng, category, severity, description, timeOfDay } = req.body;
    const incident = await Incident.create({
      location: { type: "Point", coordinates: [lng, lat] },
      category,
      severity,
      description,
      timeOfDay,
      reportedBy: req.userId,
    });
    res.status(201).json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get incidents near a point (for map display)
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 1000 } = req.query;
    const incidents = await Incident.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(radius),
        },
      },
    }).limit(100);
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
