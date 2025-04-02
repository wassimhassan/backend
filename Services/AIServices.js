const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY 
});

async function generateSuggestions(userData) {
  // Validate OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing in environment variables");
  }

  // Create a more structured prompt
  const prompt = `
User data:
- Username: ${userData.username || 'Not provided'}
- Height: ${userData.height || 'Not provided'}
- Weight: ${userData.weight || 'Not provided'} 
- Age: ${userData.dateOfBirth ? calculateAge(userData.dateOfBirth) : 'Not provided'}
- Goal: ${userData.goal || 'Not provided'}
- Sex: ${userData.sex || 'Not provided'}
- Workout days per week: ${userData.workoutDaysPerWeek || 'Not provided'}

Please provide your response in the following format. Make sure to include all three sections with at least a brief description for each:

1. Workout Plan: [Your workout plan here]
2. Nutrition Plan: [Your nutrition plan here]
3. Progress Tracking: [Your progress tracking strategy here]
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 500  // increased token limit for a more complete response
    });

    const aiResponse = completion.choices[0].message.content;

    // More robust parsing with fallbacks
    const workoutMatch = aiResponse.match(/1\.\s*Workout Plan:\s*([\s\S]*?)(?=2\.\s*Nutrition Plan:|$)/i);
    const nutritionMatch = aiResponse.match(/2\.\s*Nutrition Plan:\s*([\s\S]*?)(?=3\.\s*Progress Tracking:|$)/i);
    const progressMatch = aiResponse.match(/3\.\s*Progress Tracking:\s*([\s\S]*)/i);

    return {
      workout: workoutMatch ? workoutMatch[1].trim() : "Unable to generate workout plan",
      nutrition: nutritionMatch ? nutritionMatch[1].trim() : "Unable to generate nutrition plan",
      progress: progressMatch ? progressMatch[1].trim() : "Unable to generate progress tracking"
    };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    // Return fallback content instead of throwing
    return {
      workout: "Could not generate workout plan. Please try again later.",
      nutrition: "Could not generate nutrition plan. Please try again later.",
      progress: "Could not generate progress tracking. Please try again later."
    };
  }
}

// Helper function to calculate age from date of birth
function calculateAge(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

module.exports = { generateSuggestions };