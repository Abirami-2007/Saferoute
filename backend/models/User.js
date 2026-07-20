import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    emergencyContacts: [
      {
        name: String,
        phone: String,
        // Real-time SOS/live-location alerts are delivered over a socket
        // room keyed by user ID — that only works if the contact is also a
        // registered SafeRoute account. This is set when the contact is
        // added by looking up their email (see routes/userRoutes.js).
        // A contact can still be saved with just name/phone for display
        // purposes even if they haven't signed up; they just won't receive
        // real-time alerts until they do.
        contactUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
