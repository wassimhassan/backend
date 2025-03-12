const express = require("express");
const jwt = require("jsonwebtoken");
const Trainer = require("../models/Trainer");
const User = require("../models/User");
const Booking = require("../models/Booking");

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
        const { trainerId, sessionTime, sessionCost } = req.body;
        const client = await User.findById(req.user.id).populate("subscription");

        if (!client) return res.status(404).json({ message: "Client not found." });

        if (!client.subscription || client.subscription.status !== "active") {
            return res.status(403).json({ message: "You must have an active subscription to book a session." });
        }

        // Apply subscription discount
        const finalCost = sessionCost - (sessionCost * (client.subscription.sessionDiscount / 100));

        if (client.balanceDue + finalCost > client.balanceLimit) {
            return res.status(403).json({ message: "Insufficient balance. Please pay outstanding fees." });
        }

        const newBooking = new Booking({
            trainerId,
            clientId: client._id,
            sessionTime,
            status: "confirmed",
            sessionCost: finalCost
        });

        await newBooking.save();
        client.balanceDue += finalCost;
        await client.save();

        res.status(201).json({ message: "Session booked successfully!", booking: newBooking });
    } catch (error) {
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