import { getCurrentSession, supabase } from "./supabase";

export type TeacherStudentLink = { teacher_id: string; student_id: string; teacher_name: string; student_name: string; status: "pending" | "accepted" | "declined" };
export type Classroom = { id: string; name: string; description: string; teacher_id: string; teacher_name: string; status: "teacher" | "pending" | "active"; student_count: number };
export type ClassMember = { student_id: string; name: string; status: "pending" | "active" };
export type ClassAssignment = { id: string; title: string; instructions: string; quiz_id: string | null; quiz_title: string | null; due_at: string; max_points: number; closed_at: string | null; submitted_at: string | null; note: string | null; points: number | null; auto_points: number | null; feedback: string | null; graded_at: string | null };
export type ClassSubmission = { student_id: string; name: string; note: string; submitted_at: string; auto_points: number | null; points: number | null; feedback: string; graded_at: string | null };
export type ClassQuizAttempt = { id: string; score: number; total: number; completed_at: string };
export type GradebookEntry = { student_id: string; name: string; status: "not_submitted" | "pending" | "graded"; submitted_at: string | null; note: string | null; auto_points: number | null; points: number | null; feedback: string | null; graded_at: string | null; wrong_count: number | null; quiz_total: number | null };
export type ClassQuizReviewQuestion = { number: number; prompt: string; options: string[]; answer: number | null; correct_index: number; explanation: string; correct: boolean };
export type ClassGradeEvent = { old_points: number | null; new_points: number | null; old_feedback: string; new_feedback: string; reason: string; source: "auto" | "manual" | "migration"; actor_name: string; created_at: string };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const session = await getCurrentSession();
  if (!supabase || !session) throw new Error("Đăng nhập để dùng lớp học.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || /schema cache|could not find the function/i.test(error.message))
      throw new Error("Chưa chạy migration 0027_v5_16_0_classrooms.sql trên Supabase.");
    if (error.message.includes("CLASS_REQUIRED"))
      throw new Error("Hãy tạo ít nhất một lớp học trước khi mời học trò.");
    throw new Error(error.message);
  }
  return data as T;
}

export const listTeacherStudentLinks = () => rpc<TeacherStudentLink[]>("list_teacher_student_links");
export const requestTeacherStudent = (studentId: string) => rpc<void>("request_teacher_student", { p_student: studentId });
export const respondTeacherStudent = (teacherId: string, accept: boolean) => rpc<void>("respond_teacher_student", { p_teacher: teacherId, p_accept: accept });
export const endTeacherStudent = (teacherId: string, studentId: string) => rpc<void>("end_teacher_student", { p_teacher: teacherId, p_student: studentId });
export const createClassroom = (name: string, description: string) => rpc<string>("create_classroom", { p_name: name, p_description: description });
export const listClassrooms = () => rpc<Classroom[]>("list_classrooms");
export const inviteClassStudent = (classId: string, studentId: string) => rpc<void>("invite_class_student", { p_class: classId, p_student: studentId });
export const respondClassInvite = (classId: string, accept: boolean) => rpc<void>("respond_class_invite", { p_class: classId, p_accept: accept });
export const removeClassStudent = (classId: string, studentId: string) => rpc<void>("remove_class_student", { p_class: classId, p_student: studentId });
export const listClassMembers = (classId: string) => rpc<ClassMember[]>("list_class_members", { p_class: classId });
export const createClassAssignment = (classId: string, title: string, instructions: string, due: string, quizId: string | null, max: number) =>
  rpc<string>("create_class_assignment", { p_class: classId, p_title: title, p_instructions: instructions, p_due: due, p_quiz: quizId, p_max: max });
export const listClassAssignments = (classId: string) => rpc<ClassAssignment[]>("list_class_assignments", { p_class: classId });
export const submitClassAssignment = (assignmentId: string, note: string, attemptId: string | null) =>
  rpc<void>("submit_class_assignment", { p_assignment: assignmentId, p_note: note, p_attempt: attemptId });
export const listClassQuizAttempts = (assignmentId: string) => rpc<ClassQuizAttempt[]>("list_class_quiz_attempts", { p_assignment: assignmentId });
export const listClassSubmissions = (assignmentId: string) => rpc<ClassSubmission[]>("list_class_submissions", { p_assignment: assignmentId });
export const closeClassAssignment = (assignmentId: string) => rpc<void>("close_class_assignment", { p_assignment: assignmentId });
export const recordClassGrade = (assignmentId: string, studentId: string, points: number, feedback: string, reason: string) =>
  rpc<void>("record_class_grade", { p_assignment: assignmentId, p_student: studentId, p_points: points, p_feedback: feedback, p_reason: reason });
export const listAssignmentGradebook = (assignmentId: string) => rpc<GradebookEntry[]>("list_assignment_gradebook", { p_assignment: assignmentId });
export const reviewClassQuizSubmission = (assignmentId: string, studentId: string) =>
  rpc<ClassQuizReviewQuestion[]>("review_class_quiz_submission", { p_assignment: assignmentId, p_student: studentId });
export const listClassGradeHistory = (assignmentId: string, studentId: string) =>
  rpc<ClassGradeEvent[]>("list_class_grade_history", { p_assignment: assignmentId, p_student: studentId });
