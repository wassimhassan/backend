const User = require("../models/User");

async function getUserData(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  return {
    name: user.name,
    goal: user.goal,
    height: user.height,
    weight: user.weight,
    workoutHistory: user.workoutHistory,
    preferences: user.preferences
  };
}

  