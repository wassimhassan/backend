// routes/subscriptionRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Subscription = require("../models/Subscription");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const Payment = require("../models/Payment");
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

// Get All Subscriptions (for Gym Owner)
router.get("/", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const owner = await GymOwner.findById(req.user.id);
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        const subscriptions = await Subscription.find({ _id: { $in: owner.subscriptions } })
            .populate("clientId", "username phoneNumber email");

        res.status(200).json(subscriptions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching subscriptions.", error: error.message });
    }
});

// Add a New Subscription
router.post("/add", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { 
            clientId, 
            planType, 
            endDate, 
            amountPaid, 
            method,
            transactionId
        } = req.body;

        // Validate input
        if (!mongoose.isValidObjectId(clientId)) {
            return res.status(400).json({ message: "Invalid client ID." });
        }
        
        // Check if client exists
        const client = await User.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found." });
        }

        // Check if planType is valid
        if (!["basic", "premium", "pro"].includes(planType)) {
            return res.status(400).json({ message: "Invalid plan type." });
        }

        // Check if payment method is valid
        const validMethods = ["cash", "credit_card", "bank_transfer", "stripe", "paypal"];
        if (!validMethods.includes(method)) {
            return res.status(400).json({ 
                message: `Invalid payment method. Choose from ${validMethods.join(", ")}` 
            });
        }

        const owner = await GymOwner.findById(req.user.id);
        if (!owner) return res.status(404).json({ message: "Gym Owner not found." });

        // Check if the client already has an active subscription
        const existingSubscription = await Subscription.findOne({ 
            clientId, 
            status: "active" 
        });
        
        if (existingSubscription) {
            return res.status(400).json({ 
                message: "Client already has an active subscription." 
            });
        }

        // Create payment record for the subscription
        const payment = new Payment({
            clientId,
            amount: amountPaid,
            method,
            transactionId
        });
        
        const savedPayment = await payment.save();
        
        // Add payment to gym owner and client records
        owner.payments.push(savedPayment._id);
        client.payments.push(savedPayment._id);

        // Create new subscription
        const newSubscription = new Subscription({
            clientId,
            planType,
            startDate: new Date(),
            endDate: new Date(endDate),
            renewalDate: new Date(endDate),
            status: "active",
            amountPaid,
            paymentInfo: { 
                method,
                transactionId
            }
        });

        const savedSubscription = await newSubscription.save();
        
        // Add subscription to gym owner's records
        owner.subscriptions.push(savedSubscription._id);
        await owner.save();
        
        // Update client's subscription
        client.subscription = savedSubscription._id;
        await client.save();

        res.status(201).json({ 
            message: "Subscription created successfully!",
            subscription: savedSubscription
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Error adding subscription.", 
            error: error.message 
        });
    }
});

// Cancel a Subscription
router.put("/cancel/:id", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        subscription.status = "canceled";
        await subscription.save();
        
        res.status(200).json({ 
            message: "Subscription canceled successfully!" 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Error canceling subscription.", 
            error: error.message 
        });
    }
});

// Renew a Subscription
router.put("/renew/:id", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { 
            endDate, 
            amountPaid, 
            method,
            transactionId
        } = req.body;
        
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        // Create payment record for the renewal
        const payment = new Payment({
            clientId: subscription.clientId,
            amount: amountPaid,
            method,
            transactionId
        });
        
        const savedPayment = await payment.save();
        
        // Update client and gym owner payment records
        const client = await User.findById(subscription.clientId);
        const owner = await GymOwner.findById(req.user.id);
        
        if (client) {
            client.payments.push(savedPayment._id);
            await client.save();
        }
        
        if (owner) {
            owner.payments.push(savedPayment._id);
            await owner.save();
        }
        
        // Update subscription
        subscription.startDate = new Date();
        subscription.endDate = new Date(endDate);
        subscription.renewalDate = new Date(endDate);
        subscription.status = "active";
        subscription.amountPaid = amountPaid;
        subscription.paymentInfo = {
            method,
            transactionId
        };
        
        await subscription.save();
        
        res.status(200).json({ 
            message: "Subscription renewed successfully!",
            subscription
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Error renewing subscription.", 
            error: error.message 
        });
    }
});

module.exports = router;