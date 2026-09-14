import { z } from "zod";

export const aiOptionsSchema = z.object({
  difficulty: z.enum(["easy", "balanced", "hard"]).default("balanced"),
  depth: z.enum(["basic", "detailed"]).default("basic"),
});

export type AiGenerationOptions = z.infer<typeof aiOptionsSchema>;

export function aiOptionsInstruction(options: AiGenerationOptions) {
  const difficulty = options.difficulty === "easy"
    ? "Difficulty: easy. Prefer direct recall, definitions and clear distinctions. Avoid trick questions or obscure details."
    : options.difficulty === "hard"
      ? "Difficulty: hard. Require comparison, reasoning, application and transfer when the source supports it. Do not invent complexity."
      : "Difficulty: balanced. Mix core recall with understanding and a small number of application questions when supported by the source.";
  const depth = options.depth === "detailed"
    ? "Depth: detailed. Include useful context, examples and explanations, while keeping each item focused and learnable."
    : "Depth: basic. Keep each item concise and focused on the most important knowledge.";
  return `${difficulty}\n${depth}`;
}
