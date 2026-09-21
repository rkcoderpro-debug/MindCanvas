/**
 * A short press commits a tool. Holding it past this threshold makes the
 * tool a temporary override and restores the previous tool on release.
 */
export const TOOL_HOLD_THRESHOLD_MS = 280;

export type ToolPressMode = "persistent" | "temporary";

export function toolPressMode(durationMs: number, thresholdMs = TOOL_HOLD_THRESHOLD_MS): ToolPressMode {
  return Number.isFinite(durationMs) && durationMs >= thresholdMs ? "temporary" : "persistent";
}

export function toolAfterRelease<T>(previousTool: T, pressedTool: T, durationMs: number, thresholdMs = TOOL_HOLD_THRESHOLD_MS): T {
  return toolPressMode(durationMs, thresholdMs) === "temporary" ? previousTool : pressedTool;
}
