// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClassAssignment } from "../lib/classrooms";

const { respondClassInvite, listClassrooms, listClassAssignments, listConnections, requestTeacherStudent, startSharedQuiz, finishSharedQuiz, submitClassAssignment } = vi.hoisted(() => ({
  respondClassInvite: vi.fn(async () => undefined),
  listClassrooms: vi.fn(async () => [{ id: "class-1", name: "Toán", description: "", teacher_id: "teacher", teacher_name: "Cô Lan", status: "pending", student_count: 0 }]),
  listClassAssignments: vi.fn(async () => [] as ClassAssignment[]),
  listConnections: vi.fn(async () => [{ peer_id: "friend", display_name: "Dancing Cat" }]),
  requestTeacherStudent: vi.fn(async () => undefined),
  startSharedQuiz: vi.fn(async () => ({ id: "attempt-1", version: 1, questions: [
    { id: "q1", prompt: "Tính $x^2$", options: ["$x$", "$x^2$", "$2x$", "$2$"] },
    { id: "q2", prompt: "Tính $2+2$", options: ["$4$", "$3$", "$5$", "$6$"] },
  ] })),
  finishSharedQuiz: vi.fn(async () => ({ score: 2, total: 2, version: 1, questions: [
    { id: "q1", prompt: "Tính $x^2$", options: ["$x$", "$x^2$", "$2x$", "$2$"], correctIndex: 1, explanation: "Bình phương" },
    { id: "q2", prompt: "Tính $2+2$", options: ["$4$", "$3$", "$5$", "$6$"], correctIndex: 0, explanation: "Bằng 4" },
  ] })),
  submitClassAssignment: vi.fn(async () => undefined),
}));
vi.mock("../lib/connections", () => ({ listConnections }));
vi.mock("../lib/classrooms", () => ({
  listTeacherStudentLinks: vi.fn(async () => []), listClassrooms, listClassMembers: vi.fn(async () => []), listClassAssignments,
  respondClassInvite, createClassroom: vi.fn(), requestTeacherStudent, respondTeacherStudent: vi.fn(),
  endTeacherStudent: vi.fn(), inviteClassStudent: vi.fn(), removeClassStudent: vi.fn(), createClassAssignment: vi.fn(),
  submitClassAssignment, listClassQuizAttempts: vi.fn(async () => [{ id: "attempt-1", score: 2, total: 2, completed_at: "2026-10-09T09:00:00Z" }]), listClassSubmissions: vi.fn(),
  gradeClassSubmission: vi.fn(), closeClassAssignment: vi.fn(),
}));
vi.mock("../lib/learningShare", () => ({ startSharedQuiz, finishSharedQuiz }));
import ClassroomsPage from "./ClassroomsPage";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  respondClassInvite.mockClear(); listClassAssignments.mockClear(); listClassrooms.mockClear(); requestTeacherStudent.mockClear(); startSharedQuiz.mockClear(); finishSharedQuiz.mockClear(); submitClassAssignment.mockClear();
  listClassAssignments.mockResolvedValue([]);
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

it("blocks student invitations until the account owns a class, even if it joined another class", async () => {
  listClassrooms.mockResolvedValue([{ id: "class-1", name: "Toán", description: "", teacher_id: "another-teacher", teacher_name: "Cô Lan", status: "active", student_count: 1 }]);
  await act(async () => root.render(<ClassroomsPage owner="teacher" quizzes={[]}/>));
  const invite = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Mời làm học trò") as HTMLButtonElement;
  expect(invite.disabled).toBe(true);
  expect(host.textContent).toContain("Hãy tạo ít nhất một lớp học trước khi mời học trò");
  await act(async () => invite.click());
  expect(requestTeacherStudent).not.toHaveBeenCalled();
});

it("allows inviting a connected person once the account owns a class", async () => {
  listClassrooms.mockResolvedValue([{ id: "class-1", name: "Toán", description: "", teacher_id: "teacher", teacher_name: "Tôi", status: "teacher", student_count: 0 }]);
  await act(async () => root.render(<ClassroomsPage owner="teacher" quizzes={[]}/>));
  const invite = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Mời làm học trò") as HTMLButtonElement;
  expect(invite.disabled).toBe(false);
  await act(async () => invite.click());
  expect(requestTeacherStudent).toHaveBeenCalledWith("friend");
});

it("runs an assigned Quiz one question at a time and keeps answers private until server submission", async () => {
  listClassrooms.mockResolvedValue([{ id: "class-1", name: "Hóa học", description: "", teacher_id: "teacher", teacher_name: "Cô Lan", status: "active", student_count: 1 }]);
  listClassAssignments.mockResolvedValue([{ id: "assignment-1", title: "Bài kiểm tra", instructions: "", quiz_id: "quiz-1", quiz_title: "Quiz Hóa", due_at: "2099-10-09T09:00:00Z", max_points: 10, closed_at: null, submitted_at: null, note: null, points: null, auto_points: null, feedback: null, graded_at: null }]);
  await act(async () => root.render(<ClassroomsPage owner="student" quizzes={[]}/>));
  await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Làm Quiz") as HTMLButtonElement).click());
  expect(startSharedQuiz).toHaveBeenCalledWith("quiz-1");
  const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.querySelectorAll(".quiz-question-card")).toHaveLength(1);
  expect(dialog.querySelector(".quiz-question-card")?.textContent).toContain("Tính");
  expect(dialog.querySelector(".quiz-question-card")?.textContent).not.toContain("Bằng 4");
  expect(dialog.querySelector(".quiz-options .katex")).not.toBeNull();
  await act(async () => (dialog.querySelectorAll(".quiz-options button")[1] as HTMLButtonElement).click());
  expect(dialog.querySelectorAll(".quiz-options button.selected")).toHaveLength(1);
  await act(async () => (Array.from(dialog.querySelectorAll(".quiz-runner-actions button")).find(button => button.textContent?.includes("Câu tiếp")) as HTMLButtonElement).click());
  expect(dialog.querySelector(".quiz-question-kicker")?.textContent).toBe("Câu 2");
  await act(async () => (dialog.querySelectorAll(".quiz-options button")[0] as HTMLButtonElement).click());
  expect(dialog.querySelectorAll(".quiz-question-nav button.answered")).toHaveLength(2);
  expect(dialog.querySelector(".quiz-answer-review")).toBeNull();
  await act(async () => (Array.from(dialog.querySelectorAll(".quiz-runner-actions button")).find(button => button.textContent?.includes("Nộp Quiz")) as HTMLButtonElement).click());
  expect(finishSharedQuiz).toHaveBeenCalledWith("attempt-1", [1, 0]);
  expect(dialog.querySelector(".quiz-answer-review")?.textContent).toContain("Bình phương");
  await act(async () => (Array.from(dialog.querySelectorAll("button")).find(button => button.textContent === "Về bài tập để nộp") as HTMLButtonElement).click());
  await act(async () => (Array.from(host.querySelectorAll(".classrooms-student-work button")).find(button => button.textContent === "Nộp bài") as HTMLButtonElement).click());
  expect(submitClassAssignment).toHaveBeenCalledWith("assignment-1", "", "attempt-1");
});
