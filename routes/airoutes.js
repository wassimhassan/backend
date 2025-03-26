router.post("/ai-suggestions", async (req, res) => {
    const { user_id: userId } = req.body;
  
    console.log("📦 Received user_id:", userId);
    console.log("📦 Full body:", req.body);
  
    if (!userId) {
      return res.status(400).json({ error: "Missing user_id in request body." });
    }
  
    try {
      const userData = await getUserData(userId);
      const suggestions = await generateSuggestions(userData);
      res.json(suggestions);
    } catch (error) {
      console.error("AI Suggestion Error:", error.response?.data || error.message || error);
      res.status(500).json({ error: "Failed to generate suggestions." });
    }
  });
  
