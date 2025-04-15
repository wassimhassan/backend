const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    sets: { type: Number, required: true, min: 1 },
    reps: { type: Number, required: true, min: 1 },
    duration: { type: String, trim: true }, // e.g., "30s", "2min"
    rest: { type: String, trim: true }, // e.g., "30s", "1min"
    notes: { type: String, trim: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date }
});

const clientProgressSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    exercises: [{
        exerciseId: { type: mongoose.Schema.Types.ObjectId, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        setsCompleted: { type: Number, default: 0 }
    }],
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    startedAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
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
    createdAt: { type: Date, default: Date.now },
    clientProgress: [clientProgressSchema]
});

// Method to mark an exercise as completed for a specific client
workoutPlanSchema.methods.markExerciseCompleted = async function(clientId, exerciseIndex) {
    const clientProgress = this.clientProgress.find(progress => 
        progress.clientId.toString() === clientId.toString()
    );

    if (!clientProgress) {
        // Initialize progress for new client
        this.clientProgress.push({
            clientId,
            exercises: this.exercises.map((_, index) => ({
                exerciseId: this.exercises[index]._id,
                completed: index === exerciseIndex,
                completedAt: index === exerciseIndex ? new Date() : null,
                setsCompleted: index === exerciseIndex ? this.exercises[index].sets : 0
            }))
        });
    } else {
        // Update existing progress
        const exercise = clientProgress.exercises[exerciseIndex];
        exercise.completed = true;
        exercise.completedAt = new Date();
        exercise.setsCompleted = this.exercises[exerciseIndex].sets;
        clientProgress.lastUpdated = new Date();

        // Check if all exercises are completed
        const allExercisesCompleted = clientProgress.exercises.every(ex => ex.completed);
        if (allExercisesCompleted) {
            clientProgress.isCompleted = true;
            clientProgress.completedAt = new Date();
        }
    }

    await this.save();
    return this;
};

// Method to get progress for a specific client
workoutPlanSchema.methods.getClientProgress = function(clientId) {
    return this.clientProgress.find(progress => 
        progress.clientId.toString() === clientId.toString()
    );
};

const WorkoutPlan = mongoose.model('WorkoutPlan', workoutPlanSchema);

module.exports = WorkoutPlan;