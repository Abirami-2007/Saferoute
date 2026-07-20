import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.userId)
    .select("-password")
    .populate("emergencyContacts.contactUserId", "name email");
  res.json(user);
});

// Add an emergency contact by email. If that email belongs to a registered
// SafeRoute user, they're linked via contactUserId so they can actually
// receive real-time SOS/live-location alerts. If not, the contact is still
// saved for display purposes, just without real-time delivery.
router.post("/me/contacts", protect, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ message: "Contact name is required" });

    let contactUserId = null;
    if (email) {
      const matchedUser = await User.findOne({ email: email.toLowerCase() });
      if (matchedUser) {
        if (matchedUser._id.toString() === req.userId) {
          return res.status(400).json({ message: "You can't add yourself as an emergency contact" });
        }
        contactUserId = matchedUser._id;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $push: { emergencyContacts: { name, phone, contactUserId } } },
      { new: true }
    ).populate("emergencyContacts.contactUserId", "name email");

    res.status(201).json({
      contacts: user.emergencyContacts,
      linked: Boolean(contactUserId),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/me/contacts/:contactId", protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $pull: { emergencyContacts: { _id: req.params.contactId } } },
      { new: true }
    );
    res.json({ contacts: user.emergencyContacts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
