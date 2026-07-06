require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());

// Routes (optional)
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});