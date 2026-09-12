import { config } from "./config.js";
import { generateGemini, type GeminiImageInput } from "./gemini.js";

type AIProviderName = "experiential-labs" | "gemini" | "demo";
type StructuredMindMap = { title: string; nodes: Array<{ id: string; label: string; parentId?: string; sourcePage?: number }>; edges: Array<{ id: string; source: string; target: string; label?: string }>; sourceDocumentId?: string };

export type GenerateInput = { text: string; documentId?: string; image?: GeminiImageInput };
export type ProviderResult = { provider: AIProviderName; model: string; graph: StructuredMindMap };

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  isConfigured(): boolean;
  generate(input: GenerateInput): Promise<ProviderResult>;
}

const instruction = (text: string) => `Return only valid JSON with this shape: {"title":string,"nodes":[{"id":string,"label":string,"parentId":string|null,"sourcePage":number|null}],"edges":[{"id":string,"source":string,"target":string,"label":string|null}]}. Create a concise, hierarchical editable mind map from the document. Preserve source page numbers only when present. Document:\n${text.slice(0, 120000)}`;

function parseGraph(raw: string, provider: AIProviderName, model: string, documentId?: string): ProviderResult {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const value = JSON.parse(cleaned) as Partial<StructuredMindMap>;
  if (typeof value.title !== "string" || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error("AI returned an invalid graph.");
  return { provider, model, graph: { title: value.title, nodes: value.nodes as StructuredMindMap["nodes"], edges: value.edges as StructuredMindMap["edges"], sourceDocumentId: documentId } };
}

export class ExperientialLabsProvider implements AIProvider {
  readonly name = "experiential-labs" as const; readonly model = config.EXPERIENTIAL_LABS_MODEL;
  isConfigured() { return Boolean(config.EXPERIENTIAL_LABS_BASE_URL && config.EXPERIENTIAL_LABS_API_KEY && this.model); }
  async generate(input: GenerateInput) {
    if (!this.isConfigured()) throw new Error("Experiential Labs is not configured.");
    const response = await fetch(`${config.EXPERIENTIAL_LABS_BASE_URL}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.EXPERIENTIAL_LABS_API_KEY}` }, body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: instruction(input.text) }] }), signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Experiential Labs returned ${response.status}.`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const output = payload.choices?.[0]?.message?.content ?? "";
    return parseGraph(output, this.name, this.model, input.documentId);
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const; readonly model = config.GEMINI_MODEL;
  isConfigured() { return Boolean(config.GEMINI_API_KEY && this.model); }
  async generate(input: GenerateInput) {
    if (!this.isConfigured()) throw new Error("Gemini is not configured.");
    return generateGemini(input, {
      apiKey: config.GEMINI_API_KEY ?? "",
      baseUrl: config.GEMINI_BASE_URL,
      models: config.GEMINI_MODELS ?? this.model,
      timeoutMs: config.GEMINI_TIMEOUT_MS,
      retriesPerModel: config.GEMINI_RETRIES_PER_MODEL,
      totalTimeoutMs: config.GEMINI_TOTAL_TIMEOUT_MS,
      retryBaseMs: config.GEMINI_RETRY_BASE_MS,
    });
  }
}

export class DemoProvider implements AIProvider {
  readonly name = "demo" as const; readonly model = "local-demo";
  isConfigured() { return true; }
  async generate(input: GenerateInput) { const title = input.text.split(/\n|\./)[0]?.slice(0, 60) || "Tài liệu mới"; return { provider: this.name, model: this.model, graph: { title, nodes: [{ id: "demo-root", label: title, parentId: undefined }, { id: "demo-1", label: "Ý chính cần xem lại", parentId: "demo-root", sourcePage: 1 }], edges: [{ id: "demo-edge", source: "demo-root", target: "demo-1" }], sourceDocumentId: input.documentId } }; }
}

export async function generateWithFallback(input: GenerateInput) {
  // Production route is Gemini-only. Never silently replace failures with demo data.
  return generateGemini(input, {
    apiKey: config.GEMINI_API_KEY ?? "",
    baseUrl: config.GEMINI_BASE_URL,
    models: config.GEMINI_MODELS ?? config.GEMINI_MODEL,
    timeoutMs: config.GEMINI_TIMEOUT_MS,
    retriesPerModel: config.GEMINI_RETRIES_PER_MODEL,
    totalTimeoutMs: config.GEMINI_TOTAL_TIMEOUT_MS,
    retryBaseMs: config.GEMINI_RETRY_BASE_MS,
  });
}
