
const mongoose = require("mongoose");
const BookingSchema = new mongoose.Schema({
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionTime: { type: Date, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" }
}, { timestamps: true });

module.exports = mongoose.model("Booking", BookingSchema);