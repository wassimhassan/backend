const User = require("../models/User");
const mongoose = require("mongoose");

async function getUserData(userId) {
  try {
    console.log("🔍 Attempting to find user with ID:", userId);
    
    // Validate userId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("❌ Invalid MongoDB ObjectId format:", userId);
      throw new Error(`Invalid user ID format: ${userId}`);
    }

    // First try to find by direct ID
    let user = await User.findById(userId);
    
    // If not found, try to find by _id as string
    if (!user) {
      console.log("⚠️ User not found by direct ID, trying string comparison...");
      user = await User.findOne({ _id: userId.toString() });
    }
    
    // If still not found, try to find by a custom 'userId' field if it exists
    if (!user) {
      console.log("⚠️ User not found by _id, trying 'userId' field...");
      user = await User.findOne({ userId: userId.toString() });
    }

    if (!user) {
      console.error("❌ User not found with any method");
      throw new Error(`User not found with ID: ${userId}`);
    }

    console.log("✅ User found:", user.username || user.email || user._id);

    // Return data with null/undefined handling
    return {
      username: user.username || "Anonymous",
      email: user.email || "Not provided",
      height: user.height || "Not provided",
      weight: user.weight || "Not provided",
      dateOfBirth: user.dateOfBirth || null,
      phoneNumber: user.phoneNumber || "Not provided",
      workoutDaysPerWeek: user.workoutDaysPerWeek || 0,
      goal: user.goal || "Not specified",
      sex: user.sex || "Not specified",
      profilePicture: user.profilePicture || null
    };
  } catch (error) {
    console.error("❌ getUserData error:", error.message);
    throw error; // Re-throw to be handled by the route
  } 
}

// Add a test function to verify DB connection and schema
async function testUserService() {
  try {
    console.log("🧪 Testing user service...");
    
    // Check if we can connect to the database
    const connectionState = mongoose.connection.readyState;
    const connectionStatus = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting"
    }[connectionState];
    
    console.log(`📡 MongoDB connection status: ${connectionStatus} (${connectionState})`);
    
    if (connectionState !== 1) {
      throw new Error("MongoDB is not connected!");
    }
    
    // Check User model schema
    const userSchema = User.schema.obj;
    console.log("📋 User schema:", Object.keys(userSchema));
    
    // Try to get total user count
    const totalUsers = await User.countDocuments();
    console.log(`👥 Total users in database: ${totalUsers}`);
    
    // Try to get a sample user (first in collection)
    const sampleUser = await User.findOne().lean();
    
    if (sampleUser) {
      console.log("✅ Sample user found:");
      console.log("🆔 ID:", sampleUser._id);
      console.log("👤 Username:", sampleUser.username);
      console.log("📧 Email:", sampleUser.email);
      console.log("🔑 ID fields:", Object.keys(sampleUser).filter(key => key.toLowerCase().includes('id')));
    } else {
      console.log("⚠️ No users found in the database");
    }
    
    return {
      success: true,
      connectionStatus,
      userSchema: Object.keys(userSchema),
      totalUsers,
      sampleUserId: sampleUser ? sampleUser._id : null,
      idFields: sampleUser ? Object.keys(sampleUser).filter(key => key.toLowerCase().includes('id')) : []
    };
  } catch (error) {
    console.error("❌ Test failed:", error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

module.exports = { getUserData, testUserService };