import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Check, ClipboardList, GraduationCap, RefreshCw, Users } from "lucide-react";
import { listConnections, type Connection } from "../lib/connections";
import {
  closeClassAssignment, createClassAssignment, createClassroom, endTeacherStudent,
  inviteClassStudent, listClassAssignments, listClassMembers, listClassQuizAttempts,
  listClassrooms, listTeacherStudentLinks, removeClassStudent, requestTeacherStudent, respondClassInvite,
  respondTeacherStudent, submitClassAssignment,
  type ClassAssignment, type ClassMember, type ClassQuizAttempt, type Classroom, type TeacherStudentLink,
} from "../lib/classrooms";
import { finishSharedQuiz, startSharedQuiz, type SharedQuizResult, type SharedQuizSession } from "../lib/learningShare";
import FormulaText from "./FormulaText";
import ClassGradebook from "./ClassGradebook";
import type { QuizTest } from "../lib/quiz";

const dateLabel = (value: string) => new Date(value).toLocaleString("vi-VN");
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Không thể hoàn tất thao tác.";

export default function ClassroomsPage({ owner, quizzes }: { owner: string | null; quizzes: QuizTest[] }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [links, setLinks] = useState<TeacherStudentLink[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [attempts, setAttempts] = useState<Record<string, ClassQuizAttempt[]>>({});
  const [className, setClassName] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [quizId, setQuizId] = useState("");
  const [maxPoints, setMaxPoints] = useState(100);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [chosenAttempts, setChosenAttempts] = useState<Record<string, string>>({});
  const [gradebookAssignmentId, setGradebookAssignmentId] = useState<string | null>(null);
  const [quizSession, setQuizSession] = useState<{ assignmentId: string; session: SharedQuizSession } | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [quizResult, setQuizResult] = useState<SharedQuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const classroom = classes.find(item => item.id === selected);
  const isTeacher = classroom?.status === "teacher";

  const reload = async () => {
    const [people, relations, rooms] = await Promise.all([listConnections(), listTeacherStudentLinks(), listClassrooms()]);
    setConnections(people); setLinks(relations); setClasses(rooms);
    setSelected(current => current && rooms.some(room => room.id === current) ? current : rooms[0]?.id ?? null);
  };
  const reloadClass = async (id: string) => {
    const [students, work] = await Promise.all([listClassMembers(id), listClassAssignments(id)]);
    setMembers(students); setAssignments(work);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await reload(); if (selected) await reloadClass(selected); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    void Promise.all([listConnections(), listTeacherStudentLinks(), listClassrooms()]).then(([people, relations, rooms]) => {
      if (!alive) return;
      setConnections(people); setLinks(relations); setClasses(rooms);
      setSelected(current => current && rooms.some(room => room.id === current) ? current : rooms[0]?.id ?? null);
    }).catch(cause => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [owner]);
  useEffect(() => {
    if (!selected || !classroom || classroom.status === "pending") { setMembers([]); setAssignments([]); return; }
    let alive = true;
    void Promise.all([listClassMembers(selected), listClassAssignments(selected)]).then(([students, work]) => {
      if (alive) { setMembers(students); setAssignments(work); setAttempts({}); setGradebookAssignmentId(null); }
    }).catch(cause => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [selected, classroom?.status, owner]);

  const createRoom = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const id = await createClassroom(className, description); setClassName(""); setDescription("");
    setSelected(id); setNotice("Đã tạo lớp học.");
  }); };
  const createWork = (event: FormEvent) => { event.preventDefault(); if (!selected) return; void run(async () => {
    const instant = new Date(due).toISOString();
    await createClassAssignment(selected, title, instructions, instant, quizId || null, maxPoints);
    setTitle(""); setInstructions(""); setDue(""); setQuizId(""); setNotice("Đã giao bài tập.");
  }); };
  const loadAttempts = async (id: string) => { try { const rows = await listClassQuizAttempts(id); setAttempts(current => ({ ...current, [id]: rows })); } catch (cause) { setError(errorText(cause)); } };
  const startQuiz = async (assignment: ClassAssignment) => {
    if (!assignment.quiz_id) return;
    setBusy(true); setError(""); setQuizResult(null);
    try {
      const session = await startSharedQuiz(assignment.quiz_id);
      setQuizSession({ assignmentId: assignment.id, session }); setAnswers(session.questions.map(() => null));
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  const finishQuiz = async (event: FormEvent) => {
    event.preventDefault(); if (!quizSession) return;
    setBusy(true); setError("");
    try {
      setQuizResult(await finishSharedQuiz(quizSession.session.id, answers));
      await loadAttempts(quizSession.assignmentId);
      setChosenAttempts(current => ({ ...current, [quizSession.assignmentId]: quizSession.session.id }));
      setNotice("Đã hoàn thành Quiz. Hãy nộp bài tập để ghi điểm vào lớp.");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  if (!owner) return <section className="classrooms-page"><h2>Lớp học</h2><p>Đăng nhập để tham gia lớp học.</p></section>;
  const acceptedStudents = links.filter(link => link.teacher_id === owner && link.status === "accepted");
  return <section className="classrooms-page">
    <header><div><span className="eyebrow">LEARNING HUB · LỚP HỌC</span><h2>Giáo viên và học trò</h2><p>Lời mời vai trò, lớp học, bài tập, hạn nộp và điểm riêng của từng học trò.</p></div><button className="secondary-button" type="button" disabled={busy} onClick={() => void run(async () => undefined)}><RefreshCw size={16}/>Làm mới</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <div className="classrooms-grid">
      <aside className="classrooms-sidebar">
        <section className="learning-card"><h3><GraduationCap size={18}/>Quan hệ học tập</h3><p>Mời người đã kết nối nhận vai trò học trò. Người nhận phải đồng ý trước khi vào lớp.</p>
          {connections.filter(person => !links.some(link => link.teacher_id === owner && link.student_id === person.peer_id && link.status !== "declined")).map(person => <div className="classrooms-row" key={person.peer_id}><span>{person.display_name}</span><button type="button" disabled={busy} onClick={() => void run(() => requestTeacherStudent(person.peer_id))}>Mời làm học trò</button></div>)}
          {links.map(link => <div className="classrooms-row" key={`${link.teacher_id}-${link.student_id}`}><span>{link.teacher_id === owner ? `Học trò: ${link.student_name}` : `Giáo viên: ${link.teacher_name}`} · {link.status === "accepted" ? "Đã đồng ý" : link.status === "pending" ? "Đang chờ" : "Đã từ chối"}</span><div>{link.student_id === owner && link.status === "pending" && <><button disabled={busy} onClick={() => void run(() => respondTeacherStudent(link.teacher_id, true))}>Chấp nhận</button><button disabled={busy} onClick={() => void run(() => respondTeacherStudent(link.teacher_id, false))}>Từ chối</button></>}{link.status === "accepted" && <button disabled={busy} onClick={() => void run(() => endTeacherStudent(link.teacher_id, link.student_id))}>Kết thúc</button>}</div></div>)}
        </section>
        <section className="learning-card"><h3><Users size={18}/>Lớp của tôi</h3>{classes.map(room => <button type="button" key={room.id} className={`classrooms-class-option ${room.id === selected ? "active" : ""}`} onClick={() => setSelected(room.id)}><strong>{room.name}</strong><small>{room.status === "teacher" ? `Giáo viên · ${room.student_count} học trò` : `${room.teacher_name} · ${room.status === "pending" ? "Chờ xác nhận" : "Học trò"}`}</small></button>)}{!classes.length && <p>Chưa có lớp học.</p>}</section>
        <form className="learning-card classrooms-form" onSubmit={createRoom}><h3>Tạo lớp</h3><label>Tên lớp<input required maxLength={120} value={className} onChange={event => setClassName(event.target.value)}/></label><label>Mô tả<textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)}/></label><button className="primary-button" disabled={busy || !className.trim()}>Tạo lớp học</button></form>
      </aside>
      <div className="classrooms-content">{classroom ? <><section className="learning-card"><h3>{classroom.name}</h3><p>{classroom.description || `Giáo viên: ${classroom.teacher_name}`}</p>{classroom.status === "pending" ? <div className="classrooms-actions"><button disabled={busy} onClick={() => void run(() => respondClassInvite(classroom.id, true))}>Vào lớp</button><button disabled={busy} onClick={() => void run(() => respondClassInvite(classroom.id, false))}>Từ chối</button></div> : !isTeacher && <button type="button" disabled={busy} onClick={() => void run(() => removeClassStudent(classroom.id, owner))}>Rời lớp</button>}</section>
        {classroom.status !== "pending" && <>
          <section className="learning-card"><h3><Users size={18}/>Thành viên</h3>{isTeacher && acceptedStudents.length>0 && <div className="classrooms-invite-list">{acceptedStudents.filter(link => !members.some(member => member.student_id === link.student_id)).map(link => <button key={link.student_id} disabled={busy} onClick={() => void run(() => inviteClassStudent(classroom.id, link.student_id))}>Mời {link.student_name} vào lớp</button>)}</div>}{members.map(member => <div className="classrooms-row" key={member.student_id}><span>{member.name} · {member.status === "pending" ? "Đang chờ" : "Đã tham gia"}</span>{isTeacher && <button disabled={busy} onClick={() => void run(() => removeClassStudent(classroom.id, member.student_id))}>Xóa khỏi lớp</button>}</div>)}{!members.length && <p>Chưa có học trò.</p>}</section>
          {isTeacher && <form className="learning-card classrooms-form" onSubmit={createWork}><h3><ClipboardList size={18}/>Giao bài tập</h3><label>Tiêu đề<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/></label><label>Yêu cầu<textarea maxLength={4000} value={instructions} onChange={event => setInstructions(event.target.value)}/></label><div className="classrooms-form-pair"><label>Hạn nộp<input type="datetime-local" required value={due} onChange={event => setDue(event.target.value)}/></label><label>Điểm tối đa<input type="number" min={1} max={1000} value={maxPoints} onChange={event => setMaxPoints(Number(event.target.value))}/></label></div><label>Quiz đính kèm (tùy chọn, cần quyền chia sẻ Plus trở lên)<select value={quizId} onChange={event => setQuizId(event.target.value)}><option value="">Bài nộp dạng văn bản</option>{quizzes.filter(quiz => quiz.source === "cloud").map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label><button className="primary-button" disabled={busy || !title.trim() || !due}>Giao bài</button></form>}
          <section className="classrooms-assignments"><h3><BookOpen size={18}/>Bài tập ({assignments.length})</h3>{assignments.map(assignment => {
            const expired = new Date(assignment.due_at).getTime() < Date.now() || !!assignment.closed_at;
            const attemptList = attempts[assignment.id];
            return <article className="learning-card classrooms-assignment" key={assignment.id}><div className="classrooms-assignment-head"><div><h4>{assignment.title}</h4><small>Hạn nộp: {dateLabel(assignment.due_at)} · Tối đa {assignment.max_points} điểm{assignment.closed_at ? " · Đã đóng" : ""}</small></div>{isTeacher && !assignment.closed_at && <button type="button" disabled={busy} onClick={() => void run(() => closeClassAssignment(assignment.id))}>Đóng bài</button>}</div><p>{assignment.instructions}</p>{assignment.quiz_id && <p>Quiz: <strong>{assignment.quiz_title ?? "Không còn khả dụng"}</strong></p>}
              {isTeacher ? <button type="button" onClick={() => setGradebookAssignmentId(assignment.id)}>Mở sổ điểm và chấm bài</button> : <div className="classrooms-student-work">{assignment.submitted_at && <p>Đã nộp: {dateLabel(assignment.submitted_at)} · Điểm: {assignment.points ?? "Chờ chấm"}/{assignment.max_points}{assignment.feedback ? ` · Nhận xét: ${assignment.feedback}` : ""}</p>}{assignment.quiz_id && !expired && <><button type="button" disabled={busy} onClick={() => void startQuiz(assignment)}>Làm Quiz</button><button type="button" onClick={() => void loadAttempts(assignment.id)}>Xem lượt Quiz đã hoàn thành</button>{attemptList && <select aria-label={`Chọn lượt Quiz cho ${assignment.title}`} value={chosenAttempts[assignment.id] ?? ""} onChange={event => setChosenAttempts(current => ({ ...current, [assignment.id]: event.target.value }))}><option value="">Chọn lượt làm đã hoàn thành</option>{attemptList.map(attempt => <option key={attempt.id} value={attempt.id}>{dateLabel(attempt.completed_at)} · {attempt.score}/{attempt.total}</option>)}</select>}</>}{!expired && !assignment.submitted_at?.length && <p>Bạn có thể nộp trước hạn và sửa bài cho đến khi giáo viên chấm.</p>}{!expired && !assignment.graded_at && <form onSubmit={event => { event.preventDefault(); void run(() => submitClassAssignment(assignment.id, notes[assignment.id] ?? assignment.note ?? "", chosenAttempts[assignment.id] || null)); }}><label>Ghi chú bài nộp<textarea maxLength={4000} value={notes[assignment.id] ?? assignment.note ?? ""} onChange={event => setNotes(current => ({ ...current, [assignment.id]: event.target.value }))}/></label><button className="primary-button" disabled={busy || !(notes[assignment.id] ?? assignment.note ?? "").trim() && !chosenAttempts[assignment.id]}>{assignment.submitted_at ? "Cập nhật bài nộp" : "Nộp bài"}</button></form>}{assignment.graded_at && <p>Giáo viên đã chấm bài. Liên hệ giáo viên nếu cần điều chỉnh.</p>}{expired && !assignment.submitted_at && <p>Đã hết hạn nộp.</p>}</div>}
            </article>;
          })}{!assignments.length && <p>Chưa có bài tập.</p>}</section>
          {isTeacher && assignments.some(item => item.id === gradebookAssignmentId) && <ClassGradebook key={gradebookAssignmentId} assignment={assignments.find(item => item.id === gradebookAssignmentId)!}/>}
        </>}
      </> : <section className="learning-card"><h3>Chọn một lớp học</h3><p>Tạo lớp hoặc nhận lời mời từ giáo viên để bắt đầu.</p></section>}</div>
    </div>
    {quizSession && <div className="classrooms-quiz-overlay" role="dialog" aria-modal="true" aria-label="Làm Quiz trong lớp"><div className="classrooms-quiz-panel"><header><h3>Quiz lớp học</h3><button type="button" onClick={() => { setQuizSession(null); setQuizResult(null); }}>Đóng</button></header>{quizResult ? <div><h4>Kết quả: {quizResult.score}/{quizResult.total}</h4><p>Quay lại bài tập và bấm “Nộp bài” để ghi kết quả vào lớp.</p><button onClick={() => { setQuizSession(null); setQuizResult(null); }}>Về lớp học</button></div> : <form onSubmit={event => void finishQuiz(event)}>{quizSession.session.questions.map((question, index) => <fieldset key={question.id}><legend>Câu {index+1}: <FormulaText text={question.prompt}/></legend>{question.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`class-quiz-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers(current => current.map((answer, n) => n === index ? optionIndex : answer))}/><FormulaText text={option}/></label>)}</fieldset>)}<button className="primary-button" disabled={busy}><Check size={16}/>Nộp Quiz</button></form>}</div></div>}
  </section>;
}
