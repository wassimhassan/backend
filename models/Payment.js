const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",  // Changed from "Client" to "User"
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending"
    },
    paymentMethod: {
        type: String,
        enum: ["credit_card", "subscription", "cash"],
        required: true
    },
    receiptUrl: {
        type: String
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Payment", paymentSchema);