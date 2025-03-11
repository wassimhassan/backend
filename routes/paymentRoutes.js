// routes/paymentRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Payment = require("../models/Payment");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Middleware: Verify token
const verifyToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid or expired token." });
    }
};

// Verify gym owner
const verifyGymOwner = (req, res, next) => {
    if (req.user.role !== "gymOwner") {
        return res.status(403).json({ message: "Access restricted to gym owners." });
    }
    next();
};

// Get All Payments (for Gym Owner)
router.get("/", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const owner = await GymOwner.findById(req.user.id);
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        const payments = await Payment.find({ _id: { $in: owner.payments } })
            .populate("clientId", "username phoneNumber email");

        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Error fetching payments.", error: error.message });
    }
});

// Add a Payment Record
router.post("/add", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { clientId, amount, method } = req.body;

        // Validate clientId format
        if (!mongoose.isValidObjectId(clientId)) {
            return res.status(400).json({ message: "Invalid clientId format." });
        }

        // Check if client exists
        const client = await User.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found." });
        }

        // Check if method is valid
        const validMethods = ["cash", "credit_card", "bank_transfer", "stripe", "paypal"];
        if (!validMethods.includes(method)) {
            return res.status(400).json({ 
                message: `Invalid payment method. Choose from ${validMethods.join(", ")}` 
            });
        }

        const owner = await GymOwner.findById(req.user.id);
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        // Create new payment record
        const newPayment = new Payment({
            clientId: clientId,
            amount,
            method
        });

        const savedPayment = await newPayment.save();

        // Add payment reference to Gym Owner's records
        owner.payments.push(savedPayment._id);
        await owner.save();

        // Add payment reference to Client's records
        client.payments.push(savedPayment._id);
        await client.save();

        res.status(201).json({ 
            message: "Payment recorded successfully!",
            payment: savedPayment
        });
    } catch (error) {
        res.status(500).json({ message: "Error adding payment.", error: error.message });
    }
});

// Process Stripe Payment
router.post("/stripe", async (req, res) => {
    try {
        const { amount, currency, description } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to cents
            currency,
            description,
            payment_method_types: ["card"],
        });

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.status(500).json({ message: "Payment failed.", error: error.message });
    }
});

module.exports = router;