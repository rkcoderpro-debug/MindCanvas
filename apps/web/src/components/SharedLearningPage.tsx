import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, FileText, Inbox, Maximize2, Minimize2, RefreshCw, RotateCcw, Save, Search, SlidersHorizontal, Users } from "lucide-react";
import { labSandboxDocument } from "../lib/lab";
import {
  acceptPendingLearningInvite,
  finishSharedQuiz,
  getSharedCards,
  getSharedContent,
  listLearningShares,
  listMyLearningCopySources,
  listPendingLearningInvites,
  rateSharedCard,
  revealSharedQuizAnswer,
  sharedLearningErrorMessage,
  saveSharedLearningCopy,
  startSharedQuiz,
  startSharedQuizImmediate,
  type IncomingLearningShare,
  type LearningKind,
  type LearningCopySource,
  type LearningShareError,
  type SharedQuizResult,
  type SharedQuizSession,
  type SharedQuizAnswerFeedback,
} from "../lib/learningShare";

type Card = { id: string; front: string; back: string; content_version: number };
type CardProgress = { card_id: string; content_version: number; rating: string; reviewed_count: number; due_at: string };

export default function SharedLearningPage({ owner, onSaved }: { owner: string | null; onSaved?: (kind: LearningKind) => void }) {
  const [items, setItems] = useState<IncomingLearningShare[]>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: LearningKind; token_hash: string; expires_at: string }>>([]);
  const [kind, setKind] = useState<"all" | LearningKind>("all");
  const [savedCopies, setSavedCopies] = useState<LearningCopySource[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "title">("updated");
  const [active, setActive] = useState<IncomingLearningShare | null>(null);
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<CardProgress[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quiz, setQuiz] = useState<SharedQuizSession | null>(null);
  const [quizResult, setQuizResult] = useState<SharedQuizResult | null>(null);
  const [quizRevealMode, setQuizRevealMode] = useState<"instant" | "submit">("submit");
  const [quizFeedback, setQuizFeedback] = useState<Record<number, SharedQuizAnswerFeedback>>({});
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [labFullscreen, setLabFullscreen] = useState(false);
  const [labFallbackFullscreen, setLabFallbackFullscreen] = useState(false);
  const [allowSharedExternalResources, setAllowSharedExternalResources] = useState(false);
  const labShellRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    if (!owner) return;
    void Promise.all([listLearningShares(), listPendingLearningInvites(), listMyLearningCopySources()])
      .then(([shares, invites, copies]) => { setItems(shares); setPending(invites); setSavedCopies(copies); })
      .catch(e => setError(sharedLearningErrorMessage(e)));
  };

  const visibleItems = items
    .filter(item => kind === "all" || item.kind === kind)
    .filter(item => !query.trim() || `${item.title} ${item.owner_name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "vi") : b.updated_at.localeCompare(a.updated_at));
  const activeCount = items.filter(item => item.status === "active").length;
  const pausedCount = items.filter(item => item.status === "paused").length;
  const removedCount = items.filter(item => item.status === "removed").length;

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
    setContent(null); setQuiz(null); setQuizResult(null); setQuizFeedback({}); setCards([]); setAnswers([]); setQuestionIndex(0);
    setLabFullscreen(false); setLabFallbackFullscreen(false); setAllowSharedExternalResources(false); setNotice("");
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
      const session = quizRevealMode === "instant" ? await startSharedQuizImmediate(active.resource_id) : await startSharedQuiz(active.resource_id);
      setQuiz(session); setQuizResult(null); setQuizFeedback({}); setAnswers(session.questions.map(() => null)); setQuestionIndex(0);
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

  const chooseQuizAnswer = async (optionIndex: number) => {
    if (!quiz || busy || quizResult || (quizRevealMode === "instant" && quizFeedback[questionIndex])) return;
    if (quizRevealMode === "submit") {
      setAnswers(previous => previous.map((answer, index) => index === questionIndex ? optionIndex : answer));
      return;
    }
    setBusy(true); setError("");
    try {
      const feedback = await revealSharedQuizAnswer(quiz.id, questionIndex, optionIndex);
      setAnswers(previous => previous.map((answer, index) => index === questionIndex ? optionIndex : answer));
      setQuizFeedback(previous => ({ ...previous, [questionIndex]: feedback }));
    } catch (e) { setError(sharedLearningErrorMessage(e, "submit")); }
    finally { setBusy(false); }
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

  const saveCopy = async (item: IncomingLearningShare) => {
    if (!owner || item.status !== "active" || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveSharedLearningCopy(item.kind, item.resource_id);
      const copy: LearningCopySource = {
        kind: item.kind, copy_id: result.copyId, source_id: item.resource_id,
        source_title: item.title, owner_name: item.owner_name, saved_at: new Date().toISOString(),
      };
      setSavedCopies(current => [copy, ...current.filter(saved => !(saved.kind === copy.kind && saved.source_id === copy.source_id))]);
      setNotice(result.alreadySaved ? "Bản sao đã có trong thư viện của bạn." : "Đã lưu bản sao độc lập vào thư viện của bạn.");
      onSaved?.(item.kind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu học liệu vào thư viện.");
    } finally { setBusy(false); }
  };

  if (!owner) return <section className="shared-learning"><h2>Được chia sẻ với tôi</h2><p>Đăng nhập bằng email được mời để nhận và học nội dung.</p></section>;

  const card = cards[cardIndex];
  const cardState = progress.find(p => p.card_id === card?.id);
  const answeredCount = answers.filter(answer => answer !== null).length;
  const reviewQuestions = quizResult?.questions ?? [];

  return <section className="shared-learning">
    <header className="shared-learning-header"><div><span className="eyebrow">LEARNING HUB · INBOX</span><h2>Được chia sẻ với tôi</h2><p className="shared-learning-subtitle">Tập trung Quiz, Flashcard, Lab và Tài liệu; lưu bản sao vào thư viện cá nhân để tiếp tục sử dụng.</p></div><button className="secondary-button" onClick={reload}><RefreshCw size={15}/>Làm mới</button></header>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}
    {active ? <div className="shared-learning-detail">
      <button className="secondary-button shared-back-button" onClick={() => { setActive(null); resetDetail(); reload(); }}>← Danh sách</button>
      <div className="shared-learning-title"><div><span className="eyebrow">{active.kind.toUpperCase()}</span><h3>{active.title}</h3></div><small>Chia sẻ bởi {active.owner_name} · Cập nhật {new Date(active.updated_at).toLocaleDateString("vi-VN")}</small>{active.status === "active" && <button className="secondary-button" disabled={busy || savedCopies.some(copy => copy.kind === active.kind && copy.source_id === active.resource_id)} onClick={() => void saveCopy(active)}><Save size={15}/>{savedCopies.some(copy => copy.kind === active.kind && copy.source_id === active.resource_id) ? "Đã lưu vào của tôi" : "Lưu vào của tôi"}</button>}</div>

      {active.kind === "quiz" && (!quiz ? <div className="shared-learning-launch"><p>Bài làm được chấm trên server. Chọn lúc xem đáp án trước khi bắt đầu.</p><label>Hiện đáp án<select value={quizRevealMode} disabled={busy} onChange={event => setQuizRevealMode(event.target.value as "instant" | "submit")}><option value="instant">Ngay khi chọn</option><option value="submit">Sau khi nộp bài</option></select></label><button className="primary-button" disabled={busy} onClick={() => void start()}>Làm Quiz</button></div> : <div className="shared-learning-quiz">
        <div className="shared-progress-row"><span>Phiên bản {quiz.version}</span><strong>{quizResult ? `Kết quả ${quizResult.score}/${quizResult.total}` : `${answeredCount}/${quiz.questions.length} câu đã chọn`}</strong></div>
        <div className="shared-progress-track" aria-hidden="true"><span style={{ width: `${quizResult ? 100 : quiz.questions.length ? (questionIndex + 1) / quiz.questions.length * 100 : 0}%` }}/></div>
        {quizResult ? <div className="shared-quiz-results"><div className="shared-result-hero"><CheckCircle2 size={22}/><div><strong>{quizResult.score}/{quizResult.total}</strong><span>Đã nộp thành công</span></div></div>{reviewQuestions.map((q, n) => {
          const selected = answers[n];
          return <article key={q.id}><strong>{n + 1}. {q.prompt}</strong><p>Bạn chọn: {selected === null ? "Bỏ qua" : q.options[selected] ?? "Không hợp lệ"}</p><p>Đáp án: <strong>{q.options[q.correctIndex] ?? "—"}</strong></p><p className="shared-explanation">{q.explanation?.trim() || "Chưa có lời giải"}</p></article>;
        })}<button className="secondary-button" disabled={busy} onClick={() => void start()}><RotateCcw size={15}/>Làm lượt mới</button></div> : <>
          <div className="shared-question-meta">Câu {questionIndex + 1}/{quiz.questions.length}</div>
          <h3>{quiz.questions[questionIndex]?.prompt}</h3>
          <div className="shared-answer-grid">{quiz.questions[questionIndex]?.options.map((option, n) => <button disabled={busy || !!quizFeedback[questionIndex]} className={`shared-answer ${answers[questionIndex] === n ? "selected" : ""} ${quizFeedback[questionIndex]?.correctIndex === n ? "correct" : ""} ${answers[questionIndex] === n && quizFeedback[questionIndex]?.correctIndex !== undefined && quizFeedback[questionIndex]?.correctIndex !== n ? "wrong" : ""}`} key={n} onClick={() => void chooseQuizAnswer(n)}><span>{String.fromCharCode(65+n)}</span>{option}</button>)}</div>
          {quizFeedback[questionIndex] && <p className="shared-explanation" role="status">{answers[questionIndex] === quizFeedback[questionIndex].correctIndex ? "Chính xác." : `Đáp án đúng: ${quiz.questions[questionIndex]?.options[quizFeedback[questionIndex].correctIndex] ?? "—"}.`} {quizFeedback[questionIndex].explanation}</p>}
          <footer><button className="secondary-button" disabled={questionIndex === 0 || busy} onClick={() => setQuestionIndex(i => i-1)}>Trước</button>{questionIndex + 1 < quiz.questions.length ? <button className="primary-button" disabled={busy || (quizRevealMode === "instant" && answers[questionIndex] === null)} onClick={() => setQuestionIndex(i => i+1)}>Tiếp</button> : <button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Đang nộp…" : "Nộp bài"}</button>}</footer>
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

      {active.kind === "lab" && <><p>Lab chỉ tải phiên bản mới khi bạn mở lại. Chuyển vào/ra toàn màn hình không tải lại mô phỏng.</p><div ref={labShellRef} className={`shared-lab-shell ${labFallbackFullscreen ? "shared-lab-fallback-fullscreen" : ""}`}><div className="shared-lab-toolbar"><span>Lab tương tác</span><button type="button" className="secondary-button" onClick={() => void toggleLabFullscreen()}>{labFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>} {labFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</button></div>{content?.allow_external_resources === true && !allowSharedExternalResources ? <div className="shared-lab-external-consent" role="note"><p>Lab này tải thư viện từ CDN: unpkg, jsDelivr, cdn.tailwindcss.com và cdnjs. API/Gemini bị chặn; localStorage chỉ lưu tạm trong phiên và không đọc được dữ liệu MindCanvas. Chỉ tiếp tục nếu bạn tin cậy nội dung được chia sẻ.</p><button type="button" className="primary-button" onClick={() => setAllowSharedExternalResources(true)}>Cho phép tải thư viện và chạy Lab</button></div> : <iframe className="shared-lab-frame" title={active.title} sandbox="allow-scripts" srcDoc={labSandboxDocument(String(content?.program_html ?? ""), { allowExternalResources: content?.allow_external_resources === true && allowSharedExternalResources })}/>}</div></>}
      {active.kind === "document" && <div className="shared-document-card"><FileText size={25}/><div><strong>{String(content?.file_name ?? active.title)}</strong><p>{Number(content?.file_size_bytes) ? `${(Number(content?.file_size_bytes) / (1024 * 1024)).toFixed(1)} MB` : "Tài liệu"} · Bản gốc không bị thay đổi.</p><small>Lưu bản sao để tài liệu được thêm vào thư viện Tài liệu của bạn.</small></div></div>}
    </div> : <>
      {pending.length > 0 && <section className="shared-learning-pending"><h3>Lời mời đang chờ</h3>{pending.map(invite => <article key={invite.id}><span>{invite.kind} · Hạn {new Date(invite.expires_at).toLocaleDateString("vi-VN")}</span><button className="secondary-button" disabled={new Date(invite.expires_at) <= new Date()} onClick={() => void acceptPendingLearningInvite(invite.token_hash).then(reload).catch(e => setError(sharedLearningErrorMessage(e)))}>Nhận lời mời</button></article>)}</section>}
      <div className="shared-learning-summary" aria-label="Tóm tắt học liệu chia sẻ"><article><Inbox size={18}/><strong>{items.length}</strong><span>Tổng học liệu</span></article><article><Users size={18}/><strong>{activeCount}</strong><span>Đang truy cập</span></article><article><Clock3 size={18}/><strong>{pausedCount + removedCount}</strong><span>Cần kiểm tra</span></article></div>
      <div className="shared-learning-controls"><div className="shared-learning-filters">{(["all","quiz","flashcard","lab","document"] as const).map(x => <button key={x} aria-pressed={kind === x} onClick={() => setKind(x)}>{({ all: "Tất cả", quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu" })[x]}<small>{x === "all" ? items.length : items.filter(item => item.kind === x).length}</small></button>)}</div><label className="shared-learning-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc người chia sẻ…" aria-label="Tìm học liệu được chia sẻ"/></label><label className="shared-learning-sort"><SlidersHorizontal size={15}/><select value={sort} onChange={event => setSort(event.target.value as "updated" | "title")} aria-label="Sắp xếp học liệu"><option value="updated">Mới cập nhật</option><option value="title">Tên A–Z</option></select></label></div>
      <div className="shared-learning-list">{visibleItems.map(item => { const saved = savedCopies.some(copy => copy.kind === item.kind && copy.source_id === item.resource_id); return <article className={`shared-learning-item status-${item.status}`} key={`${item.kind}:${item.resource_id}`}><div className="shared-learning-item-top"><span className="shared-learning-kind">{({ quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu" })[item.kind]}</span><span className={`shared-learning-status status-${item.status}`}>{item.status === "active" ? "Có quyền truy cập" : item.status === "paused" ? "Tạm dừng" : "Đã gỡ"}</span></div><h3>{item.title ?? "Học liệu đã xóa"}</h3><small>Chia sẻ bởi <strong>{item.owner_name}</strong></small><small>Cập nhật {item.updated_at ? new Date(item.updated_at).toLocaleDateString("vi-VN") : "—"}</small><p>{item.status === "active" ? "Bạn có thể mở và lưu bản sao vào thư viện cá nhân." : item.status === "paused" ? "Chủ học liệu đã tạm dừng quyền truy cập." : "Học liệu gốc không còn khả dụng."}</p><div className="shared-learning-item-actions"><button className="primary-button" disabled={item.status !== "active"} onClick={() => void open(item)}>{item.kind === "quiz" ? "Làm Quiz" : item.kind === "flashcard" ? "Ôn Flashcard" : item.kind === "lab" ? "Chạy Lab" : "Xem tài liệu"}</button><button className="secondary-button" disabled={item.status !== "active" || busy || saved} onClick={() => void saveCopy(item)}><Save size={14}/>{saved ? "Đã lưu" : busy ? "Đang lưu…" : "Lưu vào của tôi"}</button></div></article>; })}</div>
      {!items.length && <div className="shared-learning-empty"><Inbox size={34}/><h3>Chưa có học liệu được chia sẻ</h3><p>Khi ai đó gửi Quiz, Flashcard, Lab hoặc Tài liệu đến tài khoản này, nội dung sẽ xuất hiện ở đây.</p></div>}
      {items.length > 0 && !visibleItems.length && <div className="shared-learning-empty"><Search size={30}/><h3>Không tìm thấy kết quả</h3><p>Thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p></div>}
    </>}
  </section>;
}
