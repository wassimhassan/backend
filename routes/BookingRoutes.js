const express = require("express");
const jwt = require("jsonwebtoken");
const Trainer = require("../models/Trainer");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Subscription = require("../models/Subscription");
const { validateBookingLimit } = require("../utils/bookingUtils");
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
        const { trainerId, sessionTime, paymentMethod } = req.body;
        const clientId = req.user.id;

        if (!trainerId || !sessionTime) {
            return res.status(400).json({ message: "Trainer ID and session time are required." });
        }

        const sessionDate = new Date(sessionTime);
        if (isNaN(sessionDate)) {
            return res.status(400).json({ message: "Invalid session time format." });
        }

        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        const availability = await TrainerAvailability.findOne({ trainerId });
        if (!availability || !availability.availableSlots) {
            return res.status(400).json({ message: "Trainer has not set availability." });
        }

        const isAvailable = availability.availableSlots.some(slot =>
            slot.time.some(timeSlot => new Date(timeSlot).getTime() === sessionDate.getTime())
        );

        if (!isAvailable) {
            return res.status(400).json({ message: "Trainer is not available at the requested time." });
        }

        const existingBooking = await Booking.findOne({ trainerId, clientId, sessionTime: sessionDate });
        if (existingBooking) {
            return res.status(400).json({ message: "You have already booked this session." });
        }

        // Check for subscription if using subscription payment method
        let subscription = null;
        if (paymentMethod === "subscription") {
            const now = new Date();
            subscription = await Subscription.findOne({
                clientId,
                status: "active",
                startDate: { $lte: now },
                endDate: { $gte: now },
                sessionsRemaining: { $gt: 0 }
            });

            if (!subscription) {
                return res.status(400).json({ 
                    message: "No active subscription with remaining sessions found." 
                });
            }
        }

        // Create the booking
        const booking = new Booking({
            trainerId,
            clientId,
            sessionTime: sessionDate,
            paymentMethod,
            status: "confirmed"
        });

        await booking.save();

        // If using subscription, decrement the remaining sessions
        if (subscription) {
            subscription.sessionsRemaining -= 1;
            await subscription.save();
        }

        res.status(201).json({ 
            message: "Session booked successfully!",
            booking,
            subscription: subscription ? {
                planType: subscription.planType,
                sessionsRemaining: subscription.sessionsRemaining,
                totalSessions: subscription.totalSessions
            } : null
        });
    } catch (error) {
        console.error("Error booking session:", error);
        res.status(500).json({ 
            message: "Error booking session",
            error: error.message 
        });
    }
});

router.get("/bookings", verifyToken, async (req, res) => {
    try {
      const clientId = req.user.id;
      const { filter, page = 1, limit = 6 } = req.query;
      
      const now = new Date();
      let query = { clientId };
  
      // 🔍 Add filter logic
      if (filter === "upcoming") {
        query.sessionTime = { $gte: now };
      } else if (filter === "past") {
        query.sessionTime = { $lt: now };
      }
  
      // 🔄 Fetch total count for pagination
      const total = await Booking.countDocuments(query);
  
      // 📦 Fetch bookings with pagination and populate trainer details
      const bookings = await Booking.find(query)
  .populate("trainerId", "username specialties")
  .sort({ sessionTime: 1 })
  .skip((page - 1) * limit)
  .limit(Number(limit))
  .then(results => results.filter(b => b.trainerId)); // 👈 filter out nulls
  
      return res.status(200).json({
        bookings,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: Number(page),
        }
      });
    } catch (error) {
      console.error("❌ Error retrieving bookings:", error);
      return res.status(500).json({ message: "Error retrieving bookings.", error: error.message });
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

// Get Bookings for a Trainer
router.get("/trainer/:trainerId", verifyToken, async (req, res) => {
    try {
        const { trainerId } = req.params;

        if (req.user.id !== trainerId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Access denied. You can only view your own bookings." });
        }

        // ✅ Populate `clientId` to include full user details
        const bookings = await Booking.find({ trainerId })
            .populate("clientId", "username email phoneNumber") // Ensure client details are included
            .sort({ sessionTime: 1 });

        console.log("✅ Trainer's Bookings with Clients:", bookings);

        res.status(200).json(bookings);
    } catch (error) {
        console.error("❌ Error fetching trainer bookings:", error);
        res.status(500).json({ message: "Error fetching trainer bookings.", error: error.message });
    }
});

router.put("/booking/:id/complete", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        booking.completed = true;
        await booking.save();

        res.status(200).json({ message: "Booking marked as completed", booking });
    } catch (error) {
        console.error("❌ Error completing booking:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Toggle booking completion status (complete ⇄ undo)
router.put("/booking/:id/toggle-status", verifyToken, async (req, res) => {
    try {
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        booking.completed = !booking.completed;
        await booking.save();

        res.status(200).json({ 
            message: `Booking marked as ${booking.completed ? "completed" : "undone"}`,
            booking 
        });
    } catch (error) {
        console.error("❌ Error toggling booking status:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;