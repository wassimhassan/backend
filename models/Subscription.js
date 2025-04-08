const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    gymOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "GymOwner", required: true },
    planType: { type: String, required: true, enum: ["basic", "premium", "elite"] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, required: true, enum: ["active", "expired", "canceled"], default: "active" },
    paymentInfo: {
        amount: { type: Number, required: true },
        method: { type: String, required: true },
        transactionId: { type: String, required: true },
        date: { type: Date, required: true }
    },
    sessionsRemaining: { type: Number, required: true, default: 0 },
    totalSessions: { type: Number, required: true, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
