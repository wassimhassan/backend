// routes/gymOwnerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
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

// Client Management Routes

// Get All Clients
router.get("/clients", verifyGymOwnerToken, async (req, res) => {
    try {
        // Fetch all users who signed up (assuming all users are clients)
        const clients = await User.find().select("-password"); // Exclude password for security

        if (!clients || clients.length === 0) {
            return res.status(404).json({ message: "No clients found." });
        }

        res.status(200).json(clients);
    } catch (error) {
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
        const unpaidClients = await User.find({ balanceDue: { $gt: 0 } })  // Only users with due balance
            .select("username email balanceDue");

        res.status(200).json(unpaidClients);
    } catch (error) {
        res.status(500).json({ message: "Error fetching unpaid clients.", error: error.message });
    }
}));


// ✅ Gym Owner Accepts Cash Payment
router.post("/accept-cash-payment", verifyGymOwnerToken, verifyGymOwner, async (req, res) => {
    try {
        const { clientId, amount } = req.body;

        // Check client exists
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
            method: "cash",
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

module.exports = router;