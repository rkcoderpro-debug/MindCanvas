// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { listAssignmentGradebook, recordClassGrade, listClassGradeHistory, reviewClassQuizSubmission } = vi.hoisted(() => ({
  listAssignmentGradebook: vi.fn(async () => [{ student_id:"student", name:"Lan", status:"graded", submitted_at:"2026-10-08T07:00:00Z", note:"Đã làm", auto_points:7, points:8, feedback:"Cần ôn", graded_at:"2026-10-08T08:00:00Z", wrong_count:3, quiz_total:10 }]),
  recordClassGrade: vi.fn(async () => undefined),
  listClassGradeHistory: vi.fn(async () => [{ old_points:7,new_points:8,old_feedback:"",new_feedback:"Cần ôn",reason:"Điều chỉnh câu 2",source:"manual",actor_name:"Cô Lan",created_at:"2026-10-08T08:00:00Z" }]),
  reviewClassQuizSubmission: vi.fn(async () => [{ number:1,prompt:"$2+2$",options:["$3$","$4$"],answer:0,correct_index:1,explanation:"$2+2=4$",correct:false }]),
}));
vi.mock("../lib/classrooms", () => ({ listAssignmentGradebook, recordClassGrade, listClassGradeHistory, reviewClassQuizSubmission }));
import ClassGradebook from "./ClassGradebook";
import type { ClassAssignment } from "../lib/classrooms";

const assignment = { id:"assignment", title:"Toán", max_points:10 } as ClassAssignment;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  listAssignmentGradebook.mockClear(); recordClassGrade.mockClear(); listClassGradeHistory.mockClear(); reviewClassQuizSubmission.mockClear();
  host=document.createElement("div"); document.body.append(host); root=createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("shows teacher-only completed Quiz review and grade history", async () => {
  await act(async () => root.render(<ClassGradebook assignment={assignment}/>));
  expect(host.querySelector("table")?.textContent).toContain("3/10");
  await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Xem câu sai")) as HTMLButtonElement).click());
  expect(reviewClassQuizSubmission).toHaveBeenCalledWith("assignment","student");
  expect(host.textContent).toContain("Đáp án đúng");
  await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Lịch sử")) as HTMLButtonElement).click());
  expect(host.textContent).toContain("Điều chỉnh câu 2");
});

it("requires a written reason to correct a grade", async () => {
  await act(async () => root.render(<ClassGradebook assignment={assignment}/>));
  const details = host.querySelector("details") as HTMLDetailsElement;
  const form = details.querySelector("form") as HTMLFormElement;
  await act(async () => form.dispatchEvent(new Event("submit",{ bubbles:true,cancelable:true })));
  expect(recordClassGrade).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ít nhất 10 ký tự");
});
