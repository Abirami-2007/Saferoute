import Incident from "../models/Incident.js";

// Report a new incident
export const createIncident = async (req, res) => {
  try {
    const { lat, lng, category, severity, description, timeOfDay } = req.body;

    const incident = await Incident.create({
      location: {
        type: "Point",
        coordinates: [lng, lat],
      },
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
};

// Get nearby incidents
export const getNearbyIncidents = async (req, res) => {
  try {
    const { lat, lng, radius = 1000 } = req.query;

    const incidents = await Incident.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
          $maxDistance: Number(radius),
        },
      },
    }).limit(100);

    res.json(incidents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//get all incident
export const getAllIncidents = async (req, res) => {
  try {
    const incidents = await Incident.find()
      .populate("reportedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(incidents);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

//delete incident 
export const deleteIncident = async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found",
      });
    }

    if (incident.reportedBy.toString() !== req.userId) {
      return res.status(403).json({
        message: "You are not authorized to delete this incident",
      });
    }

    await incident.deleteOne();

    res.status(200).json({
      message: "Incident deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};