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
      req.user.role = "trainer"; // Ensure role is set
    } else if (decoded.role === "client") {
      req.user = await Client.findById(decoded.id).select("-password");
      req.user.role = "client"; // Ensure role is set
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
      // Check if user is a trainer
      if (req.user.role !== "trainer") {
        return res.status(403).json({ error: "Only trainers can create workout plans" });
      }

      const trainerId = req.user.id;
      const { title, description, exercises, assignedClients } = req.body;

      // Convert client IDs to ObjectIds and validate them
      const clientIds = assignedClients?.map(clientId =>
        mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : null
      ).filter(id => id !== null);

      const newWorkoutPlan = new WorkoutPlan({
        title,
        description,
        exercises,
        assignedClients: clientIds || [],
        createdBy: trainerId,
      });

      await newWorkoutPlan.save();
      res.status(201).json(newWorkoutPlan);
    } catch (err) {
      console.error("Create workout error:", err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

/* -------------------------------------------
 🔵 GET All Workout Plans [GET /workouts]
-------------------------------------------- */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`Fetching workouts for: ${userRole} with ID: ${userId}`);
    
    let workoutPlans = [];
    
    if (userRole === "trainer") {
      // Trainer gets workouts they created
      workoutPlans = await WorkoutPlan.find({ createdBy: userId });
    } else if (userRole === "client") {
      // Client gets workouts assigned to them
      workoutPlans = await WorkoutPlan.find({ 
        assignedClients: { $in: [userId] } 
      });
      
      console.log(`Found ${workoutPlans.length} plans for client ${userId}`);
    }
    
    res.status(200).json(workoutPlans);
  } catch (err) {
    console.error("Get all workouts error:", err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/* -------------------------------------------
 🔍 GET One Workout Plan [GET /workouts/:id]
-------------------------------------------- */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid workout plan ID' });
    }

    const plan = await WorkoutPlan.findById(id);
    if (!plan) return res.status(404).json({ error: 'Workout plan not found' });

    // Allow access if user is the creator OR if client is assigned to this plan
    const isCreator = plan.createdBy.toString() === userId;
    const isAssignedClient = plan.assignedClients.some(
      clientId => clientId.toString() === userId
    );

    if (!(isCreator || (userRole === 'client' && isAssignedClient))) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.status(200).json(plan);
  } catch (err) {
    console.error("Get one workout error:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
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
      const userRole = req.user.role;

      // Only trainers can update workout plans
      if (userRole !== "trainer") {
        return res.status(403).json({ error: 'Only trainers can update workout plans' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid workout plan ID' });
      }

      const workoutPlan = await WorkoutPlan.findById(id);
      if (!workoutPlan) return res.status(404).json({ error: 'Workout plan not found' });

      if (workoutPlan.createdBy.toString() !== trainerId) {
        return res.status(403).json({ error: 'Unauthorized to update this workout plan' });
      }

      // Handle assignedClients if present in the request
      if (req.body.assignedClients) {
        const clientIds = req.body.assignedClients.map(clientId =>
          mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : null
        ).filter(id => id !== null);
        
        req.body.assignedClients = clientIds;
      }

      const updatedPlan = await WorkoutPlan.findByIdAndUpdate(id, req.body, { new: true });
      res.status(200).json(updatedPlan);
    } catch (err) {
      console.error("Update workout error:", err);
      res.status(500).json({ error: 'Server error', details: err.message });
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
    const userRole = req.user.role;

    // Only trainers can delete workout plans
    if (userRole !== "trainer") {
      return res.status(403).json({ error: 'Only trainers can delete workout plans' });
    }

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
    console.error("Delete workout error:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/* -------------------------------------------
 ✅ Mark Exercise as Completed [PATCH /workouts/:id/exercises/:exerciseIndex]
-------------------------------------------- */
router.patch('/:id/exercises/:exerciseIndex', authMiddleware, async (req, res) => {
  try {
    const { id, exerciseIndex } = req.params;
    const clientId = req.user.id;

    if (req.user.role !== 'client') {
      return res.status(403).json({ error: 'Only clients can mark exercises as completed' });
    }

    const workoutPlan = await WorkoutPlan.findById(id);
    if (!workoutPlan) {
      return res.status(404).json({ error: 'Workout plan not found' });
    }

    // Check if client is assigned to this workout
    if (!workoutPlan.assignedClients.includes(clientId)) {
      return res.status(403).json({ error: 'You are not assigned to this workout plan' });
    }

    // Check if exercise index is valid
    if (exerciseIndex < 0 || exerciseIndex >= workoutPlan.exercises.length) {
      return res.status(400).json({ error: 'Invalid exercise index' });
    }

    // Mark exercise as completed
    await workoutPlan.markExerciseCompleted(clientId, parseInt(exerciseIndex));

    // Get updated progress
    const progress = workoutPlan.getClientProgress(clientId);

    res.status(200).json({
      message: 'Exercise marked as completed',
      progress,
      isWorkoutCompleted: progress.isCompleted
    });
  } catch (err) {
    console.error("Mark exercise completed error:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;