export type AiDifficulty = "easy" | "balanced" | "hard";
export type AiDepth = "basic" | "detailed";

export type AiGenerationOptions = {
  difficulty: AiDifficulty;
  depth: AiDepth;
};

export const DEFAULT_AI_OPTIONS: AiGenerationOptions = {
  difficulty: "balanced",
  depth: "basic",
};

export function normalizeAiOptions(value: Partial<AiGenerationOptions> | null | undefined): AiGenerationOptions {
  return {
    difficulty: value?.difficulty === "easy" || value?.difficulty === "hard" ? value.difficulty : "balanced",
    depth: value?.depth === "detailed" ? "detailed" : "basic",
  };
}

export function aiOptionsInstruction(options: AiGenerationOptions) {
  const difficulty = options.difficulty === "easy"
    ? "Difficulty: easy. Prefer direct recall, definitions and clear distinctions. Avoid trick questions or obscure details."
    : options.difficulty === "hard"
      ? "Difficulty: hard. Require comparison, reasoning, application and transfer to a new situation when the source supports it. Do not invent complexity."
      : "Difficulty: balanced. Mix core recall with understanding and a small number of application questions when supported by the source.";
  const depth = options.depth === "detailed"
    ? "Depth: detailed. Include useful context, examples and explanations, while keeping each item focused and learnable."
    : "Depth: basic. Keep each item concise and focused on the most important knowledge.";
  return `${difficulty}\n${depth}`;
}
