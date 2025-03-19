const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const WorkoutPlan = require('../models/WorkoutPlan');
const Trainer = require('../models/Trainer');

const router = express.Router();

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
    const token = req.header('Authorization')?.split(" ")[1]; // Extract token

    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded Token:", decoded);  // Debugging: See if the token is properly decoded

        req.user = await Trainer.findById(decoded.id).select('-password');
        
        if (!req.user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        next();
    } catch (err) {
        console.error("Token verification error:", err.message);  // Debugging: Log token verification error
        res.status(401).json({ error: 'Token is not valid' });
    }
};


/**
 * @route   POST /workouts
 * @desc    Create a new workout plan
 * @access  Private (Trainers only)
 */
router.post(
    '/',
    authMiddleware,
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('description').notEmpty().withMessage('Description is required'),
        body('exercises').isArray({ min: 1 }).withMessage('At least one exercise is required'),
        body('exercises.*.name').notEmpty().withMessage('Exercise name is required'),
        body('exercises.*.sets').isInt({ min: 1 }).withMessage('Sets must be at least 1'),
        body('exercises.*.reps').isInt({ min: 1 }).withMessage('Reps must be at least 1')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const trainerId = req.user.id;
            const { title, description, exercises, assignedClients } = req.body;

            // ✅ Convert assignedClients to an array of valid ObjectIds
            const clientIds = assignedClients?.map(clientId => 
                mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : null
            ).filter(id => id !== null);

            const newWorkoutPlan = new WorkoutPlan({
                title,
                description,
                exercises,
                assignedClients: clientIds, // ✅ Store valid ObjectIds
                createdBy: trainerId
            });

            await newWorkoutPlan.save();
            res.status(201).json(newWorkoutPlan);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }
    }
);


/**
 * @route   GET /workouts
 * @desc    Get all workout plans created by the authenticated trainer
 * @access  Private (Trainers only)
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const trainerId = req.user.id;
        const workoutPlans = await WorkoutPlan.find({ createdBy: trainerId });

        res.status(200).json(workoutPlans);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route   PUT /workouts/:id
 * @desc    Update a workout plan (trainer-only)
 * @access  Private (Trainers only)
 */
router.put(
    '/:id',
    authMiddleware,
    [
        body('title').optional().notEmpty().withMessage('Title cannot be empty'),
        body('description').optional().notEmpty().withMessage('Description cannot be empty'),
        body('exercises').optional().isArray({ min: 1 }).withMessage('At least one exercise is required'),
        body('exercises.*.name').optional().notEmpty().withMessage('Exercise name is required'),
        body('exercises.*.sets').optional().isInt({ min: 1 }).withMessage('Sets must be at least 1'),
        body('exercises.*.reps').optional().isInt({ min: 1 }).withMessage('Reps must be at least 1')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const trainerId = req.user.id;
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ error: 'Invalid workout plan ID' });
            }

            let workoutPlan = await WorkoutPlan.findById(id);
            if (!workoutPlan) {
                return res.status(404).json({ error: 'Workout plan not found' });
            }

            if (workoutPlan.createdBy.toString() !== trainerId) {
                return res.status(403).json({ error: 'Unauthorized to update this workout plan' });
            }

            const updatedData = req.body;
            workoutPlan = await WorkoutPlan.findByIdAndUpdate(id, updatedData, { new: true });

            res.status(200).json(workoutPlan);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }
    }
);

/**
 * @route   DELETE /workouts/:id
 * @desc    Delete a workout plan (trainer-only)
 * @access  Private (Trainers only)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const trainerId = req.user.id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid workout plan ID' });
        }

        const workoutPlan = await WorkoutPlan.findById(id);
        if (!workoutPlan) {
            return res.status(404).json({ error: 'Workout plan not found' });
        }

        if (workoutPlan.createdBy.toString() !== trainerId) {
            return res.status(403).json({ error: 'Unauthorized to delete this workout plan' });
        }

        await workoutPlan.deleteOne();
        res.status(200).json({ message: 'Workout plan deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
