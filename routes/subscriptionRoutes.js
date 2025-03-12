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

// ✅ Define Subscription Benefits
const SUBSCRIPTION_BENEFITS = {
    basic: { sessionDiscount: 5, maxBookingsPerMonth: 8 },
    premium: { sessionDiscount: 10, maxBookingsPerMonth: 15 },
    pro: { sessionDiscount: 15, maxBookingsPerMonth: 25 }
};

// ✅ Clients Can Purchase Subscriptions
router.post("/purchase", verifyToken, async (req, res) => {
    try {
        const { planType, endDate, method, transactionId } = req.body;
        const client = await User.findById(req.user.id);

        if (!client) return res.status(404).json({ message: "Client not found." });
        if (!SUBSCRIPTION_BENEFITS[planType]) return res.status(400).json({ message: "Invalid subscription plan." });

        const { sessionDiscount, maxBookingsPerMonth } = SUBSCRIPTION_BENEFITS[planType];

        // Create a new subscription
        const newSubscription = new Subscription({
            clientId: client._id,
            planType,
            startDate: new Date(),
            endDate: new Date(endDate),
            renewalDate: new Date(endDate),
            status: method === "cash" ? "pending" : "active",  // If cash, gym owner must approve
            amountPaid: 0,  // Payment is recorded separately
            paymentInfo: { method, transactionId },
            sessionDiscount,
            maxBookingsPerMonth
        });

        await newSubscription.save();
        client.subscription = newSubscription._id;
        await client.save();

        res.status(201).json({ message: "Subscription requested successfully!", subscription: newSubscription });
    } catch (error) {
        res.status(500).json({ message: "Error purchasing subscription.", error: error.message });
    }
});

// ✅ Gym Owner Views All Subscriptions
router.get("/track", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const subscriptions = await Subscription.find()
            .populate("clientId", "username email phoneNumber");

        res.status(200).json(subscriptions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching subscriptions.", error: error.message });
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

// ✅ Clients Can Purchase Subscriptions
router.post("/purchase", verifyToken, async (req, res) => {
    try {
        const { planType, endDate, method, transactionId } = req.body;
        const client = await User.findById(req.user.id);

        if (!client) return res.status(404).json({ message: "Client not found." });
        if (!SUBSCRIPTION_BENEFITS[planType]) return res.status(400).json({ message: "Invalid subscription plan." });

        const { sessionDiscount, maxBookingsPerMonth } = SUBSCRIPTION_BENEFITS[planType];

        // Create a new subscription
        const newSubscription = new Subscription({
            clientId: client._id,
            planType,
            startDate: new Date(),
            endDate: new Date(endDate),
            renewalDate: new Date(endDate),
            status: method === "cash" ? "pending" : "active",  // If cash, gym owner must approve
            amountPaid: 0,  // Payment is recorded separately
            paymentInfo: { method, transactionId },
            sessionDiscount,
            maxBookingsPerMonth
        });

        await newSubscription.save();
        client.subscription = newSubscription._id;
        await client.save();

        res.status(201).json({ message: "Subscription requested successfully!", subscription: newSubscription });
    } catch (error) {
        res.status(500).json({ message: "Error purchasing subscription.", error: error.message });
    }
});


module.exports = router;