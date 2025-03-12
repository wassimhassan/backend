const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    method: {
        type: String,
        enum: ["stripe", "cash", "credit_card"],  
        required: true
    },
    transactionId: { 
        type: String,
        required: function() { return this.method !== "cash"; }  // Required only for online methods
    },
    paymentDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" }
}, { timestamps: true });

module.exports = mongoose.model("Payment", PaymentSchema);
