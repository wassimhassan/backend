// models/Booking.js
const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trainer",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sessionTime: {
      type: Date,
      required: true,
    },
    // These fields are not required but will be set automatically
    date: {
      type: String,
      required: false,
    },
    time: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "canceled", "completed"],
      default: "pending",
    },
    completed: {
      type: Boolean,
      default: false
    },
    paymentMethod: {
      type: String,
      enum: ["inPerson", "creditCard", "subscription"],
      default: "inPerson",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to ensure date and time are set
BookingSchema.pre('save', function(next) {
  if (this.sessionTime) {
    // Set date field to YYYY-MM-DD format
    const date = new Date(this.sessionTime);
    this.date = date.toISOString().split('T')[0];
    
    // Set time field to HH:MM:SS format
    this.time = date.toTimeString().split(' ')[0];
  }
  next();
});

module.exports = mongoose.model("Booking", BookingSchema);