const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending'
    },
    isCompleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Add index for better query performance
bookingSchema.index({ trainerId: 1 });
bookingSchema.index({ clientId: 1 });
bookingSchema.index({ date: 1 });

module.exports = mongoose.model("Booking", bookingSchema);