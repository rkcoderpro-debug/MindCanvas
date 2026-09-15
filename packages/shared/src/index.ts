export type ToolMode = "select" | "hand" | "text" | "pen" | "highlighter" | "line" | "rect" | "ellipse" | "triangle" | "connector";

export { LenientJsonError, parseLenientJson } from "./json.js";

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

/**
 * A branch edge participates in hierarchy operations such as layout,
 * collapse and re-parenting. A relation edge is a visible cross-link only;
 * it must never pull a second branch into a selected subtree.
 *
 * The field is optional for backwards compatibility with V4.5.x/V4.6 files.
 * Legacy edges are deterministically inferred by the editor.
 */
export type MindMapEdgeKind = "branch" | "relation";

export type MindMapEdge = {
  id: string;
  source: string;
  target: string;
  kind?: MindMapEdgeKind;
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
  kind: "rect" | "ellipse" | "triangle";
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

export type CanvasBackgroundPattern = "dots" | "grid" | "ruled" | "graph" | "isometric" | "plain";
export type CanvasBackgroundMedia = {
  kind: "image" | "video";
  /** Self-contained data URL for local/offline exports. Cloud deployments may replace this with an asset URL. */
  src: string;
  name?: string;
  mimeType?: string;
  opacity?: number;
  blur?: number;
  brightness?: number;
  fit?: "cover" | "contain";
  position?: string;
  overlay?: string;
};
export type CanvasBackground = CanvasBackgroundPattern | CanvasBackgroundMedia;
export type CanvasTextAlign = "left" | "center" | "right";

export type CanvasThumbnailItem = {
  kind: "node" | "text" | "shape" | "drawing" | "edge" | "media" | "embed";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
  points?: Vec2[];
  source?: Vec2;
  target?: Vec2;
};

/** Small, media-free snapshot used by the workspace project cards. */
export type CanvasThumbnail = {
  version: 1;
  background: CanvasBackgroundPattern;
  items: CanvasThumbnailItem[];
  bounds: { x: number; y: number; width: number; height: number };
};

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
  layoutMeta?: BoardLayoutMeta;
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

export type MindMapAiOperation =
  | { op: "add"; id: string; label: string; parentId?: string; color?: string }
  | { op: "update"; id: string; label?: string; parentId?: string | null }
  | { op: "remove"; id: string }
  | { op: "link"; id?: string; source: string; target: string; label?: string };

/** How a user wants future mind-map edits to interact with layout. */
export type MindMapLayoutBehavior = "auto" | "assist" | "free";
export type BoardLayoutMeta = {
  /** Optional so V4.5.x/V4.6 boards keep their original free-placement behavior. */
  mindMapBehavior?: MindMapLayoutBehavior;
};

export type AIProviderName = "experiential-labs" | "gemini" | "demo";

export type AIProviderConfig = {
  name: AIProviderName;
  model: string;
  enabled: boolean;
};
