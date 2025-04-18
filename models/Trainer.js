// models/Trainer.js
const mongoose = require("mongoose");

const TrainerSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  experience: { type: String, default: "" },
  certifications: { type: [String], default: [] },
  specialties: { type: [String], default: [] },
  phoneNumber: { type: String, default: "" },
  height: { type: Number, default: 0 }, // cm
  weight: { type: Number, default: 0 }, // kg
  dateOfBirth: { type: Date, default: null },
  sex: { type: String, enum: ["male", "female", ""] },
  sessionPrice: { type: Number, default: 0 }, // Default session price
availability: [{
    day: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    price: { type: Number, default: 0 },
    fullDate: { type: String } // Add this new field
  }]
}, { timestamps: true });

module.exports = mongoose.model("Trainer", TrainerSchema);