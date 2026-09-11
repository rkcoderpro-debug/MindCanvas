import { Children, isValidElement, type ReactNode } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { orderedElements } from "../lib/editorCommands";

export default function LayerStack({ board, interactive, children }: { board: BoardState; interactive: boolean; children: ReactNode }) {
  const order = new Map(orderedElements(board).map((s, index) => [s.id, index]));
  const elements = Children.toArray(children).filter(isValidElement);
  elements.sort((a, b) => (order.get((a.props as { "data-element": string })["data-element"]) ?? -1) - (order.get((b.props as { "data-element": string })["data-element"]) ?? -1));
  return <g data-layer-stack="true" style={{ pointerEvents: interactive ? "auto" : "none" }}>{elements}</g>;
}
