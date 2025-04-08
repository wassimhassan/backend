// routes/gymOwnerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
const Booking = require("../models/Booking");
const Trainer = require("../models/Trainer");
const router = express.Router();
const asyncHandler = require("express-async-handler");


// Middleware: Verify Gym Owner Token
const verifyGymOwnerToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.owner = decoded;
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid or expired token." });
    }
};

const verifyGymOwner = (req, res, next) => {
    if (!req.owner || req.owner.role !== "gymOwner") {
        return res.status(403).json({ message: "Access denied. Only gym owners are allowed." });
    }
    next();
};

// Gym Owner Authentication Routes

// Gym Owner Signup (Register with Phone Number & PIN)
router.post("/signup", async (req, res) => {
    try {
        const { ownerName, phoneNumber, pin } = req.body;

        if (!ownerName || !phoneNumber || !pin) {
            return res.status(400).json({ message: "Owner name, phone number, and PIN are required." });
        }

        // Validate PIN (Must be exactly 4 digits)
        if (!/^\d{4}$/.test(pin)) {
            return res.status(400).json({ message: "PIN must be a 4-digit number." });
        }

        // Check if phone number already exists
        const existingOwner = await GymOwner.findOne({ phoneNumber });
        if (existingOwner) return res.status(400).json({ message: "Phone number already registered." });

        // Hash the PIN for security
        const hashedPin = await bcrypt.hash(pin, 10);

        // Create new Gym Owner
        const newOwner = new GymOwner({ ownerName, phoneNumber, pin: hashedPin });
        await newOwner.save();

        res.status(201).json({ message: "Gym Owner registered successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Error during registration.", error: error.message });
    }
});

// Gym Owner Login (Phone Number + PIN)
router.post("/login", async (req, res) => {
    try {
        const { phoneNumber, pin } = req.body;

        if (!phoneNumber || !pin) {
            return res.status(400).json({ message: "Phone number and PIN are required." });
        }

        // Find owner by phone number
        const owner = await GymOwner.findOne({ phoneNumber });
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        // Verify PIN
        const isPinMatch = await bcrypt.compare(pin, owner.pin);
        if (!isPinMatch) return res.status(400).json({ message: "Incorrect PIN." });

        // Generate JWT token
        const token = jwt.sign({ id: owner._id, role: "gymOwner" }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.status(200).json({
            message: "Login successful!",
            token,
            owner: {
                id: owner._id,
                ownerName: owner.ownerName,
                phoneNumber: owner.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Error during login.", error: error.message });
    }
});

// Update Gym Owner PIN
router.put("/update-pin", verifyGymOwnerToken, async (req, res) => {
    try {
        const { newPin } = req.body;

        if (!/^\d{4}$/.test(newPin)) {
            return res.status(400).json({ message: "PIN must be a 4-digit number." });
        }

        const hashedPin = await bcrypt.hash(newPin, 10);
        const owner = await GymOwner.findByIdAndUpdate(req.owner.id, { pin: hashedPin }, { new: true });

        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        res.status(200).json({ message: "PIN updated successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Error updating PIN.", error: error.message });
    }
});

// Get All Clients
// Get All Clients
router.get("/clients", verifyGymOwnerToken, async (req, res) => {
    try {
        // First find the gym owner
        const gymOwner = await GymOwner.findById(req.owner.id);
        if (!gymOwner) {
            return res.status(404).json({ message: "Gym owner not found." });
        }

        // Fetch all users (clients)
        const clients = await User.find()
            .select("username email phoneNumber height weight dateOfBirth workoutDaysPerWeek goal sex profilePicture subscription")
            .populate('subscription')
            .lean();  // Convert to plain JavaScript objects for better performance

        if (!clients) {
            return res.status(404).json({ message: "No clients found." });
        }

        res.status(200).json({
            count: clients.length,
            clients: clients
        });
    } catch (error) {
        console.error("Error fetching clients:", error);
        res.status(500).json({ message: "Error fetching clients.", error: error.message });
    }
});

// Add a client to managed clients
router.post("/clients/add/:clientId", verifyGymOwnerToken, async (req, res) => {
    try {
        const { clientId } = req.params;
        
        // Validate clientId
        if (!mongoose.isValidObjectId(clientId)) {
            return res.status(400).json({ message: "Invalid client ID format." });
        }
        
        // Check if client exists
        const client = await User.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found." });
        }
        
        const owner = await GymOwner.findById(req.owner.id);
        if (!owner) {
            return res.status(404).json({ message: "Gym Owner not found." });
        }
        
        // Check if client is already managed
        if (owner.managedClients.includes(clientId)) {
            return res.status(400).json({ message: "Client is already being managed." });
        }
        
        // Add client to managed clients
        owner.managedClients.push(clientId);
        await owner.save();
        
        // Update client's gymOwnerId
        client.gymOwnerId = owner._id;
        await client.save();
        
        res.status(200).json({ message: "Client added to management successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Error adding client.", error: error.message });
    }
});

router.get("/unpaid-clients", verifyGymOwnerToken, verifyGymOwner, asyncHandler(async (req, res) => {
    try {
        // Get all bookings that haven't been paid for
        const unpaidBookings = await Booking.find({
            paymentStatus: { $ne: "paid" },
            sessionTime: { $lt: new Date() } // Only past sessions
        }).populate('clientId', 'username email');

        // Get all pending cash payments
        const pendingPayments = await Payment.find({
            status: "pending",
            method: "cash"
        }).populate('clientId', 'username email');

        // Get all clients with active subscriptions that have unpaid amounts
        const subscriptions = await Subscription.find({
            status: "active",
            paymentInfo: { $exists: true, $ne: null }
        }).populate('clientId', 'username email');

        // Combine all unpaid clients
        const unpaidClientsMap = new Map();

        // Add clients from unpaid bookings
        unpaidBookings.forEach(booking => {
            if (booking.clientId) {
                unpaidClientsMap.set(booking.clientId._id.toString(), {
                    _id: booking.clientId._id,
                    username: booking.clientId.username,
                    email: booking.clientId.email,
                    balanceDue: 50, // Default session fee
                    type: 'unpaid_booking'
                });
            }
        });

        // Add clients with pending payments
        pendingPayments.forEach(payment => {
            if (payment.clientId) {
                const existing = unpaidClientsMap.get(payment.clientId._id.toString());
                if (existing) {
                    existing.balanceDue += payment.amount;
                } else {
                    unpaidClientsMap.set(payment.clientId._id.toString(), {
                        _id: payment.clientId._id,
                        username: payment.clientId.username,
                        email: payment.clientId.email,
                        balanceDue: payment.amount,
                        type: 'pending_payment'
                    });
                }
            }
        });

        // Add clients with subscription payments due
        subscriptions.forEach(sub => {
            if (sub.clientId && sub.amountPaid === 0) {
                const existing = unpaidClientsMap.get(sub.clientId._id.toString());
                if (existing) {
                    existing.balanceDue += sub.amountPaid;
                } else {
                    unpaidClientsMap.set(sub.clientId._id.toString(), {
                        _id: sub.clientId._id,
                        username: sub.clientId.username,
                        email: sub.clientId.email,
                        balanceDue: sub.amountPaid,
                        type: 'subscription_payment'
                    });
                }
            }
        });

        // Convert map to array
        const unpaidClients = Array.from(unpaidClientsMap.values());

        res.status(200).json(unpaidClients);
    } catch (error) {
        console.error("Error fetching unpaid clients:", error);
        res.status(500).json({ 
            message: "Error fetching unpaid clients.", 
            error: error.message 
        });
    }
}));


// Gym Owner Accepts Cash Payment
router.post("/accept-cash-payment", verifyGymOwnerToken, verifyGymOwner, async (req, res) => {
    try {
        const { clientId, amount } = req.body;

        // Check client exists (using User model directly)
        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });

        // Ensure amount doesn't exceed balance due
        if (amount > client.balanceDue) {
            return res.status(400).json({ message: "Payment exceeds balance due." });
        }

        // Reduce client balance
        client.balanceDue -= amount;
        await client.save();

        // Record payment
        const newPayment = new Payment({
            clientId,
            amount,
            paymentMethod: "cash",
            status: "completed",
            description: "Cash payment"
        });
        await newPayment.save();

        res.status(200).json({ message: "Cash payment accepted successfully!", payment: newPayment });
    } catch (error) {
        res.status(500).json({ message: "Error processing cash payment.", error: error.message });
    }
});


// Remove a Client from Management
router.delete("/clients/remove/:clientId", verifyGymOwnerToken, async (req, res) => {
    try {
        const { clientId } = req.params;
        
        if (!mongoose.isValidObjectId(clientId)) {
            return res.status(400).json({ message: "Invalid client ID format." });
        }
        
        const owner = await GymOwner.findById(req.owner.id);
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        // Remove client from managed clients
        owner.managedClients = owner.managedClients.filter((id) => id.toString() !== clientId);
        await owner.save();
        
        // Update client's gymOwnerId to null
        await User.findByIdAndUpdate(clientId, { gymOwnerId: null });

        res.status(200).json({ message: "Client removed successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Error removing client.", error: error.message });
    }
});

// Change gym owner password
router.put("/change-password", verifyGymOwnerToken, verifyGymOwner, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const ownerId = req.owner.id;

    // Find gym owner
    const owner = await GymOwner.findById(ownerId);
    if (!owner) {
      return res.status(404).json({ message: "Gym owner not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, owner.pin);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    owner.pin = hashedPassword;
    await owner.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Error changing password", error: error.message });
  }
});

module.exports = router;