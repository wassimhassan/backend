const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    sets: { type: Number, required: true, min: 1 },
    reps: { type: Number, required: true, min: 1 },
    duration: { type: String, trim: true }, // e.g., "30s", "2min"
    rest: { type: String, trim: true }, // e.g., "30s", "1min"
    notes: { type: String, trim: true }
});

const workoutPlanSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    exercises: {
        type: [exerciseSchema],
        validate: [
            {
                validator: function (arr) {
                    return arr.length > 0;
                },
                message: "A workout plan must have at least one exercise."
            }
        ]
    },
    assignedClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Trainer', required: true },
    createdAt: { type: Date, default: Date.now }
});

const WorkoutPlan = mongoose.model('WorkoutPlan', workoutPlanSchema);

module.exports = WorkoutPlan;