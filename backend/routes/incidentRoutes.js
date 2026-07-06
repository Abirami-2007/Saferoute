import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createIncident,
  getNearbyIncidents,
  getAllIncidents,
  deleteIncident,
} from "../controllers/incidentController.js";

const router = express.Router();

router.post("/", protect, createIncident);

router.get("/", getAllIncidents);

router.get("/nearby", getNearbyIncidents);

router.delete("/:id", protect, deleteIncident);

export default router;
