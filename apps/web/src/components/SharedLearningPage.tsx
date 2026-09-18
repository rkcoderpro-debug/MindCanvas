import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { labSandboxDocument } from "../lib/lab";
import {
  acceptPendingLearningInvite,
  finishSharedQuiz,
  getSharedCards,
  getSharedContent,
  listLearningShares,
  listPendingLearningInvites,
  rateSharedCard,
  sharedLearningErrorMessage,
  startSharedQuiz,
  type IncomingLearningShare,
  type LearningKind,
  type LearningShareError,
  type SharedQuizResult,
  type SharedQuizSession,
} from "../lib/learningShare";

type Card = { id: string; front: string; back: string; content_version: number };
type CardProgress = { card_id: string; content_version: number; rating: string; reviewed_count: number; due_at: string };

export default function SharedLearningPage({ owner }: { owner: string | null }) {
  const [items, setItems] = useState<IncomingLearningShare[]>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: LearningKind; token_hash: string; expires_at: string }>>([]);
  const [kind, setKind] = useState<"all" | "quiz" | "flashcard" | "lab">("all");
  const [active, setActive] = useState<IncomingLearningShare | null>(null);
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<CardProgress[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quiz, setQuiz] = useState<SharedQuizSession | null>(null);
  const [quizResult, setQuizResult] = useState<SharedQuizResult | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [labFullscreen, setLabFullscreen] = useState(false);
  const [labFallbackFullscreen, setLabFallbackFullscreen] = useState(false);
  const labShellRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    if (!owner) return;
    void listLearningShares().then(setItems).catch(e => setError(sharedLearningErrorMessage(e)));
    void listPendingLearningInvites().then(setPending).catch(e => setError(sharedLearningErrorMessage(e)));
  };

  useEffect(() => { reload(); }, [owner]);

  useEffect(() => {
    if (active?.kind !== "lab" || !content) return;
    const timer = window.setInterval(() => {
      void getSharedContent("lab", active.resource_id).then(latest => {
        if (Number(latest.content_version) > Number(content.content_version)) setNotice("Lab có bản mới. Trở về danh sách và mở lại sau khi hoàn tất mô phỏng hiện tại.");
      }).catch(error => setError(sharedLearningErrorMessage(error, "open")));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [active, content]);

  useEffect(() => {
    const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    const syncFullscreen = () => setLabFullscreen((document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null) === labShellRef.current || labFallbackFullscreen);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen as EventListener);
      if ((document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null) === labShellRef.current) void (document.exitFullscreen?.() ?? documentWithWebkit.webkitExitFullscreen?.() ?? Promise.resolve()).catch(() => {});
    };
  }, [active?.resource_id, labFallbackFullscreen]);

  useEffect(() => {
    if (!labFallbackFullscreen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setLabFallbackFullscreen(false); setLabFullscreen(false); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [labFallbackFullscreen]);

  const toggleLabFullscreen = async () => {
    const shell = labShellRef.current;
    const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    const activeFullscreen = document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null;
    if (activeFullscreen === shell) {
      await (document.exitFullscreen?.() ?? documentWithWebkit.webkitExitFullscreen?.() ?? Promise.resolve()).catch(() => {});
      setLabFullscreen(false);
      return;
    }
    if (labFallbackFullscreen) { setLabFallbackFullscreen(false); setLabFullscreen(false); return; }
    const target = shell as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const request = target?.requestFullscreen ?? target?.webkitRequestFullscreen;
    if (!target || !request) { setLabFallbackFullscreen(true); setLabFullscreen(true); return; }
    try { await request.call(target); setLabFullscreen(true); }
    catch { setLabFallbackFullscreen(true); setLabFullscreen(true); }
  };

  const resetDetail = () => {
    setContent(null); setQuiz(null); setQuizResult(null); setCards([]); setAnswers([]); setQuestionIndex(0);
    setLabFullscreen(false); setLabFallbackFullscreen(false); setNotice("");
  };

  const open = async (item: IncomingLearningShare) => {
    setError(""); resetDetail(); setActive(null);
    if (item.status !== "active") { setError(item.status === "paused" ? "Chủ học liệu đã hạ gói; quyền chia sẻ tạm dừng." : "Học liệu gốc đã bị xóa."); return; }
    try {
      const next = await getSharedContent(item.kind, item.resource_id);
      if (item.kind === "flashcard") {
        const data = await getSharedCards(item.resource_id);
        setCards(data.cards); setProgress(data.progress); setCardIndex(0); setRevealed(false);
      }
      setContent(next); setActive(item);
    } catch (e) { setError(sharedLearningErrorMessage(e, "open")); reload(); }
  };

  const start = async () => {
    if (!active) return;
    setBusy(true); setError("");
    try {
      const session = await startSharedQuiz(active.resource_id);
      setQuiz(session); setQuizResult(null); setAnswers(session.questions.map(() => null)); setQuestionIndex(0);
    } catch (e) { setError(sharedLearningErrorMessage(e, "start")); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!quiz || busy) return;
    setBusy(true); setError("");
    try { setQuizResult(await finishSharedQuiz(quiz.id, answers)); }
    catch (e) {
      // Deliberately do not clear/reload the attempt here. The learner keeps
      // every selected answer and can retry a transient submission failure.
      setError(sharedLearningErrorMessage(e, "submit"));
      const code = (e as LearningShareError | undefined)?.code;
      if (code === "ACCESS_REVOKED" || code === "RESOURCE_REMOVED") reload();
    } finally { setBusy(false); }
  };

  const rate = async (rating: "again" | "hard" | "good" | "easy") => {
    const card = cards[cardIndex]; if (!card || !active) return;
    setBusy(true); setError("");
    try {
      await rateSharedCard(card.id, rating);
      const next = await getSharedCards(active.resource_id); setProgress(next.progress);
      setRevealed(false); setCardIndex(index => cards.length ? (index + 1) % cards.length : 0);
    } catch (e) { setError(sharedLearningErrorMessage(e, "rate")); }
    finally { setBusy(false); }
  };

  if (!owner) return <section className="shared-learning"><h2>Được chia sẻ với tôi</h2><p>Đăng nhập bằng email được mời để nhận và học nội dung.</p></section>;

  const card = cards[cardIndex];
  const cardState = progress.find(p => p.card_id === card?.id);
  const answeredCount = answers.filter(answer => answer !== null).length;
  const reviewQuestions = quizResult?.questions ?? [];

  return <section className="shared-learning">
    <header><div><span className="eyebrow">LEARNING HUB</span><h2>Được chia sẻ với tôi</h2></div><button className="secondary-button" onClick={reload}>Làm mới</button></header>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}
    {active ? <div className="shared-learning-detail">
      <button className="secondary-button shared-back-button" onClick={() => { setActive(null); resetDetail(); reload(); }}>← Danh sách</button>
      <div className="shared-learning-title"><div><span className="eyebrow">{active.kind.toUpperCase()}</span><h3>{active.title}</h3></div><small>Chia sẻ bởi {active.owner_name} · Cập nhật {new Date(active.updated_at).toLocaleDateString("vi-VN")}</small></div>

      {active.kind === "quiz" && (!quiz ? <div className="shared-learning-launch"><p>Bài làm được chấm trên server. Đáp án và lời giải chỉ hiển thị sau khi nộp thành công.</p><button className="primary-button" disabled={busy} onClick={() => void start()}>Làm Quiz</button></div> : <div className="shared-learning-quiz">
        <div className="shared-progress-row"><span>Phiên bản {quiz.version}</span><strong>{quizResult ? `Kết quả ${quizResult.score}/${quizResult.total}` : `${answeredCount}/${quiz.questions.length} câu đã chọn`}</strong></div>
        <div className="shared-progress-track" aria-hidden="true"><span style={{ width: `${quizResult ? 100 : quiz.questions.length ? (questionIndex + 1) / quiz.questions.length * 100 : 0}%` }}/></div>
        {quizResult ? <div className="shared-quiz-results"><div className="shared-result-hero"><CheckCircle2 size={22}/><div><strong>{quizResult.score}/{quizResult.total}</strong><span>Đã nộp thành công</span></div></div>{reviewQuestions.map((q, n) => {
          const selected = answers[n];
          return <article key={q.id}><strong>{n + 1}. {q.prompt}</strong><p>Bạn chọn: {selected === null ? "Bỏ qua" : q.options[selected] ?? "Không hợp lệ"}</p><p>Đáp án: <strong>{q.options[q.correctIndex] ?? "—"}</strong></p><p className="shared-explanation">{q.explanation?.trim() || "Chưa có lời giải"}</p></article>;
        })}<button className="secondary-button" disabled={busy} onClick={() => void start()}><RotateCcw size={15}/>Làm lượt mới</button></div> : <>
          <div className="shared-question-meta">Câu {questionIndex + 1}/{quiz.questions.length}</div>
          <h3>{quiz.questions[questionIndex]?.prompt}</h3>
          <div className="shared-answer-grid">{quiz.questions[questionIndex]?.options.map((option, n) => <button className={`shared-answer ${answers[questionIndex] === n ? "selected" : ""}`} key={n} onClick={() => setAnswers(previous => previous.map((a, i) => i === questionIndex ? n : a))}><span>{String.fromCharCode(65+n)}</span>{option}</button>)}</div>
          <footer><button className="secondary-button" disabled={questionIndex === 0 || busy} onClick={() => setQuestionIndex(i => i-1)}>Trước</button>{questionIndex + 1 < quiz.questions.length ? <button className="primary-button" disabled={busy} onClick={() => setQuestionIndex(i => i+1)}>Tiếp</button> : <button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Đang nộp…" : "Nộp bài"}</button>}</footer>
        </>}
      </div>)}

      {active.kind === "flashcard" && (card ? <div className="shared-learning-card">
        <div className="shared-progress-row"><span>Thẻ {cardIndex+1}/{cards.length}</span><strong>{cardState?.reviewed_count ?? 0} lượt ôn</strong></div>
        <div className="shared-progress-track"><span style={{ width: `${cards.length ? (cardIndex + 1) / cards.length * 100 : 0}%` }}/></div>
        <small>{cardState ? `Ôn tiếp ${new Date(cardState.due_at).toLocaleString("vi-VN")}` : "Thẻ mới"}</small>
        {cardState && cardState.content_version < card.content_version && <p className="form-error">Thẻ đã được sửa, cần ôn lại.</p>}
        <button className={`shared-flip ${revealed ? "revealed" : ""}`} onClick={() => setRevealed(v => !v)}><span>{revealed ? card.back : card.front}</span><small>{revealed ? "Chạm để xem mặt trước" : "Chạm để lật thẻ"}</small></button>
        {revealed && <div className="shared-ratings">{(["again","hard","good","easy"] as const).map(r => <button disabled={busy} key={r} onClick={() => void rate(r)}>{({ again: "Chưa nhớ", hard: "Khó", good: "Đã nhớ", easy: "Dễ" })[r]}</button>)}</div>}
      </div> : <p>Bộ thẻ chưa có thẻ.</p>)}

      {active.kind === "lab" && <><p>Lab chỉ tải phiên bản mới khi bạn mở lại. Chuyển vào/ra toàn màn hình không tải lại mô phỏng.</p><div ref={labShellRef} className={`shared-lab-shell ${labFallbackFullscreen ? "shared-lab-fallback-fullscreen" : ""}`}><div className="shared-lab-toolbar"><span>Lab tương tác</span><button type="button" className="secondary-button" onClick={() => void toggleLabFullscreen()}>{labFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>} {labFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</button></div><iframe className="shared-lab-frame" title={active.title} sandbox="allow-scripts" srcDoc={labSandboxDocument(String(content?.program_html ?? ""))}/></div></>}
    </div> : <>
      {pending.length > 0 && <section className="shared-learning-pending"><h3>Lời mời đang chờ</h3>{pending.map(invite => <article key={invite.id}><span>{invite.kind} · Hạn {new Date(invite.expires_at).toLocaleDateString("vi-VN")}</span><button className="secondary-button" disabled={new Date(invite.expires_at) <= new Date()} onClick={() => void acceptPendingLearningInvite(invite.token_hash).then(reload).catch(e => setError(sharedLearningErrorMessage(e)))}>Nhận lời mời</button></article>)}</section>}
      <div className="shared-learning-filters">{(["all","quiz","flashcard","lab"] as const).map(x => <button key={x} aria-pressed={kind === x} onClick={() => setKind(x)}>{({ all: "Tất cả", quiz: "Quiz", flashcard: "Flashcard", lab: "Lab" })[x]}</button>)}</div>
      <div className="shared-learning-list">{items.filter(item => kind === "all" || item.kind === kind).map(item => <article key={`${item.kind}:${item.resource_id}`}><span>{({ quiz: "Quiz", flashcard: "Flashcard", lab: "Lab" })[item.kind]}</span><h3>{item.title ?? "Học liệu đã xóa"}</h3><small>Người chia sẻ: {item.owner_name} · {item.updated_at ? new Date(item.updated_at).toLocaleDateString("vi-VN") : "—"}</small><p>{item.status === "active" ? "Có quyền truy cập" : item.status === "paused" ? "Tạm dừng: chủ học liệu cần nâng gói" : "Không còn học liệu gốc"}</p><button className="primary-button" disabled={item.status !== "active"} onClick={() => void open(item)}>{item.kind === "quiz" ? "Làm Quiz" : item.kind === "flashcard" ? "Ôn Flashcard" : "Chạy Lab"}</button></article>)}</div>
      {!items.length && <p>Chưa có học liệu được chia sẻ với bạn.</p>}
    </>}
  </section>;
}
