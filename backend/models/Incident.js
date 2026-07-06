import mongoose from "mongoose";

// Each incident is a crowdsourced safety report tied to a point on the map.
const incidentSchema = new mongoose.Schema(
  {
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        // [longitude, latitude] - GeoJSON order, NOT lat/lng
        type: [Number],
        required: true,
      },
    },
    category: {
      type: String,
      enum: [
        "harassment",
        "poor_lighting",
        "isolated_area",
        "unsafe_incident",
        "positive_feedback", // lets users mark a place as safe too
      ],
      required: true,
    },
    severity: {
      type: Number, // 1 (minor concern) - 5 (serious incident)
      min: 1,
      max: 5,
      default: 3,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    timeOfDay: {
      type: String,
      enum: ["morning", "afternoon", "evening", "night"],
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

incidentSchema.index({ location: "2dsphere" });

export default mongoose.model("Incident", incidentSchema);
