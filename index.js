const express = require("express");//Web framework to handle routes and requests.
const dotenv = require("dotenv"); //Loads environment variables from .env file.
const mongoose = require("mongoose"); //Used to interact with MongoDB.
const cors = require("cors"); //Allows cross-origin requests (important for frontend-backend communication).

dotenv.config(); //loads variables from .env.

const app = express();

const allowedOrigins = [
    "http://localhost:3000",
    "https://frontend-omega-three-31.vercel.app",
    "https://frontend-git-frontendvercel-wassim-hassans-projects.vercel.app"

  ];
  
  app.use(cors({
    origin: allowedOrigins,
    credentials: true
  }));

app.use("/uploads", express.static("uploads"));
app.use(express.json()); // enables parsing JSON in requests.

// Prevent Mongoose Deprecation Warnings
mongoose.set("strictQuery", false);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => {
        process.exit(1); // Exit process if DB connection fails
    });

// Root Route (Useful for API health check)
app.get("/", (req, res) => {
    res.status(200).json({ message: "Welcome to the Gym App API 🚀" });
});

// Import routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// 404 Route Handler (For undefined routes)
app.use((req, res) => {
    res.status(404).json({ message: "API route not found." });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Server Error:", err.stack);
    res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

module.exports = app; // <-- Export for Vercel

if (require.main === module) {
    // Only runs if we launched this file directly with `node index.j

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); }