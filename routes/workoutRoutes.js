const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const WorkoutPlan = require('../models/WorkoutPlan');
const Trainer = require('../models/Trainer');
const Client = require("../models/User");

const router = express.Router();

/* -------------------------------------------
 🔐 Auth Middleware (Trainer or Client)
-------------------------------------------- */
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === "trainer") {
      req.user = await Trainer.findById(decoded.id).select("-password");
    } else if (decoded.role === "client") {
      req.user = await Client.findById(decoded.id).select("-password");
    } else {
      return res.status(403).json({ error: "Unauthorized role" });
    }

    if (!req.user) return res.status(401).json({ error: "Invalid token, user not found" });

    next();
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
  }
};

/* -------------------------------------------
 🟢 CREATE Workout Plan [POST /workouts]
-------------------------------------------- */
router.post(
  '/',
  authMiddleware,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('exercises').isArray({ min: 1 }).withMessage('At least one exercise is required'),
    body('exercises.*.name').notEmpty().withMessage('Exercise name is required'),
    body('exercises.*.sets').isInt({ min: 1 }).withMessage('Sets must be at least 1'),
    body('exercises.*.reps').isInt({ min: 1 }).withMessage('Reps must be at least 1'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const trainerId = req.user.id;
      const { title, description, exercises, assignedClients } = req.body;

      const clientIds = assignedClients?.map(clientId =>
        mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : null
      ).filter(id => id !== null);

      const newWorkoutPlan = new WorkoutPlan({
        title,
        description,
        exercises,
        assignedClients: clientIds,
        createdBy: trainerId,
      });

      await newWorkoutPlan.save();
      res.status(201).json(newWorkoutPlan);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/* -------------------------------------------
 🔵 GET All Workout Plans [GET /workouts]
-------------------------------------------- */
router.get('/', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
  
      let workoutPlans = [];
  
      if (req.user.role === "trainer") {
        // Trainer gets workouts they created
        workoutPlans = await WorkoutPlan.find({ createdBy: userId });
      } else if (req.user.role === "client") {
        // Client gets workouts assigned to them
        workoutPlans = await WorkoutPlan.find({ assignedClients: userId });
      }
  
      res.status(200).json(workoutPlans);
    } catch (err) {
      res.status(500).json({ error: 'Server error', detail: err.message });
    }
  });
  

/* -------------------------------------------
 🔍 GET One Workout Plan [GET /workouts/:id]
-------------------------------------------- */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid workout plan ID' });
    }

    const plan = await WorkoutPlan.findById(id);
    if (!plan) return res.status(404).json({ error: 'Workout plan not found' });

    // Only creator can view their own plan
    if (plan.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.status(200).json(plan);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* -------------------------------------------
 ✏️ UPDATE Plan [PUT /workouts/:id]
-------------------------------------------- */
router.put(
  '/:id',
  authMiddleware,
  [
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('exercises').optional().isArray({ min: 1 }).withMessage('At least one exercise is required'),
    body('exercises.*.name').optional().notEmpty().withMessage('Exercise name is required'),
    body('exercises.*.sets').optional().isInt({ min: 1 }).withMessage('Sets must be at least 1'),
    body('exercises.*.reps').optional().isInt({ min: 1 }).withMessage('Reps must be at least 1'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { id } = req.params;
      const trainerId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid workout plan ID' });
      }

      const workoutPlan = await WorkoutPlan.findById(id);
      if (!workoutPlan) return res.status(404).json({ error: 'Workout plan not found' });

      if (workoutPlan.createdBy.toString() !== trainerId) {
        return res.status(403).json({ error: 'Unauthorized to update this workout plan' });
      }

      const updatedPlan = await WorkoutPlan.findByIdAndUpdate(id, req.body, { new: true });
      res.status(200).json(updatedPlan);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/* -------------------------------------------
 ❌ DELETE Workout Plan [DELETE /workouts/:id]
-------------------------------------------- */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const trainerId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid workout plan ID' });
    }

    const workoutPlan = await WorkoutPlan.findById(id);
    if (!workoutPlan) return res.status(404).json({ error: 'Workout plan not found' });

    if (workoutPlan.createdBy.toString() !== trainerId) {
      return res.status(403).json({ error: 'Unauthorized to delete this workout plan' });
    }

    await workoutPlan.deleteOne();
    res.status(200).json({ message: 'Workout plan deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
