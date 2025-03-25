const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

async function generateSuggestions(userData) {
  const prompt = `
User data: ${JSON.stringify(userData, null, 2)}

Based on the above information, provide:
1. A personalized workout plan
2. A nutrition plan
3. A brief progress tracking strategy
`;

  const completion = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  const aiResponse = completion.data.choices[0].message.content;

  return {
    workout: aiResponse.match(/1\..*?(?=2\.|$)/s)?.[0].trim() || "No workout plan generated.",
    nutrition: aiResponse.match(/2\..*?(?=3\.|$)/s)?.[0].trim() || "No nutrition plan generated.",
    progress: aiResponse.match(/3\..*/s)?.[0].trim() || "No progress strategy generated."
  };
}

module.exports = { generateSuggestions };
