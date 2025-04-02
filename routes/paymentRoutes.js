// routes/paymentRoutes.js 
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Payment = require("../models/Payment");
const GymOwner = require("../models/GymOwner");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const Booking = require("../models/Booking");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { getOutstandingGymPayments } = require("../utils/paymentUtils");

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

        const amountToCharge = await getOutstandingGymPayments(clientId);
        
        if (amount > amountToCharge) {
            return res.status(400).json({ message: "Payment exceeds the due amount." });
        }

        const newPayment = new Payment({
            clientId,
            amount,
            method
        });

        await newPayment.save();

        res.status(201).json({ message: "Payment recorded successfully!", payment: newPayment });
    } catch (error) {
        res.status(500).json({ message: "Error adding payment.", error: error.message });
    }
});

// Process Stripe Payment
router.post("/stripe", verifyToken, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
        const { amount, paymentMethodId, bookingId } = req.body;
        const clientId = req.user.id;
  
        // ✅ STEP 1: Get the client
        const client = await User.findById(clientId).session(session);
        if (!client) throw new Error("Client not found.");
  
        // ✅ STEP 2: CHECK subscription & booking usage BEFORE charging Stripe
        const activeSubscription = await Subscription.findOne({
            clientId,
            status: "active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        });
  
        if (activeSubscription) {
            const { maxBookingsPerMonth } = activeSubscription;
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  
            const bookingCount = await Booking.countDocuments({
                clientId,
                sessionTime: { $gte: startOfMonth, $lte: endOfMonth }
            });
  
            if (bookingCount < maxBookingsPerMonth) {
                throw new Error("You have an active subscription with unused bookings. No payment required.");
            }
        }
  
        // ✅ STEP 4: Create Stripe paymentIntent
        const amountDue = await getOutstandingGymPayments(clientId);

        if (!amountDue || isNaN(amountDue) || amountDue <= 0) {
          return res.status(409).json({ 
            message: "No outstanding amount to charge." 
          });
        }
        
        const finalAmount = Math.round(Math.min(amount, amountDue) * 100);
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: finalAmount,
            currency: "usd",
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never"
            }
        });
  
        // ✅ STEP 5: Save payment & update balance
        await updateClientBalance(clientId, amount);
  
        const newPayment = new Payment({
            clientId,
            amount,
            method: "stripe",
            transactionId: paymentIntent.id,
            status: "completed",
            bookingId: bookingId || null // Optional: link payment to a session
        });
  
        await newPayment.save({ session });
  
        await session.commitTransaction();
        session.endSession();
  
        // Get updated amount due after payment
        const updatedAmountDue = await getOutstandingGymPayments(clientId);
  
        res.status(200).json({
            message: "Payment successful!",
            amountPaid: amount,
            clientBalance: updatedAmountDue,
            clientSecret: paymentIntent.client_secret
        });
  
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
  
        console.error("❌ Payment Failed:", error.message);
  
        res.status(500).json({
            message: error.message.includes("No payment required")
                ? error.message
                : "Payment failed.",
            error: error.message
        });
    }
});  

// ✅ **Confirm Stripe Payment (Ensures Correct Deduction from DB)**
router.post("/confirm-stripe", verifyToken, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { paymentIntentId } = req.body;
        const clientId = req.user.id;

        const client = await User.findById(clientId).session(session);
        if (!client) throw new Error("Client not found.");

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
            const newPayment = new Payment({
                clientId,
                amount: paymentIntent.amount / 100,
                method: "stripe",
                transactionId: paymentIntent.id,
                status: "completed"
            });

            await newPayment.save({ session });

            // Update client balance
            await updateClientBalance(clientId, newPayment.amount);

            // Get updated amount due
            const updatedAmountDue = await getOutstandingGymPayments(clientId);

            await session.commitTransaction();
            session.endSession();

            console.log(`✅ Payment Confirmed. New Balance: $${updatedAmountDue}`);

            res.status(201).json({
                message: "Payment confirmed and stored successfully!",
                payment: newPayment
            });

        } else {
            throw new Error("Payment not yet completed.");
        }
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("❌ Error Confirming Payment:", error.message);

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
    try {
        const { clientId } = req.params;
        const { amountPaid } = req.body;

        if (!amountPaid || amountPaid <= 0) {
            return res.status(400).json({ message: "Invalid payment amount." });
        }

        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });

        // Get current amount due before update
        const currentAmountDue = await getOutstandingGymPayments(clientId);
        console.log(`🔹 Before Update: Client Balance: $${currentAmountDue}`);

        // Update the client balance
        await updateClientBalance(clientId, amountPaid);
        
        // Get the updated amount due
        const updatedAmountDue = await getOutstandingGymPayments(clientId);
        console.log(`✅ After Update: Client Balance: $${updatedAmountDue}`);

        res.status(200).json({ 
            message: "Payment updated successfully.", 
            amountDue: updatedAmountDue 
        });
    } catch (error) {
        console.error("❌ Update payment error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
}));

const updateClientBalance = async (clientId, amount) => {
    try {
        const client = await User.findById(clientId);
        if (!client) throw new Error("Client not found");
        
        // Update client account in database
        // This function should coordinate with getOutstandingGymPayments
        // to ensure consistency in how balances are tracked
        
        // Get current amount due
        const currentAmountDue = await getOutstandingGymPayments(clientId);
        
        // Calculate new balance (never go below zero)
        const newBalance = Math.max(0, currentAmountDue - amount);
        
        // Update whatever tracking mechanism is used by getOutstandingGymPayments
        // This might involve updating the User model or another tracking system
        client.balanceDue = newBalance;
        await client.save();
        
        return client;
    } catch (error) {
        console.error("Error updating client balance:", error);
        throw error;
    }
};

router.post("/add", verifyToken, verifyGymOwner, async (req, res) => {
    try {
        const { clientId, amount, method } = req.body;
        
        // Check if client exists
        const client = await User.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client not found." });
        
        // Get outstanding amount and validate payment
        const amountToCharge = await getOutstandingGymPayments(clientId);
        
        if (!amountToCharge || isNaN(amountToCharge) || amountToCharge <= 0) {
            return res.status(409).json({ message: "No outstanding amount to charge." });
        }
        
        if (amount > amountToCharge) {
            return res.status(400).json({ message: "Payment exceeds the due amount." });
        }
        
        const newPayment = new Payment({
            clientId,
            amount,
            method
        });

        await newPayment.save();
        
        // Use the utility function to update balance
        await updateClientBalance(clientId, amount);

        // Get updated balance after payment
        const updatedBalance = await getOutstandingGymPayments(clientId);

        res.status(201).json({ 
            message: "Payment recorded successfully!", 
            payment: newPayment,
            remainingBalance: updatedBalance
        });
    } catch (error) {
        res.status(500).json({ message: "Error adding payment.", error: error.message });
    }
});

// Client checks outstanding amount
router.get("/amount-due", verifyToken, async (req, res) => {
    try {
        const clientId = req.user.id;
        const amountDue = await getOutstandingGymPayments(clientId);
        res.status(200).json({ amountDue });
    } catch (error) {
        res.status(500).json({ message: "Error calculating amount due.", error: error.message });
    }
});

module.exports = router;