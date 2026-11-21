import type { BoardState } from "@mindcanvas/shared";

// Compare normalized JSON structure without recreating the strings that hold
// embedded media. Unchanged subtrees (including assets) short-circuit.
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => equal(item ?? null, b[index] ?? null));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter(key => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter(key => right[key] !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]));
}

export const sameBoardState = (left: BoardState, right: BoardState) => equal(left, right);

export function sameBoardContent(left: BoardState, right: BoardState) {
  if (left === right) return true;
  const { viewport: _leftViewport, updatedAt: _leftUpdatedAt, ...leftContent } = left;
  const { viewport: _rightViewport, updatedAt: _rightUpdatedAt, ...rightContent } = right;
  return equal(leftContent, rightContent);
}
