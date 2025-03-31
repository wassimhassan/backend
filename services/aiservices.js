const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateSuggestions(userData) {
  const prompt = `
User data: ${JSON.stringify(userData, null, 2)}

Please provide your response in the following format. Make sure to include all three sections with at least a brief description for each:

1. Workout Plan: [Your workout plan here]
2. Nutrition Plan: [Your nutrition plan here]
3. Progress Tracking: [Your progress tracking strategy here]
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 300  // increased token limit for a more complete response
  });

  const aiResponse = completion.choices[0].message.content;

  // Extract sections using regex capturing groups
  const workoutMatch = aiResponse.match(/1\.\s*Workout Plan:\s*([\s\S]*?)(?=2\.\s*Nutrition Plan:)/);
  const nutritionMatch = aiResponse.match(/2\.\s*Nutrition Plan:\s*([\s\S]*?)(?=3\.\s*Progress Tracking:)/);
  const progressMatch = aiResponse.match(/3\.\s*Progress Tracking:\s*([\s\S]*)/);

  return {
    workout: workoutMatch ? workoutMatch[1].trim() : "",
    nutrition: nutritionMatch ? nutritionMatch[1].trim() : "",
    progress: progressMatch ? progressMatch[1].trim() : ""
  };
}

module.exports = { generateSuggestions };


