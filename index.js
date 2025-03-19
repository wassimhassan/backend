const express = require("express");//Web framework to handle routes and requests.
const dotenv = require("dotenv"); //Loads environment variables from .env file.
const mongoose = require("mongoose"); //Used to interact with MongoDB.
const cors = require("cors"); //Allows cross-origin requests (important for frontend-backend communication).

dotenv.config(); //loads variables from .env.

const app = express();

const allowedOrigins = [
    "http://localhost:3000",
    "https://frontend-omega-three-31.vercel.app",
    "https://frontend-git-frontendvercel-wassim-hassans-projects.vercel.app",

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
    res.status(200).json({ message: "Welcome to the GymApp API 🚀" });
});

// Import routes
const authRoutes = require("./routes/authRoutes");
const trainerRoutes = require("./routes/trainerRoutes");
const bookingRoutes = require("./routes/BookingRoutes");
const gymownerRoutes = require("./routes/gymOwnerRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/gym-owner", gymownerRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payment", paymentRoutes);app.use("/api/workouts", workoutRoutes);
app.use("/api/chat", chatRoutes);

//(additional code for Socket.IO)
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Message = require("./models/Message");

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.id}`);
  
  // Join a room using the user's ID for private messaging.
  socket.join(socket.user.id);

  // Listen for a "sendMessage" event from the client.
  socket.on("sendMessage", async ({ sender, receiver, text }) => {
    // Enforce that the sender matches the authenticated user.
    if (sender !== socket.user.id) {
      return;
    }
    const message = new Message({
      sender,
      receiver,
      text,
      timestamp: new Date()
    });
    await message.save();
    
    // Emit the message to both the sender and the receiver.
    io.to(receiver).emit("receiveMessage", message);
    io.to(sender).emit("receiveMessage", message);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.id}`);
  });
});


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

    // Replace app.listen with server.listen
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); }