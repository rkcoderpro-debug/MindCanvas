// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { respondClassInvite, listClassrooms, listClassAssignments } = vi.hoisted(() => ({
  respondClassInvite: vi.fn(async () => undefined),
  listClassrooms: vi.fn(async () => [{ id: "class-1", name: "Toán", description: "", teacher_id: "teacher", teacher_name: "Cô Lan", status: "pending", student_count: 0 }]),
  listClassAssignments: vi.fn(async () => []),
}));
vi.mock("../lib/connections", () => ({ listConnections: vi.fn(async () => []) }));
vi.mock("../lib/classrooms", () => ({
  listTeacherStudentLinks: vi.fn(async () => []), listClassrooms, listClassMembers: vi.fn(async () => []), listClassAssignments,
  respondClassInvite, createClassroom: vi.fn(), requestTeacherStudent: vi.fn(), respondTeacherStudent: vi.fn(),
  endTeacherStudent: vi.fn(), inviteClassStudent: vi.fn(), removeClassStudent: vi.fn(), createClassAssignment: vi.fn(),
  submitClassAssignment: vi.fn(), listClassQuizAttempts: vi.fn(), listClassSubmissions: vi.fn(),
  gradeClassSubmission: vi.fn(), closeClassAssignment: vi.fn(),
}));
vi.mock("../lib/learningShare", () => ({ startSharedQuiz: vi.fn(), finishSharedQuiz: vi.fn() }));
import ClassroomsPage from "./ClassroomsPage";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  respondClassInvite.mockClear(); listClassAssignments.mockClear(); listClassrooms.mockClear();
  listClassrooms.mockResolvedValue([{ id: "class-1", name: "Toán", description: "", teacher_id: "teacher", teacher_name: "Cô Lan", status: "pending", student_count: 0 }]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("asks the student to accept class membership before reading assignments", async () => {
  await act(async () => root.render(<ClassroomsPage owner="student" quizzes={[]}/>));
  expect(host.textContent).toContain("Chờ xác nhận");
  expect(listClassAssignments).not.toHaveBeenCalled();
  await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Vào lớp") as HTMLButtonElement).click());
  expect(respondClassInvite).toHaveBeenCalledWith("class-1", true);
});

it("shows no class data or network actions for a guest", async () => {
  await act(async () => root.render(<ClassroomsPage owner={null} quizzes={[]}/>));
  expect(host.textContent).toContain("Đăng nhập để tham gia lớp học");
  expect(listClassrooms).not.toHaveBeenCalled();
});
