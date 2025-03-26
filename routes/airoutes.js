const express = require("express");
const router = express.Router();

const { getUserData } = require("../services/userservices");
const { generateSuggestions } = require("../services/aiservices");

// ✅ Debug route to check if AI routes are working
router.get("/test", (req, res) => {
  res.send("✅ AI test route hit!");
});

// 🧠 Main AI Suggestions Route
router.post("/ai-suggestions", async (req, res) => {
  const { user_id: userId } = req.body;

  console.log("📦 Received user_id:", userId);
  console.log("📦 Full body:", req.body);

  if (!userId) {
    return res.status(400).json({ error: "Missing user_id in request body." });
  }

  try {
    const userData = await getUserData(userId);
    console.log("✅ Retrieved user data:", userData);

    const suggestions = await generateSuggestions(userData);
    console.log("✅ AI suggestions:", suggestions);

    res.json(suggestions);
  } catch (error) {
    console.error("❌ AI Suggestion Error:", error.response?.data || error.message || error);
    console.error("❌ Full stack:", error.stack);
    res.status(500).json({ error: "Failed to generate suggestions." });
  }
});

module.exports = router;

 
