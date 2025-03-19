// routes/paymentRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Payment = require("../models/Payment");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const asyncHandler = require("express-async-handler");


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

        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });

        if (amount > client.balanceDue) {
            return res.status(400).json({ message: "Payment exceeds the due amount." });
        }

        const newPayment = new Payment({
            clientId,
            amount,
            method
        });

        await newPayment.save();

        // ✅ Reduce balance when payment is made
        client.balanceDue -= amount;
        await client.save();

        res.status(201).json({ message: "Payment recorded successfully!", payment: newPayment });
    } catch (error) {
        res.status(500).json({ message: "Error adding payment.", error: error.message });
    }
});


// Process Stripe Payment
router.post("/stripe", verifyToken, async (req, res) => {
    try {
        const { amount, paymentMethodId } = req.body;
        const clientId = req.user.id;

        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });

        if (amount > client.balanceDue) {
            return res.status(400).json({ message: "Payment exceeds due balance." });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to cents
            currency: "usd",
            payment_method: paymentMethodId,
            confirm: true, // Immediately confirm the payment
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never" // Prevent redirect-based payments
            }
        });

        res.status(200).json({
            message: "Payment successful!",
            clientSecret: paymentIntent.client_secret
        });
    } catch (error) {
        res.status(500).json({
            message: "Payment failed.",
            error: error.message
        });
    }
});


// Confirm Stripe Payment
router.post("/confirm-stripe", verifyToken, async (req, res) => {
    try {
        const { paymentIntentId } = req.body;
        const clientId = req.user.id;

        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });

        // Retrieve payment intent from Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
            // Store payment details in the database
            const newPayment = new Payment({
                clientId,
                amount: paymentIntent.amount / 100, // Convert to dollars
                method: "stripe",
                transactionId: paymentIntent.id
            });

            await newPayment.save();

            // ✅ Reduce balance when payment is made
            client.balanceDue -= newPayment.amount;
            await client.save();

            res.status(201).json({
                message: "Payment confirmed and stored successfully!",
                payment: newPayment
            });
        } else {
            res.status(400).json({ message: "Payment not yet completed." });
        }
    } catch (error) {
        res.status(500).json({
            message: "Error confirming payment.",
            error: error.message
        });
    }
});

//client views their payments
router.get("/payments/history", verifyToken, async (req, res) => {
    try {
        const payments = await Payment.find({ clientId: req.user.id })
            .sort({ paymentDate: -1 });

        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Error fetching payment history.", error: error.message });
    }
});

// Update Client Payment Route
router.put("/update-payment/:clientId", verifyToken, asyncHandler(async (req, res) => {
    console.log("Received update-payment request for client:", req.params.clientId);
    console.log("Request body:", req.body);

    try {
        const { clientId } = req.params;
        const { amountPaid } = req.body;

        if (!amountPaid || amountPaid <= 0) {
            return res.status(400).json({ message: "Invalid payment amount." });
        }

        const client = await User.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found." });
        }

        console.log("Before update - balanceDue:", client.balanceDue);

        client.balanceDue -= amountPaid;
        if (client.balanceDue < 0) client.balanceDue = 0;

        await client.save();

        console.log("After update - balanceDue:", client.balanceDue);

        res.status(200).json({ message: "Payment updated successfully.", client });
    } catch (error) {
        console.error("Update payment error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
}));


module.exports = router;