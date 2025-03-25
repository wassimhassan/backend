const express = require("express");
const router = express.Router();
const { getUserData } = require("../services/userService");
const { generateSuggestions } = require("../services/aiService");

router.post("/ai-suggestions", async (req, res) => {
  const { user_id: userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing user_id in request body." });
  }

  try {
    const userData = await getUserData(userId);
    const suggestions = await generateSuggestions(userData);
    res.json(suggestions);
  } catch (error) {
    console.error("AI Suggestion Error:", error.message);
    res.status(500).json({ error: "Failed to generate suggestions." });
  }
});

module.exports = router;