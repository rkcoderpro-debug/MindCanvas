import { config } from "./config.js";

type AIProviderName = "experiential-labs" | "gemini" | "demo";
type StructuredMindMap = { title: string; nodes: Array<{ id: string; label: string; parentId?: string; sourcePage?: number }>; edges: Array<{ id: string; source: string; target: string; label?: string }>; sourceDocumentId?: string };

export type GenerateInput = { text: string; documentId?: string };
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
    const response = await fetch(`${config.EXPERIENTIAL_LABS_BASE_URL}/v1/generate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.EXPERIENTIAL_LABS_API_KEY}` }, body: JSON.stringify({ model: this.model, prompt: instruction(input.text), response_format: "json" }), signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Experiential Labs returned ${response.status}.`);
    const payload = await response.json() as { output?: string; text?: string; result?: string };
    return parseGraph(payload.output ?? payload.text ?? payload.result ?? JSON.stringify(payload), this.name, this.model, input.documentId);
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const; readonly model = config.GEMINI_MODEL;
  isConfigured() { return Boolean(config.GEMINI_API_KEY && this.model); }
  async generate(input: GenerateInput) {
    if (!this.isConfigured()) throw new Error("Gemini is not configured.");
    const endpoint = `${config.GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY!)}`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: instruction(input.text) }] }], generationConfig: { responseMimeType: "application/json" } }), signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return parseGraph(output, this.name, this.model, input.documentId);
  }
}

export class DemoProvider implements AIProvider {
  readonly name = "demo" as const; readonly model = "local-demo";
  isConfigured() { return true; }
  async generate(input: GenerateInput) { const title = input.text.split(/\n|\./)[0]?.slice(0, 60) || "Tài liệu mới"; return { provider: this.name, model: this.model, graph: { title, nodes: [{ id: "demo-root", label: title, parentId: undefined }, { id: "demo-1", label: "Ý chính cần xem lại", parentId: "demo-root", sourcePage: 1 }], edges: [{ id: "demo-edge", source: "demo-root", target: "demo-1" }], sourceDocumentId: input.documentId } }; }
}

export async function generateWithFallback(input: GenerateInput) {
  const providers: AIProvider[] = [new ExperientialLabsProvider(), new GeminiProvider(), new DemoProvider()];
  for (const provider of providers) { if (!provider.isConfigured()) continue; try { return await provider.generate(input); } catch (error) { if (provider.name === "demo") throw error; } }
  return providers[2].generate(input);
}
