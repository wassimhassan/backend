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

// Gym Owner Views All Subscriptions (including pending)
router.get("/track", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        // Find the gym owner
        const gymOwner = await GymOwner.findById(req.user.id);
        if (!gymOwner) {
            return res.status(404).json({ message: "Gym owner not found" });
        }

        // Find all subscriptions, including pending, active, and canceled
        const subscriptions = await Subscription.find({ gymOwnerId: req.user.id })
            .populate({
                path: 'clientId',
                select: 'username email phoneNumber'
            })
            .sort({ renewalDate: 1 }); // Sort by renewal date

        if (!subscriptions || subscriptions.length === 0) {
            return res.status(200).json([]);
        }

        res.status(200).json(subscriptions);
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
        res.status(500).json({ 
            message: "Error fetching subscriptions.", 
            error: error.message 
        });
    }
});

// ✅ Approve Subscription
router.put("/approve/:id", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        // Check if the subscription is in pending status
        if (subscription.status !== "pending") {
            return res.status(400).json({ message: "Subscription is not pending." });
        }

        // Set required fields for approval
        subscription.status = "active";
        
        // Set payment information (you can adjust the amount if needed)
        subscription.paymentInfo = {
            date: new Date(), // Set current date as payment date
            amount: 0, // Adjust as needed
            method: "cash", // Assume cash payment for now
            transactionId: `APPROVE-${Date.now()}`,
            status: "completed"
        };

        // Set the gym owner ID
        subscription.gymOwnerId = req.user.id;

        // Update the renewal date (set it to the end date for renewal)
        subscription.renewalDate = new Date(subscription.endDate); // Set to the end date

        // Save the updated subscription
        await subscription.save();

        res.status(200).json({ 
            message: "Subscription approved successfully!",
            subscription
        });

    } catch (error) {
        console.error("Error approving subscription:", error);
        res.status(500).json({ 
            message: "Error approving subscription.", 
            error: error.message 
        });
    }
});

// ✅ Cancel Subscription
router.put("/cancel/:id", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        // Set required fields for cancellation
        subscription.status = "canceled";
        subscription.amountPaid = subscription.amountPaid || 0; // Ensure amountPaid is set
        subscription.endDate = new Date(); // Set end date to now
        subscription.paymentInfo = {
            date: new Date(), // Set the current date as the payment date
            amount: 0, // Set amount to 0 for cancellation (or set an appropriate value if needed)
            method: "cash", // Payment method for cancellation
            transactionId: `CANCEL-${Date.now()}`,
            status: "completed"
        };
        subscription.gymOwnerId = req.user.id; // Set the gym owner ID (if needed)

        // Set renewalDate to null since subscription is canceled
        subscription.renewalDate = null; // Set renewalDate to null for canceled subscriptions

        await subscription.save();

        // Update the client's subscription status
        const client = await User.findById(subscription.clientId);
        if (client) {
            client.subscriptionStatus = "canceled";
            await client.save();
        }

        // Create a cancellation record
        const cancellation = new Payment({
            clientId: subscription.clientId,
            amount: 0,
            method: "cash",
            transactionId: `CANCEL-${Date.now()}`,
            status: "completed",
            type: "subscription_cancellation",
            paymentMethod: "cash", // Add paymentMethod
            description: "Subscription Cancellation" // Add description
        });
        
        await cancellation.save();
        
        res.status(200).json({ 
            message: "Subscription canceled successfully!",
            subscription
        });
    } catch (error) {
        console.error("Error canceling subscription:", error);
        res.status(500).json({ 
            message: "Error canceling subscription.", 
            error: error.message 
        });
    }
});

// ✅ Renew Subscription
router.put("/renew/:id", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { 
            endDate = new Date(new Date().setMonth(new Date().getMonth() + 1)), // Default to 1 month from now
            amountPaid = 0,
            method = "cash",  // Default to cash
            transactionId = "N/A",
            description = "Subscription Renewal"  // Add default description
        } = req.body;

        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        // Create payment record for the renewal
        const payment = new Payment({
            clientId: subscription.clientId,
            amount: amountPaid,
            method, // This is passed to 'paymentMethod'
            transactionId,
            status: "completed",
            description,  // Add description here
            paymentMethod: method  // Map the 'method' field to 'paymentMethod'
        });

        const savedPayment = await payment.save();

        // Update client and gym owner payment records
        const client = await User.findById(subscription.clientId);
        const owner = await GymOwner.findById(req.user.id);

        if (client) {
            if (!client.payments) client.payments = [];
            client.payments.push(savedPayment._id);
            await client.save();
        }

        if (owner) {
            if (!owner.payments) owner.payments = [];
            owner.payments.push(savedPayment._id);
            await owner.save();
        }

        // Update subscription
        subscription.startDate = new Date();
        subscription.endDate = new Date(endDate);
        subscription.renewalDate = new Date(endDate);  // Update renewalDate to new endDate
        subscription.status = "active";
        subscription.amountPaid = amountPaid;
        subscription.paymentInfo = {
            date: new Date(), // Payment date for renewal
            amount: amountPaid,
            method,
            transactionId,
            status: "completed"
        };
        subscription.gymOwnerId = req.user.id; // Set the gym owner ID

        await subscription.save();

        res.status(200).json({ 
            message: "Subscription renewed successfully!",
            subscription
        });

    } catch (error) {
        console.error("Error renewing subscription:", error);
        res.status(500).json({ 
            message: "Error renewing subscription.", 
            error: error.message 
        });
    }
});

// Clients Can Purchase Subscriptions
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

        // 🔹 Create a new subscription with pending status
        const newSubscription = new Subscription({
            clientId: client._id,
            planType,
            startDate: new Date(),  // Set the current date as the start date
            endDate: new Date(endDate),
            renewalDate: new Date(),  // Set the renewal date to the same date as the activation date (startDate)
            status: method === "cash" ? "pending" : "active",  // Cash requires gym owner approval
            amountPaid: 0,  // Payment is recorded separately
            paymentInfo: {
                method, 
                transactionId: finalTransactionId, 
                date: new Date(),  // Set the current date as the payment date
                amount: 0  // Payment amount (you can adjust this logic if needed)
            },
            sessionDiscount,
            maxBookingsPerMonth,
            gymOwnerId: req.user.id  // Set gymOwnerId to the logged-in gym owner's ID
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

// Get All Active Subscriptions (for Gym Owner)
router.get("/active-subscriptions", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const now = new Date();
        
        // Find all active subscriptions that haven't expired
        const activeSubscriptions = await Subscription.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        })
        .populate({
            path: "clientId",
            select: "username email phoneNumber profilePicture"
        })
        .sort({ endDate: 1 }) // Sort by end date, soonest first
        .lean();

        // Add a "daysRemaining" field to each subscription
        const subscriptionsWithDaysRemaining = activeSubscriptions.map(sub => {
            const daysRemaining = Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24));
            return {
                ...sub,
                daysRemaining
            };
        });

        res.status(200).json({
            count: subscriptionsWithDaysRemaining.length,
            subscriptions: subscriptionsWithDaysRemaining
        });
    } catch (error) {
        console.error("Error fetching active subscriptions:", error);
        res.status(500).json({ 
            message: "Error fetching active subscriptions.", 
            error: error.message 
        });
    }
});

// Get All Subscriptions (including expired and pending)
router.get("/all-subscriptions", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { status, sortBy = 'endDate', order = 'asc' } = req.query;
        
        // Build query based on filters
        let query = {};
        if (status) {
            query.status = status;
        }

        // Get all subscriptions with filtering and sorting
        const subscriptions = await Subscription.find(query)
            .populate({
                path: "clientId",
                select: "username email phoneNumber profilePicture"
            })
            .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
            .lean();

        const now = new Date();
        const enrichedSubscriptions = subscriptions.map(sub => ({
            ...sub,
            daysRemaining: sub.status === 'active' ? 
                Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24)) : 
                0
        }));

        res.status(200).json({
            count: enrichedSubscriptions.length,
            subscriptions: enrichedSubscriptions
        });
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
        res.status(500).json({ 
            message: "Error fetching subscriptions.", 
            error: error.message 
        });
    }
});
module.exports = router;