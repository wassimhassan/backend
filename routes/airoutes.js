const express = require("express");
const jwt = require("jsonwebtoken");  // Add this line to import the JWT library
const router = express.Router();

const { getUserData, testUserService } = require("../Services/userservices");
const { generateSuggestions } = require("../Services/AIServices");

// ✅ Debug route to check if AI routes are working
router.get("/test", (req, res) => {
  res.send("✅ AI test route hit!");
});

// 🧠 Database test route
router.get("/test-db", async (req, res) => {
  try {
    const testResults = await testUserService();
    res.json(testResults);
  } catch (error) {
    res.status(500).json({
      error: "Database test failed",
      message: error.message,
      stack: error.stack
    });
  }
});

// 🧠 User lookup test by ID
router.get("/test-user/:userId", async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const userData = await getUserData(userId);
    res.json({
      success: true,
      message: "User found",
      userData
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// 🧠 Main AI Suggestions Route
// 🧠 Main AI Suggestions Route
router.post("/ai-suggestions", async (req, res) => {
  // 🧠 Extract the token from the Authorization header
  const token = req.headers['authorization']?.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: "Authorization token is missing" });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("📦 Decoded token:", decoded);
    
    // Try to extract user ID from various possible fields
    const userId = decoded.userId || decoded.id || decoded.user_id;

    if (!userId) {
      return res.status(400).json({ 
        error: "Missing user ID in token", 
        decoded: decoded // Log what's actually in the token
      });
    }

    console.log("📦 Using user ID:", userId);

    // Get user data with error handling
    let userData;
    try {
      userData = await getUserData(userId);
      console.log("✅ Retrieved user data:", userData);
    } catch (userError) {
      console.error("❌ User data retrieval error:", userError.message);
      return res.status(404).json({ error: "Could not retrieve user data. Please check if the user ID is valid." });
    }

    // Generate suggestions with error handling
    let suggestions;
    try {
      suggestions = await generateSuggestions(userData);
      console.log("✅ AI suggestions generated successfully");
    } catch (aiError) {
      console.error("❌ AI Suggestion Generation Error:", aiError.message);
      return res.status(500).json({ 
        error: "Could not generate suggestions",
        message: "There was an issue with the AI service. Please try again later."
      });
    }

    res.json(suggestions);

  } catch (error) {
    console.error("❌ Token verification error:", error.message);
    res.status(401).json({ 
      error: "Invalid or expired token",
      message: "Please log in again."
    });
  }
});

module.exports = router;
