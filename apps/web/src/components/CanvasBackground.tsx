import type { BoardState, CanvasBackground as CanvasBackgroundType } from "@mindcanvas/shared";

const mod = (value: number, size: number) => size ? ((value % size) + size) % size : 0;

export const BACKGROUND_OPTIONS: CanvasBackgroundType[] = ["dots", "grid", "ruled", "graph", "isometric", "plain"];

export default function CanvasBackground({ board }: { board: BoardState }) {
  const kind = board.background ?? "dots";
  const { x, y, scale } = board.viewport;
  const dots = 22 * scale;
  const grid = 24 * scale;
  const ruled = 32 * scale;
  const graph = 20 * scale;
  const isoWidth = 48 * scale;
  const isoHeight = 28 * scale;

  return <g className="canvas-background" data-canvas-background={kind} pointerEvents="none" aria-hidden="true">
    <defs>
      <pattern id="canvas-bg-dots" x={mod(x, dots)} y={mod(y, dots)} width={dots} height={dots} patternUnits="userSpaceOnUse">
        <circle cx={Math.max(1, scale)} cy={Math.max(1, scale)} r={Math.max(.7, Math.min(1.45, scale))} fill="var(--canvas-dot)"/>
      </pattern>
      <pattern id="canvas-bg-grid" x={mod(x, grid)} y={mod(y, grid)} width={grid} height={grid} patternUnits="userSpaceOnUse">
        <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="var(--canvas-grid)" strokeWidth="1"/>
      </pattern>
      <pattern id="canvas-bg-ruled" x={mod(x, 320 * scale)} y={mod(y, ruled)} width={320 * scale} height={ruled} patternUnits="userSpaceOnUse">
        <path d={`M 0 ${Math.max(0, ruled - .5)} H ${320 * scale}`} fill="none" stroke="var(--canvas-rule)" strokeWidth="1"/>
        <path d={`M ${48 * scale} 0 V ${ruled}`} fill="none" stroke="var(--canvas-margin)" strokeWidth="1"/>
      </pattern>
      <pattern id="canvas-bg-graph-minor" x={mod(x, graph)} y={mod(y, graph)} width={graph} height={graph} patternUnits="userSpaceOnUse">
        <path d={`M ${graph} 0 L 0 0 0 ${graph}`} fill="none" stroke="var(--canvas-grid-minor)" strokeWidth="1"/>
      </pattern>
      <pattern id="canvas-bg-graph-major" x={mod(x, graph * 5)} y={mod(y, graph * 5)} width={graph * 5} height={graph * 5} patternUnits="userSpaceOnUse">
        <path d={`M ${graph * 5} 0 L 0 0 0 ${graph * 5}`} fill="none" stroke="var(--canvas-grid-major)" strokeWidth="1.2"/>
      </pattern>
      <pattern id="canvas-bg-isometric" x={mod(x, isoWidth)} y={mod(y, isoHeight)} width={isoWidth} height={isoHeight} patternUnits="userSpaceOnUse">
        <path d={`M 0 ${isoHeight} L ${isoWidth / 2} ${isoHeight / 2} L ${isoWidth} ${isoHeight} M 0 0 L ${isoWidth / 2} ${isoHeight / 2} L ${isoWidth} 0 M ${isoWidth / 2} ${isoHeight / 2} V ${isoHeight * 1.5}`} fill="none" stroke="var(--canvas-grid)" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect className="canvas-background-base" width="100%" height="100%" fill="var(--canvas)"/>
    {kind !== "plain" && <rect width="100%" height="100%" fill={`url(#canvas-bg-${kind === "graph" ? "graph-minor" : kind})`}/>} 
    {kind === "graph" && <rect width="100%" height="100%" fill="url(#canvas-bg-graph-major)"/>}
  </g>;
}
