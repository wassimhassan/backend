const verifyToken = (req, res, next) => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Store user ID in req.user
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired token." });
    }
};

const Booking = require("../models/Booking");

router.post("/book-session", verifyToken, async (req, res) => {
    try {
        const { trainerId, sessionTime } = req.body;
        const clientId = req.user.id; // Authenticated user

        // Check if trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        // Prevent duplicate booking for the same trainer and time
        const existingBooking = await Booking.findOne({ trainerId, clientId, sessionTime });
        if (existingBooking) {
            return res.status(400).json({ message: "You have already booked this session." });
        }

        const newBooking = new Booking({
            trainerId,
            clientId,
            sessionTime,
            status: "pending"
        });

        await newBooking.save();
        res.status(201).json({ message: "Session booked successfully!", booking: newBooking });
    } catch (error) {
        res.status(500).json({ message: "Server error while booking session." });
    }
});
router.get("/bookings", verifyToken, async (req, res) => {
    try {
        const clientId = req.user.id;

        // Find bookings made by this user
        const bookings = await Booking.find({ clientId })
            .populate("trainerId", "username specialties") // Include trainer details
            .sort({ sessionTime: 1 }); // Sort by session time

        res.status(200).json(bookings);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving bookings." });
    }
});
const mongoose = require("mongoose");
const BookingSchema = new mongoose.Schema({
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionTime: { type: Date, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" }
}, { timestamps: true });

module.exports = mongoose.model("Booking", BookingSchema);