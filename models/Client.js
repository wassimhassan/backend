const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  height: {
    type: Number,
    required: true
  },
  weight: {
    type: Number,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  fitnessGoals: [{
    type: String
  }],
  medicalConditions: [{
    type: String
  }],
  preferredWorkoutTimes: [{
    type: String
  }],
  balanceDue: {
    type: Number,
    default: 0
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subscription"
  }
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema); 