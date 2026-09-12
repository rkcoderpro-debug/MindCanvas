export type ToolMode = "select" | "hand" | "text" | "pen" | "highlighter" | "rect" | "ellipse" | "connector";

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
  sourceDocumentId?: string;
  collapsed?: boolean;
  parentId?: string;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type MindMapEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type DrawingPath = {
  id: string;
  points: Vec2[];
  color: string;
  width: number;
  opacity: number;
  rotation?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type CanvasShape = {
  id: string;
  kind: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type CanvasText = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: CanvasTextAlign;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type CanvasMediaKind = "image" | "video" | "audio";

export type CanvasCrop = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CanvasMedia = {
  id: string;
  kind: CanvasMediaKind;
  /** Embedded data URL so exported .mindcanvas files remain self-contained. */
  src: string;
  name: string;
  mimeType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  /** Crop percentages for visual media. Values are measured from each edge. */
  crop?: CanvasCrop;
  /** Playback range in seconds for audio/video media. */
  trimStart?: number;
  trimEnd?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type CanvasEmbedKind = "web" | "youtube" | "video";

export type CanvasEmbed = {
  id: string;
  kind: CanvasEmbedKind;
  /** A validated http(s) URL, normalized to a YouTube embed URL when applicable. */
  url: string;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type Viewport = { x: number; y: number; scale: number };

export type CanvasBackground = "dots" | "grid" | "ruled" | "graph" | "isometric" | "plain";
export type CanvasTextAlign = "left" | "center" | "right";

export type CanvasSourceDocument = {
  id: string;
  name: string;
};

export type BoardState = {
  layerOrder?: string[];
  groups?: Array<{ id: string; elementIds: string[] }>;
  id: string;
  title: string;
  updatedAt: string;
  viewport: Viewport;
  background?: CanvasBackground;
  sourceDocuments?: CanvasSourceDocument[];
  texts: CanvasText[];
  shapes: CanvasShape[];
  drawings: DrawingPath[];
  media: CanvasMedia[];
  embeds: CanvasEmbed[];
  nodes: MindMapNode[];
  edges: MindMapEdge[];
};

export type StructuredMindMap = {
  title: string;
  nodes: Array<Pick<MindMapNode, "id" | "label" | "sourcePage" | "sourceDocumentId"> & { parentId?: string }>;
  edges: MindMapEdge[];
  sourceDocumentId?: string;
  sourceDocumentName?: string;
};

export type AIProviderName = "experiential-labs" | "gemini" | "demo";

export type AIProviderConfig = {
  name: AIProviderName;
  model: string;
  enabled: boolean;
};
