import { describe, expect, it } from "vitest";
import { GRADEBOOK_HEADERS, gradebookCsv, gradebookDisplayRows } from "./gradebookExport";
import type { GradebookEntry } from "./classrooms";

const entries: GradebookEntry[] = [
  { student_id:"a", name:"Lan", status:"graded", submitted_at:"2026-10-08T07:00:00Z", note:"Bài 1", auto_points:8, points:9, feedback:"Giải tốt", graded_at:"2026-10-08T08:00:00Z", wrong_count:2, quiz_total:10 },
  { student_id:"b", name:"=HYPERLINK(\"https://example.org\")", status:"not_submitted", submitted_at:null, note:null, auto_points:null, points:null, feedback:null, graded_at:null, wrong_count:null, quiz_total:null },
];

describe("gradebook export", () => {
  it("uses the exact table cells and column order for both the screen and CSV", () => {
    const rows = gradebookDisplayRows(entries,10);
    expect(rows[0].cells).toEqual(["Lan","Đã chấm",expect.any(String),"Bài 1","2/10","8","9","10","Giải tốt"]);
    expect(rows[1].cells[1]).toBe("Chưa nộp");
    expect(rows[1].cells[6]).toBe("—");
    const csv = gradebookCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(GRADEBOOK_HEADERS.map(label => `"${label}"`).join(","));
    expect(csv).toContain('"Bài 1","2/10","8","9","10","Giải tốt"');
  });

  it("quotes line breaks and escapes spreadsheet formulas from student data", () => {
    const csv = gradebookCsv(gradebookDisplayRows(entries,10));
    expect(csv).toContain('"\'=HYPERLINK(""https://example.org"")"');
    expect(gradebookCsv([{ studentId:"x", cells:["Hi, \"teacher\"\nNext"] }])).toContain('"Hi, ""teacher""\nNext"');
  });
});
