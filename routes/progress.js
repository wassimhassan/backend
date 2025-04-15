const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Progress = require('../models/Progress');
const User = require('../models/User');

// Embedded auth middleware 👇
const authenticate = async (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach full user info if needed (from DB) or minimal decoded payload
    const user = await User.findById(decoded.id || decoded._id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    req.user = {
      _id: user._id.toString(),
      role: user.role || 'client',
    };

    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Apply auth middleware to all routes
router.use(authenticate);

// Save user's workout progress
router.post('/save', async (req, res) => {
  try {
    const { userId, completedExercises, completedWorkouts, timestamp } = req.body;

    // Better validation
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!completedExercises || !completedWorkouts) {
      return res.status(400).json({ error: 'Progress data is incomplete' });
    }

    // Compare stringified IDs to be safe
    if (req.user._id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to save progress for other users' });
    }

    const progress = await Progress.findOneAndUpdate(
      { userId },
      {
        userId,
        completedExercises,
        completedWorkouts,
        timestamp: timestamp || new Date(),
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, progress });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Server error while saving progress', details: error.message });
  }
});

// Get user's workout progress
router.get('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (req.user._id !== userId && req.user.role !== 'admin' && req.user.role !== 'trainer') {
      return res.status(403).json({ error: 'Not authorized to access this user\'s progress' });
    }

    const progress = await Progress.findOne({ userId });

    if (!progress) {
      return res.status(404).json({ error: 'No progress found for this user' });
    }

    res.json(progress);
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Server error while fetching progress' });
  }
});

// Get progress statistics for a user
router.get('/stats/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (req.user._id !== userId && req.user.role !== 'admin' && req.user.role !== 'trainer') {
      return res.status(403).json({ error: 'Not authorized to access this user\'s stats' });
    }

    const progress = await Progress.findOne({ userId });

    if (!progress) {
      return res.status(404).json({ error: 'No progress found for this user' });
    }

    const completedExercisesCount = Object.values(progress.completedExercises).filter(Boolean).length;
    const totalExercisesCount = Object.keys(progress.completedExercises).length;

    const completedWorkoutsCount = Object.values(progress.completedWorkouts).filter(Boolean).length;
    const totalWorkoutsCount = Object.keys(progress.completedWorkouts).length;

    const stats = {
      exerciseCompletionRate: totalExercisesCount > 0 ? (completedExercisesCount / totalExercisesCount) * 100 : 0,
      workoutCompletionRate: totalWorkoutsCount > 0 ? (completedWorkoutsCount / totalWorkoutsCount) * 100 : 0,
      completedExercisesCount,
      totalExercisesCount,
      completedWorkoutsCount,
      totalWorkoutsCount,
      lastUpdated: progress.timestamp || progress.updatedAt,
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching progress stats:', error);
    res.status(500).json({ error: 'Server error while fetching progress stats' });
  }
});

module.exports = router;