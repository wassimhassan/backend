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

router.post("/stripe", verifyToken, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount, paymentMethodId, bookingId } = req.body;
        const clientId = req.user.id;

        // Validate the amount is greater than or equal to 0.50 USD
        const MINIMUM_CHARGE_AMOUNT = 50; // 50 cents, in cents (Stripe accepts amounts in cents)
        const paymentAmount = Math.max(amount * 100, MINIMUM_CHARGE_AMOUNT); // Convert to cents and ensure min value

        if (paymentAmount < MINIMUM_CHARGE_AMOUNT) {
            return res.status(400).json({
                message: `Amount must be at least 50 cents. You are trying to pay ${amount}.`
            });
        }

        // Get the client
        const client = await User.findById(clientId).session(session);
        if (!client) throw new Error("Client not found.");

        // If bookingId is provided, verify the booking exists
        let booking = null;
        if (bookingId) {
            booking = await Booking.findById(bookingId).session(session);
            if (!booking) {
                throw new Error("Booking not found.");
            }

            // Verify that the booking belongs to this client
            if (booking.clientId.toString() !== clientId) {
                throw new Error("This booking does not belong to you.");
            }
        }

        // Calculate amount due (if needed, example logic to check outstanding amount)
        const amountDue = await getOutstandingGymPayments(clientId).catch(err => {
            console.error("Error getting outstanding payments:", err);
            return 0; // Default to 0 if there's an error
        });

        if (!amountDue || isNaN(amountDue) || amountDue <= 0) {
            return res.status(409).json({
                message: "No outstanding amount to charge."
            });
        }

        // Create paymentIntent with the finalAmount
        const paymentIntent = await stripe.paymentIntents.create({
            amount: paymentAmount, // Charge in cents
            currency: 'usd', // Example currency
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never" // Disable redirects to ensure no redirect-based payment methods
            }
        });

        console.log("PaymentIntent:", paymentIntent);

        // Ensure paymentIntent has a charge and data is accessible
        if (!paymentIntent || !paymentIntent.latest_charge) {
            throw new Error("Payment failed: No charge information available.");
        }

        // Fetch the charge using the latest charge ID
        const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

        if (!charge) {
            throw new Error("Payment failed: Charge could not be retrieved.");
        }

        // Record the payment
        await updateClientBalance(clientId, paymentAmount / 100); // Convert back to dollars for client balance update

        const newPayment = new Payment({
            clientId,
            amount: paymentAmount / 100, // Convert back to dollars
            paymentMethod: "credit_card",
            description: bookingId ? "Payment for training session" : "Stripe payment",
            status: "completed",
            receiptUrl: charge.receipt_url || "Receipt URL not available."
        });

        await newPayment.save({ session });

        // Update booking payment status if payment is for booking
        if (booking) {
            booking.paymentStatus = "paid";
            booking.paymentMethod = "creditCard";
            await booking.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        // Get updated client balance after payment
        const updatedAmountDue = await getOutstandingGymPayments(clientId);

        res.status(200).json({
            message: "Payment successful!",
            amountPaid: paymentAmount / 100,
            clientBalance: updatedAmountDue,
            clientSecret: paymentIntent.client_secret,
            bookingUpdated: bookingId ? true : false
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