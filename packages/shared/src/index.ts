export type ToolMode = "select" | "text" | "pen" | "highlighter" | "rect" | "ellipse" | "connector";

export type Vec2 = { x: number; y: number };

export type MindMapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  sourcePage?: number;
  collapsed?: boolean;
};

export type MindMapEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type DrawingPath = {
  id: string;
  points: Vec2[];
  color: string;
  width: number;
  opacity: number;
};

export type CanvasShape = {
  id: string;
  kind: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type CanvasText = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
};

export type Viewport = { x: number; y: number; scale: number };

export type BoardState = {
  id: string;
  title: string;
  updatedAt: string;
  viewport: Viewport;
  texts: CanvasText[];
  shapes: CanvasShape[];
  drawings: DrawingPath[];
  nodes: MindMapNode[];
  edges: MindMapEdge[];
};

export type StructuredMindMap = {
  title: string;
  nodes: Array<Pick<MindMapNode, "id" | "label" | "sourcePage"> & { parentId?: string }>;
  edges: MindMapEdge[];
  sourceDocumentId?: string;
};

export type AIProviderName = "experiential-labs" | "gemini" | "demo";

export type AIProviderConfig = {
  name: AIProviderName;
  model: string;
  enabled: boolean;
};
