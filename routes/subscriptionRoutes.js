// routes/subscriptionRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Subscription = require("../models/Subscription");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Plan = require("../models/Plan");
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

        // 🔹 Check if the user already has an active subscription
        const activeSubscription = await Subscription.findOne({
            clientId: client._id,
            status: "active",
            endDate: { $gte: new Date() }
        });

        if (activeSubscription) {
            return res.status(400).json({ message: "You already have an active subscription." });
        }

        // 🔹 Validate plan type
        if (!SUBSCRIPTION_BENEFITS[planType]) {
            return res.status(400).json({ message: "Invalid subscription plan." });
        }

        // 🔹 Validate endDate
        if (!endDate || new Date(endDate) <= new Date()) {
            return res.status(400).json({ message: "Please select a valid future date." });
        }

        // 🔹 Set default transactionId for cash payments
        const finalTransactionId = method === "cash" ? "N/A" : transactionId;

        // 🔹 Get Subscription Benefits
        const { sessionDiscount, maxBookingsPerMonth } = SUBSCRIPTION_BENEFITS[planType];

        // 🔹 Create a new subscription
        const newSubscription = new Subscription({
            clientId: client._id,
            planType,
            startDate: new Date(),
            endDate: new Date(endDate),
            renewalDate: new Date(endDate),
            status: method === "cash" ? "pending" : "active",  // Cash requires gym owner approval
            amountPaid: 0,  // Payment is recorded separately
            paymentInfo: { method, transactionId: finalTransactionId },
            sessionDiscount,
            maxBookingsPerMonth
        });

        console.log("✅ Creating Subscription:", newSubscription);
        await newSubscription.save();

        client.subscription = newSubscription._id;
        await client.save();

        console.log("✅ Subscription Successfully Saved.");
        return res.status(201).json({ message: "Subscription purchased successfully!", subscription: newSubscription });

    } catch (error) {
        console.error("❌ Error purchasing subscription:", error.message);
        return res.status(500).json({ message: "Error purchasing subscription.", error: error.message });
    }
});

router.get("/subscription-status", verifyToken, async (req, res) => {
    try {
        const clientId = req.user.id;
        const now = new Date();

        // Fetch active subscription
        const subscription = await Subscription.findOne({
            clientId,
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        if (!subscription) {
            return res.status(200).json({ hasActiveSubscription: false });
        }

        // Calculate start and end of the current month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Get bookings for the client with active subscription within this month
        const subscriptionBookings = await Booking.countDocuments({
            clientId,
            paymentMethod: "subscription",
            sessionTime: { $gte: startOfMonth, $lte: endOfMonth }
        });

        // Calculate remaining sessions
        const remainingSessions = subscription.maxBookingsPerMonth - subscriptionBookings;

        return res.status(200).json({
            hasActiveSubscription: true,
            subscription,
            remainingSessions
        });
    } catch (error) {
        console.error("❌ Error checking subscription status:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.get("/plans", async (req, res) => {
    try {
        const plans = await Plan.find();
        res.status(200).json(plans);
    } catch (error) {
        res.status(500).json({ message: "Error fetching plans.", error: error.message });
    }
});

module.exports = router;