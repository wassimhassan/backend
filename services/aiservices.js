const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateSuggestions(userData) {
  const prompt = `
User data: ${JSON.stringify(userData, null, 2)}

Based on the above information, provide:
1. A personalized workout plan
2. A nutrition plan
3. A brief progress tracking strategy
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  const aiResponse = completion.choices[0].message.content;

  return {
    workout: aiResponse.match(/1\..*?(?=2\.|$)/s)?.[0].trim() || "",
    nutrition: aiResponse.match(/2\..*?(?=3\.|$)/s)?.[0].trim() || "",
    progress: aiResponse.match(/3\..*/s)?.[0].trim() || ""
  };
}

module.exports = { generateSuggestions };
