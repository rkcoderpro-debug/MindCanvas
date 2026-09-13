import { z } from "zod";
import { config } from "./config.js";
import { generateGeminiJson } from "./gemini.js";
import { parseLenientJson } from "./json.js";

export type StudyPlanCardSignal = {
  due: boolean;
  repetitions: number;
  lapses: number;
  intervalDays: number;
};

export type StudyPlanRecommendation = {
  dailyTarget: number;
  focus: "due" | "new" | "difficult" | "balanced";
  rationale: string;
};

const recommendationSchema = z.object({
  dailyTarget: z.number().int().min(1).max(500),
  focus: z.enum(["due", "new", "difficult", "balanced"]),
  rationale: z.string().trim().min(1).max(500),
});

export function parseStudyPlanRecommendation(text: string, availableCards: number): StudyPlanRecommendation {
  const parsed = recommendationSchema.parse(parseLenientJson(text));
  return {
    ...parsed,
    dailyTarget: Math.max(1, Math.min(50, availableCards, parsed.dailyTarget)),
  };
}

function promptFor(input: { cards: StudyPlanCardSignal[]; dailyMinutes: number; language: "vi" | "en" }) {
  const due = input.cards.filter(card => card.due).length;
  const newCards = input.cards.filter(card => card.repetitions === 0).length;
  const difficult = input.cards.filter(card => card.lapses > 0).length;
  const language = input.language === "vi" ? "Vietnamese" : "English";
  return [
    "You are the learning planner for MindCanvas.",
    `Respond in ${language} for the rationale, but keep focus as one of due, new, difficult, balanced.`,
    "Choose a realistic number of flashcards for one study day from the learner's current card state.",
    "Prioritize overdue and difficult cards without creating an intimidating session. A card may be counted once toward today's target; retries are handled by the app.",
    "The target must be at least 1, no more than the available cards, and no more than 50.",
    "Return exactly one JSON object with no Markdown or extra keys.",
    '{"dailyTarget":number,"focus":"due|new|difficult|balanced","rationale":"short explanation"}',
    `Available cards: ${input.cards.length}`,
    `Due cards: ${due}`,
    `New cards: ${newCards}`,
    `Difficult cards: ${difficult}`,
    `Available study time: ${input.dailyMinutes} minutes`,
  ].join("\n");
}

export async function recommendStudyPlanWithGemini(input: { cards: StudyPlanCardSignal[]; dailyMinutes: number; language: "vi" | "en" }) {
  const result = await generateGeminiJson(
    {
      apiKey: config.GEMINI_API_KEY ?? "", baseUrl: config.GEMINI_BASE_URL,
      models: config.GEMINI_MODELS ?? config.GEMINI_MODEL, timeoutMs: config.GEMINI_TIMEOUT_MS,
      retriesPerModel: config.GEMINI_RETRIES_PER_MODEL, totalTimeoutMs: config.GEMINI_TOTAL_TIMEOUT_MS,
      retryBaseMs: config.GEMINI_RETRY_BASE_MS,
    },
    promptFor(input),
    output => parseStudyPlanRecommendation(output, input.cards.length),
  );
  return { provider: "gemini" as const, model: result.model, ...result.value };
}
