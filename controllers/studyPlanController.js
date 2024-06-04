import Profile from "../model/Profile.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import StudyPlan from "../model/StudyPlan.js";

// Access your API key as an environment variable (see "Set up your API key" above)
const genAI = new GoogleGenerativeAI("AIzaSyAFG0VZGbfseglWD3XMSxVLelAq63AS2yk");
// ...

// The Gemini 1.5 models are versatile and work with both text-only and multimodal prompts
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const generateStudyPlan = async (req, res) => {
  const { email } = req.body;
  try {
    const foundStudyPlan = await StudyPlan.findOne({ email }).exec();
    // Generate prompt based on user profile data
    if (foundStudyPlan) return res.status(200).json(foundStudyPlan.studyPlan);

    const profileData = await Profile.findOne({ email }).exec();
    if (!profileData)
      return res.status(400).json({ message: "Profile not filled yet." });
    const subjects = profileData.subjects.map((subject) => subject.value);
    const preferredTimes = profileData.preferredStudyTimes.map(
      (time) => time.value
    );
    const availableDays = profileData.availableStudyDays.map(
      (day) => day.value
    );
    const timeAvailability = Object.entries(profileData.timeAvailability).map(
      (key) => `${key[0]}: ${key[1].join("-")}`
    );
    const prompt = `
Generate a personalized study plan for the following user:
- Subjects: ${subjects.join(", ")}
- short-term Goals: ${profileData.shortTermGoals}
- long-term Goals: ${profileData.longTermGoals}
- Preferred Study Times: ${preferredTimes.join(", ")}
- study session duration: ${profileData.studySessionDuration}
- study session break frequency: ${profileData.breakFrequency}
- Learning Style: ${profileData.learningStyle}
- days available for study: ${availableDays.join(", ")}
- time available for each study day: ${timeAvailability.join(", ")}

Provide a detailed study plan for one week, including study sessions, breaks, and tips.
`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    // Extract generated study plan from the response
    const studyPlan = response.text();
    // store the studyPlan in db
    await StudyPlan.create({
      email,
      studyPlan,
    });
    // Respond with the generated study plan
    res.status(200).json(studyPlan);
  } catch (error) {
    console.error("Error generating study plan:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export { generateStudyPlan };

// const prompt = `
// Generate a personalized study plan for the following user:
// - Subjects: ${subjects.join(", ")}
// - short-term Goals: ${profileData.shortTermGoals}
// - long-term Goals: ${profileData.longTermGoals}
// - Preferred Study Times: ${preferredTimes.join(", ")}
// - study session duration: ${profileData.studySessionDuration}
// - study session break frequency: ${profileData.breakFrequency}
// - Learning Style: ${profileData.learningStyle}
// - days available for study: ${availableDays.join(", ")}
// - time available for each study day: ${timeAvailability.join(", ")}

// Provide a detailed study plan for one week, including study sessions, breaks, and tips.
// `;
