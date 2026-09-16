import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { labSandboxDocument } from "../lib/lab";
import { acceptPendingLearningInvite, finishSharedQuiz, getSharedCards, getSharedContent, listLearningShares, listPendingLearningInvites, rateSharedCard, startSharedQuiz, type IncomingLearningShare, type LearningKind } from "../lib/learningShare";

type Card = { id: string; front: string; back: string; content_version: number };
type Question = { id: string; prompt: string; options: string[]; correctIndex: number; explanation: string };
export default function SharedLearningPage({ owner }: { owner: string | null }) {
  const [items, setItems] = useState<IncomingLearningShare[]>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: LearningKind; token_hash: string; expires_at: string }>>([]);
  const [kind, setKind] = useState<"all" | "quiz" | "flashcard" | "lab">("all");
  const [active, setActive] = useState<IncomingLearningShare | null>(null);
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Array<{ card_id: string; content_version: number; rating: string; reviewed_count: number; due_at: string }>>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quiz, setQuiz] = useState<{ id: string; questions: Question[]; version: number } | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [labFullscreen, setLabFullscreen] = useState(false);
  const [labFallbackFullscreen, setLabFallbackFullscreen] = useState(false);
  const labShellRef = useRef<HTMLDivElement>(null);
  const reload = () => { if (owner) { void listLearningShares().then(setItems).catch(e => setError(e.message)); void listPendingLearningInvites().then(setPending).catch(e => setError(e.message)); } };
  useEffect(() => { reload(); }, [owner]);
  useEffect(() => {
    if (active?.kind !== "lab" || !content) return;
    const timer = window.setInterval(() => {
      void getSharedContent("lab", active.resource_id).then(latest => {
        if (Number(latest.content_version) > Number(content.content_version)) setNotice("Lab có bản mới. Trở về danh sách và mở lại sau khi hoàn tất mô phỏng hiện tại.");
      }).catch(() => setError("Quyền truy cập Lab đã thay đổi. Lần mở tiếp theo sẽ được kiểm tra lại."));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [active, content]);
  useEffect(() => {
    const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    const syncFullscreen = () => setLabFullscreen((document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null) === labShellRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen as EventListener);
      if ((document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null) === labShellRef.current) void (document.exitFullscreen?.() ?? documentWithWebkit.webkitExitFullscreen?.() ?? Promise.resolve()).catch(() => {});
    };
  }, [active?.resource_id]);
  const toggleLabFullscreen = async () => {
    const shell = labShellRef.current;
    const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    const activeFullscreen = document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null;
    if (labFullscreen && activeFullscreen === shell) {
      await (document.exitFullscreen?.() ?? documentWithWebkit.webkitExitFullscreen?.() ?? Promise.resolve()).catch(() => {});
      return;
    }
    if (labFallbackFullscreen) { setLabFallbackFullscreen(false); setLabFullscreen(false); return; }
    const target = shell as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const request = target?.requestFullscreen ?? target?.webkitRequestFullscreen;
    if (!target || !request) { setLabFallbackFullscreen(true); setLabFullscreen(true); return; }
    try { await request.call(target); setLabFullscreen(true); }
    catch { setLabFallbackFullscreen(true); setLabFullscreen(true); }
  };
  const open = async (item: IncomingLearningShare) => {
    setError(""); setNotice(""); setContent(null); setQuiz(null); setCards([]); setActive(null); setLabFullscreen(false); setLabFallbackFullscreen(false);
    if (item.status !== "active") { setError(item.status === "paused" ? "Chủ học liệu đã hạ gói; quyền chia sẻ tạm dừng." : "Học liệu gốc đã bị xóa."); return; }
    try {
      const next = await getSharedContent(item.kind, item.resource_id);
      if (item.kind === "flashcard") { const data = await getSharedCards(item.resource_id); setCards(data.cards); setProgress(data.progress); setCardIndex(0); setRevealed(false); }
      setContent(next); setActive(item);
    } catch { setError("Không thể mở học liệu. Quyền truy cập có thể đã bị thu hồi."); reload(); }
  };
  const start = async () => {
    if (!active) return;
    setBusy(true); setError("");
    try { const session = await startSharedQuiz(active.resource_id); setQuiz(session); setAnswers(session.questions.map(() => null)); setQuestionIndex(0); setScore(null); }
    catch { setError("Không thể bắt đầu: quyền truy cập có thể đã thay đổi."); reload(); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!quiz) return;
    setBusy(true); setError("");
    try { setScore(await finishSharedQuiz(quiz.id, answers)); }
    catch { setError("Không thể nộp bài: quyền truy cập có thể đã bị thu hồi."); reload(); }
    finally { setBusy(false); }
  };
  const rate = async (rating: "again" | "hard" | "good" | "easy") => {
    const card = cards[cardIndex]; if (!card) return;
    setBusy(true); setError("");
    try {
      await rateSharedCard(card.id, rating);
      const next = await getSharedCards(active!.resource_id); setProgress(next.progress);
      setRevealed(false); setCardIndex(index => (index + 1) % cards.length);
    } catch { setError("Không thể lưu tiến độ. Quyền học có thể đã bị thu hồi."); reload(); }
    finally { setBusy(false); }
  };
  if (!owner) return <section className="shared-learning"><h2>Được chia sẻ với tôi</h2><p>Đăng nhập bằng email được mời để nhận và học nội dung.</p></section>;
  const card = cards[cardIndex], cardState = progress.find(p => p.card_id === card?.id);
  return <section className="shared-learning"><header><h2>Được chia sẻ với tôi</h2><button className="secondary-button" onClick={reload}>Làm mới</button></header>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {active ? <div className="shared-learning-detail"><button className="secondary-button" onClick={() => { setActive(null); setContent(null); setQuiz(null); setLabFullscreen(false); setLabFallbackFullscreen(false); reload(); }}>← Danh sách</button><h3>{active.title}</h3><small>Chia sẻ bởi {active.owner_name} · Cập nhật {new Date(active.updated_at).toLocaleDateString("vi-VN")}</small>
      {active.kind === "quiz" && (!quiz ? <button className="primary-button" disabled={busy} onClick={() => void start()}>Làm Quiz</button> : <div className="shared-learning-quiz"><p>Phiên bản bài làm: {quiz.version}</p>{score !== null ? <><strong>Kết quả: {score}/{quiz.questions.length}</strong>{quiz.questions.map((q, n) => <article key={q.id}><strong>{q.prompt}</strong><p>Bạn chọn: {answers[n] === null ? "Bỏ qua" : q.options[answers[n]!]}; đáp án: {q.options[q.correctIndex]}</p><p>{q.explanation}</p></article>)}<button onClick={() => void start()}>Làm lượt mới</button></> : <><p>Câu {questionIndex + 1}/{quiz.questions.length}</p><h3>{quiz.questions[questionIndex].prompt}</h3>{quiz.questions[questionIndex].options.map((option, n) => <button className={`shared-answer ${answers[questionIndex] === n ? "selected" : ""}`} key={n} onClick={() => setAnswers(previous => previous.map((a, i) => i === questionIndex ? n : a))}>{String.fromCharCode(65+n)}. {option}</button>)}<footer><button disabled={questionIndex === 0} onClick={() => setQuestionIndex(i => i-1)}>Trước</button>{questionIndex + 1 < quiz.questions.length ? <button onClick={() => setQuestionIndex(i => i+1)}>Tiếp</button> : <button className="primary-button" disabled={busy} onClick={() => void submit()}>Nộp bài</button>}</footer></>}</div>)}
      {active.kind === "flashcard" && (card ? <div className="shared-learning-card"><p>Thẻ {cardIndex+1}/{cards.length} · {cardState?.reviewed_count ?? 0} lượt ôn · {cardState ? `Ôn tiếp ${new Date(cardState.due_at).toLocaleString("vi-VN")}` : "Thẻ mới"}</p>{cardState && cardState.content_version < card.content_version && <p className="form-error">Thẻ đã được sửa, cần ôn lại.</p>}<button className="shared-flip" onClick={() => setRevealed(v => !v)}>{revealed ? card.back : card.front}<small>{revealed ? "Chạm để xem mặt trước" : "Chạm để lật thẻ"}</small></button>{revealed && <div className="shared-ratings">{(["again","hard","good","easy"] as const).map(r => <button disabled={busy} key={r} onClick={() => void rate(r)}>{({ again: "Chưa nhớ", hard: "Khó", good: "Đã nhớ", easy: "Dễ" })[r]}</button>)}</div>}</div> : <p>Bộ thẻ chưa có thẻ.</p>)}
      {active.kind === "lab" && <><p>Lab chỉ tải phiên bản mới khi bạn mở lại. Trạng thái mô phỏng đang chạy sẽ được giữ nguyên.</p><div ref={labShellRef} className={`shared-lab-shell ${labFallbackFullscreen ? "shared-lab-fallback-fullscreen" : ""}`}><div className="shared-lab-toolbar"><span>Lab tương tác</span><button type="button" className="secondary-button" onClick={() => void toggleLabFullscreen()}>{labFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>} {labFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</button></div><iframe className="shared-lab-frame" title={active.title} sandbox="allow-scripts" srcDoc={labSandboxDocument(String(content?.program_html ?? ""))}/></div></>}
    </div> : <>{pending.length > 0 && <section className="shared-learning-pending"><h3>Lời mời đang chờ</h3>{pending.map(invite => <article key={invite.id}><span>{invite.kind} · Hạn {new Date(invite.expires_at).toLocaleDateString("vi-VN")}</span><button className="secondary-button" disabled={new Date(invite.expires_at) <= new Date()} onClick={() => void acceptPendingLearningInvite(invite.token_hash).then(reload).catch(e => setError(e.message))}>Nhận lời mời</button></article>)}</section>}<div className="shared-learning-filters">{(["all","quiz","flashcard","lab"] as const).map(x => <button key={x} aria-pressed={kind === x} onClick={() => setKind(x)}>{({ all: "Tất cả", quiz: "Quiz", flashcard: "Flashcard", lab: "Lab" })[x]}</button>)}</div><div className="shared-learning-list">{items.filter(item => kind === "all" || item.kind === kind).map(item => <article key={`${item.kind}:${item.resource_id}`}><span>{({ quiz: "Quiz", flashcard: "Flashcard", lab: "Lab" })[item.kind]}</span><h3>{item.title ?? "Học liệu đã xóa"}</h3><small>Người chia sẻ: {item.owner_name} · {item.updated_at ? new Date(item.updated_at).toLocaleDateString("vi-VN") : "—"}</small><p>{item.status === "active" ? "Có quyền truy cập" : item.status === "paused" ? "Tạm dừng: chủ học liệu cần nâng gói" : "Không còn học liệu gốc"}</p><button className="primary-button" disabled={item.status !== "active"} onClick={() => void open(item)}>{item.kind === "quiz" ? "Làm Quiz" : item.kind === "flashcard" ? "Ôn Flashcard" : "Chạy Lab"}</button></article>)}</div>{!items.length && <p>Chưa có học liệu được chia sẻ với bạn.</p>}</>}
  </section>;
}
