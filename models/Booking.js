// models/Booking.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const BookingSchema = new Schema({
    trainerId: {
        type: Schema.Types.ObjectId,
        ref: "Trainer",
        required: true
    },
    clientId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    sessionTime: {
        type: Date,
        required: true
    },
    // Add these required fields to match your validation
    date: {
        type: String,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ["cash", "creditCard", "subscription", "inPerson"],
        default: "cash"
    },
    status: {
        type: String,
        enum: ["pending", "confirmed", "canceled", "completed"],
        default: "pending"
    },
    completed: {
        type: Boolean,
        default: false
    },
    notes: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Booking", BookingSchema);