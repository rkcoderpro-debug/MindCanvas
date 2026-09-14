import { z } from "zod";

export const aiOptionsSchema = z.object({
  difficulty: z.enum(["easy", "balanced", "hard"]).default("balanced"),
  depth: z.enum(["basic", "detailed"]).default("basic"),
});
export const mindMapDetailSchema = z.enum(["basic", "medium", "detailed"]).default("medium");

export type AiGenerationOptions = z.infer<typeof aiOptionsSchema>;
export type MindMapDetail = z.infer<typeof mindMapDetailSchema>;

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

export function mindMapDetailInstruction(detail: MindMapDetail) {
  if (detail === "detailed") return "Mind-map detail: detailed. Include the root, major branches, meaningful subtopics and supporting details when the source supports them. Keep the graph readable and do not invent facts.";
  if (detail === "basic") return "Mind-map detail: basic. Include the root and only the most important branches. Omit minor details and keep the graph compact.";
  return "Mind-map detail: medium. Include the root, major branches and the most important subtopics, keeping the graph readable.";
}
