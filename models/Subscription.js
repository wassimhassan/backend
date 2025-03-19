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
        method: { 
            type: String, 
            enum: ["stripe", "cash", "credit_card"],  
        },
        transactionId: { 
            type: String, 
            required: function() { return this.method !== "cash"; }  //  Required only for online methods
        },
        paymentDate: { 
            type: Date, 
            default: Date.now  
        },
        status: { 
            type: String, 
            enum: ["pending", "completed", "failed"], 
            default: "pending" 
        }
    },
    sessionDiscount: { type: Number, default: 0 },
    maxBookingsPerMonth: { type: Number, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
