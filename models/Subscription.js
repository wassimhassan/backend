const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    planType: { type: String, enum: ["basic", "premium", "pro"], required: true },
    startDate: { type: Date, default: Date.now },
    renewalDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "canceled", "pending"], default: "active" },
    amountPaid: { type: Number, required: true },
    paymentInfo: {
        method: { type: String, enum: ["stripe", "paypal", "cash", "credit_card", "bank_transfer"], required: true },
        transactionId: { type: String }
    }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", SubscriptionSchema);

