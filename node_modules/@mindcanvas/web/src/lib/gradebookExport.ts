import type { GradebookEntry } from "./classrooms";

export const GRADEBOOK_HEADERS = ["Học trò", "Trạng thái", "Nộp lúc", "Bài nộp", "Câu sai", "Điểm Quiz", "Điểm chấm", "Điểm tối đa", "Nhận xét"] as const;
export type GradebookDisplayRow = { studentId: string; cells: string[] };

export function gradebookDisplayRows(entries: GradebookEntry[], maxPoints: number): GradebookDisplayRow[] {
  return entries.map(entry => ({ studentId: entry.student_id, cells: [
    entry.name,
    entry.status === "not_submitted" ? "Chưa nộp" : entry.status === "pending" ? "Chờ chấm" : "Đã chấm",
    entry.submitted_at ? new Date(entry.submitted_at).toLocaleString("vi-VN") : "—",
    entry.note || "—",
    entry.wrong_count === null ? "—" : `${entry.wrong_count}/${entry.quiz_total ?? 0}`,
    entry.auto_points === null ? "—" : String(entry.auto_points),
    entry.points === null ? "—" : String(entry.points),
    String(maxPoints), entry.feedback || "—",
  ] }));
}

// Prefix spreadsheet formulas in CSV cells while retaining the original text on screen.
function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"','""')}"`;
}
export function gradebookCsv(rows: GradebookDisplayRow[]): string {
  return `\uFEFF${[GRADEBOOK_HEADERS, ...rows.map(row => row.cells)].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}
