const express = require("express");
const jwt = require("jsonwebtoken");
const Trainer = require("../models/Trainer");
const User = require("../models/User");
const Booking = require("../models/Booking");
const TrainerAvailability = require("../models/TrainerAvailability");

const router = express.Router();

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


// ✅ Book a session
router.post("/book-session", verifyToken, async (req, res) => {
    try {
        const { trainerId, sessionTime } = req.body;
        const clientId = req.user.id;

        if (!trainerId || !sessionTime) {
            return res.status(400).json({ message: "Trainer ID and session time are required." });
        }

        // Convert sessionTime to Date object
        const sessionDate = new Date(sessionTime);
        if (isNaN(sessionDate)) {
            return res.status(400).json({ message: "Invalid session time format." });
        }

        // Check if trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        // Check trainer availability
        const availability = await TrainerAvailability.findOne({ trainerId });
        if (!availability || !availability.availableSlots) {
            return res.status(400).json({ message: "Trainer has not set availability." });
        }

        // Check if the selected time is available
        const isAvailable = availability.availableSlots.some(slot =>
            slot.time.some(timeSlot => new Date(timeSlot).getTime() === sessionDate.getTime())
        );

        if (!isAvailable) {
            return res.status(400).json({ message: "Trainer is not available at the requested time." });
        }

        // Check if session already booked
        const existingBooking = await Booking.findOne({ trainerId, clientId, sessionTime: sessionDate });
        if (existingBooking) {
            return res.status(400).json({ message: "You have already booked this session." });
        }

        // Create a new booking
        const newBooking = new Booking({
            trainerId,
            clientId,
            sessionTime: sessionDate,
            status: "confirmed",
        });

        await newBooking.save();

        res.status(201).json({ message: "Session booked successfully!", booking: newBooking });
    } catch (error) {
        console.error("Error booking session:", error);
        res.status(500).json({ message: "Error booking session.", error: error.message });
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

// ✅ Cancel a booking
router.delete("/bookings/:id", verifyToken, async (req, res) => {
    try {
        const bookingId = req.params.id;

        // Find and delete the booking
        const booking = await Booking.findByIdAndDelete(bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        res.status(200).json({ message: "Booking canceled successfully." });
    } catch (error) {
        console.error("Error canceling booking:", error);
        res.status(500).json({ message: "Error canceling booking." });
    }
});

module.exports = router;