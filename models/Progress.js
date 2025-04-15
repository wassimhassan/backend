// models/Progress.js
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  completedExercises: {
    type: Map,
    of: Boolean,
    default: {}
  },
  completedWorkouts: {
    type: Map,
    of: Boolean,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create unique compound index on userId to ensure one progress record per user
progressSchema.index({ userId: 1 }, { unique: true });

const Progress = mongoose.model('Progress', progressSchema);

module.exports = Progress;