const mongoose = require("mongoose");

const GymOwnerSchema = new mongoose.Schema({
    ownerName: { type: String, required: true },
    phoneNumber: { type: String, unique: true, required: true },
    pin: { type: String, required: true }, // Hashed 4-digit PIN for login
    managedClients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payment" }],
    subscriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subscription" }]
}, { timestamps: true });

module.exports = mongoose.model("GymOwner", GymOwnerSchema);
