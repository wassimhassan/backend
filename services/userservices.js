const User = require("../models/User");

async function getUserData(userId) {
  try {
    console.log("🔍 Searching MongoDB for ID:", userId);
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      username: user.username,
      email: user.email,
      height: user.height,
      weight: user.weight,
      dateOfBirth: user.dateOfBirth,
      phoneNumber: user.phoneNumber,
      workoutDaysPerWeek: user.workoutDaysPerWeek,
      goal: user.goal,
      sex: user.sex,
      profilePicture: user.profilePicture
    };
  } catch (error) {
    console.error("getUserData error:", error.message);
    throw error;
  }
}

module.exports = { getUserData };
  