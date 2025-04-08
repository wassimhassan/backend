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
            .populate("clientId", "username email phoneNumber");

        res.status(200).json(payments);
    } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ message: "Error fetching payments.", error: error.message });
    }
});

// Get payment history (works for both clients and gym owners)
router.get('/history', verifyToken, async (req, res) => {
    try {
        let payments;
        let totalPending = 0;

        if (req.user.role === 'gymOwner') {
            // For gym owner: get all payments they manage
            const owner = await GymOwner.findById(req.user.id);
            if (!owner) {
                return res.status(404).json({ message: "Gym Owner not found." });
            }
            
            payments = await Payment.find({ _id: { $in: owner.payments } })
                .populate("clientId", "username email phoneNumber")
                .sort({ date: -1 });

        } else {
            // For clients: get their own payments
            payments = await Payment.find({ clientId: req.user.id })
                .sort({ date: -1 });

            // Calculate total pending for clients only
            const pendingResult = await Payment.aggregate([
                { 
                    $match: { 
                        clientId: new mongoose.Types.ObjectId(req.user.id), 
                        status: 'pending' 
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        total: { $sum: '$amount' } 
                    } 
                }
            ]);

            totalPending = pendingResult.length > 0 ? pendingResult[0].total : 0;
        }

        // Format the response based on user role
        const formattedPayments = payments.map(payment => ({
            _id: payment._id,
            date: payment.date,
            description: payment.description || 'Payment',  // Provide default description
            amount: payment.amount,
            status: payment.status || 'completed',  // Provide default status
            receiptUrl: payment.receiptUrl,
            // Include client details only for gym owner view
            ...(req.user.role === 'gymOwner' && {
                client: payment.clientId ? {
                    username: payment.clientId.username,
                    email: payment.clientId.email,
                    phoneNumber: payment.clientId.phoneNumber
                } : null
            })
        }));

        res.json({
            payments: formattedPayments,
            totalPending,
            userRole: req.user.role
        });

    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ 
            message: 'Error fetching payment history', 
            error: error.message 
        });
    }
});

// Process Stripe Payment
router.post("/stripe", verifyToken, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
        const { amount, paymentMethodId, bookingId } = req.body;
        const clientId = req.user.id;
  
        // Get the client
        const client = await User.findById(clientId).session(session);
        if (!client) throw new Error("Client not found.");
  
        // Check subscription & booking usage
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
  
        // Create Stripe paymentIntent
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
  
        // Save payment & update balance
        await updateClientBalance(clientId, amount);
  
        const newPayment = new Payment({
            clientId,
            amount,
            paymentMethod: "credit_card",
            description: "Stripe payment",
            status: "completed",
            receiptUrl: paymentIntent.charges.data[0]?.receipt_url
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

// Update payment status
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { status, receiptUrl } = req.body;
        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { status, receiptUrl },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        res.json(payment);
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ message: 'Error updating payment status' });
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

const updateClientBalance = async (clientId, amount) => {
    try {
        const client = await User.findById(clientId);
        if (!client) throw new Error("Client not found");
        
        // Get current amount due
        const currentAmountDue = await getOutstandingGymPayments(clientId);
        
        // Calculate new balance (never go below zero)
        const newBalance = Math.max(0, currentAmountDue - amount);
        
        // Update client balance
        client.balanceDue = newBalance;
        await client.save();
        
        return client;
    } catch (error) {
        console.error("Error updating client balance:", error);
        throw error;
    }
};

module.exports = router;