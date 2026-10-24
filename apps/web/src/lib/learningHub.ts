import { renderLearningHub, validateLearningHub, type LearningHub } from "../../../../packages/shared/src/learningHub.js";

/** Imported scripts never execute in the host. A recognized hub uses only validated data. */
export function readLearningHub(html: string): LearningHub | null {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const markers = parsed.querySelectorAll('[id="mindcanvas-learning-hub"]');
  if (!markers.length) return null;
  if (markers.length !== 1 || markers[0].tagName !== "SCRIPT" || markers[0].getAttribute("type") !== "application/json") throw new Error("Dữ liệu Learning Hub không hợp lệ.");
  try { return validateLearningHub(JSON.parse(markers[0].textContent ?? "")); }
  catch (cause) { throw new Error(`Không đọc được Learning Hub. ${(cause as Error).message}`); }
}
export function normalizeLearningHubHtml(html: string, required = false): string {
  const hub = readLearningHub(html);
  if (!hub && required) throw new Error("HTML chưa có bản đồ Learning Hub và ngân hàng quiz. Hãy gửi lại prompt để AI tạo đủ dữ liệu trước khi nhập.");
  const normalized = hub ? renderLearningHub(hub) : html;
  if (new TextEncoder().encode(normalized).length > 1500000) throw new Error("Learning Hub vượt giới hạn 1,5 MB. Hãy chia nguồn thành các phần nhỏ hơn.");
  return normalized;
}
export async function learningHubRevision(hub: LearningHub): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(hub)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}
