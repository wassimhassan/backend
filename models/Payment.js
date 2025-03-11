const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    method: {
        type: String,
        enum: ["cash", "credit_card", "bank_transfer", "stripe", "paypal"],
        required: true
    },
    transactionId: { type: String },
    paymentDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Payment", PaymentSchema);