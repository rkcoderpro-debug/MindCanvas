import { ActivityViewport, BackButton, PageNavigation, useActivityFocus, useListScrollReturn } from "./PageNavigation";
import { useLearningActive } from "../lib/learningNavigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, FileText, Inbox, RefreshCw, RotateCcw, Save, Search, SlidersHorizontal, Users } from "lucide-react";
import LabViewer from "./LabViewer";
import { cleanLabViewer } from "../lib/labModes";
import FormulaText from "./FormulaText";
import { mergeInboxItems, normalizeIncomingShares, normalizePendingInvites, normalizeCopySources,
  normalizeReceivedLinks, withInboxTimeout, type InboxKind, type InboxWorkspace } from "../lib/sharedInbox";
import { shareReceived, shareErrorText, type ShareReceived } from "../lib/workspaceSharing";
import { workspaceShareUrl } from "../lib/workspaceShareLinks";
import {
  acceptPendingLearningInvite,
  finishSharedQuiz,
  getSharedCards,
  getSharedContent,
  downloadSharedDocument,
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

export type SharedLearningProps = {
  owner: string | null;
  workspace?: InboxWorkspace;
  onSaved?: (kind: LearningKind) => void;
  onSignIn?: () => void;
};

const kindLabels = { all: "Tất cả", quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu", canvas: "Project", folder: "Thư mục" } as const;
const openLabels: Record<InboxKind, string> = {
  quiz: "Làm Quiz", flashcard: "Ôn Flashcard", lab: "Chạy Lab", document: "Xem tài liệu", canvas: "Mở project", folder: "Mở thư mục",
};

export default function SharedLearningPage({ owner, workspace, onSaved, onSignIn }: SharedLearningProps) {
  const [items, setItems] = useState<IncomingLearningShare[]>([]);
  const [links, setLinks] = useState<ShareReceived[]>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: LearningKind; token_hash: string; expires_at: string }>>([]);
  const [kind, setKind] = useState<"all" | InboxKind>("all");
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
  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState("");
  const [opening, setOpening] = useState(false);
  const listRequest = useRef(0);
  const openRequest = useRef(0);
  const ratingLock = useRef(false);
  const includeWorkspace = !!workspace;
  const learningActive = useLearningActive();

  const reload = useCallback(() => {
    const request = ++listRequest.current;
    if (!owner) return;
    setListLoading(true); setListError("");
    void Promise.allSettled([
      withInboxTimeout(Promise.resolve().then(listLearningShares).then(normalizeIncomingShares)),
      withInboxTimeout(Promise.resolve().then(listPendingLearningInvites).then(normalizePendingInvites)),
      withInboxTimeout(Promise.resolve().then(listMyLearningCopySources).then(normalizeCopySources)),
      includeWorkspace
        ? withInboxTimeout(Promise.resolve().then(() => shareReceived()).then(normalizeReceivedLinks))
        : Promise.resolve([]),
    ]).then(([shares, invites, copies, received]) => {
      if (request !== listRequest.current) return;
      if (shares.status === "fulfilled") setItems(shares.value);
      if (received.status === "fulfilled") setLinks(received.value);
      if (shares.status === "fulfilled" && received.status === "fulfilled") setListLoaded(true);
      if (invites.status === "fulfilled") setPending(invites.value);
      if (copies.status === "fulfilled") setSavedCopies(copies.value);
      const failures = [shares, invites, copies].flatMap(result => result.status === "rejected" ? [sharedLearningErrorMessage(result.reason)] : []);
      if (received.status === "rejected") failures.push(shareErrorText(received.reason, true));
      setListError([...new Set(failures)].join(" "));
      setListLoading(false);
    });
  }, [owner, includeWorkspace]);

  const refreshAll = () => { reload(); void workspace?.refresh(); };
  const inbox = mergeInboxItems(items, workspace?.projects ?? [], links);
  const visibleItems = inbox
    .filter(item => kind === "all" || item.kind === kind)
    .filter(item => !query.trim() || `${item.title} ${item.ownerName ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "vi") : (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const activeCount = inbox.filter(item => item.status === "active").length;

  useEffect(() => {
    setItems([]); setLinks([]); setPending([]); setSavedCopies([]); setActive(null);
    setContent(null); setCards([]); setProgress([]); setQuiz(null); setQuizResult(null);
    setAnswers([]); setQuizFeedback({}); setError(""); setNotice("");
    setListLoaded(false); setListError(""); setListLoading(false); setOpening(false);
    return () => { ++listRequest.current; ++openRequest.current; };
  }, [reload]);
  useEffect(() => {
    if (!owner || !learningActive) return;
    reload();
    if (!includeWorkspace) return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [owner, learningActive, includeWorkspace, reload]);

  useEffect(() => {
    if (active?.kind !== "lab" || !content) return;
    const timer = window.setInterval(() => {
      void getSharedContent("lab", active.resource_id).then(latest => {
        if (Number(latest.content_version) > Number(content.content_version)) setNotice("Lab có bản mới. Trở về danh sách và mở lại sau khi hoàn tất mô phỏng hiện tại.");
      }).catch(error => setError(sharedLearningErrorMessage(error, "open")));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [active, content]);

  const resetDetail = () => {
    setContent(null); setQuiz(null); setQuizResult(null); setQuizFeedback({}); setCards([]); setAnswers([]); setQuestionIndex(0);
    setNotice("");
  };

  const open = async (item: IncomingLearningShare) => {
    const request = ++openRequest.current;
    setError(""); resetDetail(); setActive(null);
    if (item.status !== "active") { setError(item.status === "paused" ? "Chủ học liệu đã hạ gói; quyền chia sẻ tạm dừng." : "Học liệu gốc đã bị xóa."); return; }
    setOpening(true);
    try {
      const next = await withInboxTimeout(getSharedContent(item.kind, item.resource_id));
      if (request !== openRequest.current) return;
      if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("Không thể đọc học liệu. Hãy thử lại.");
      if (item.kind === "flashcard") {
        const data = await withInboxTimeout(getSharedCards(item.resource_id));
        if (request !== openRequest.current) return;
        if (!Array.isArray(data.cards) || !Array.isArray(data.progress)) throw new Error("Dữ liệu thẻ không hợp lệ. Hãy thử lại.");
        setCards(data.cards); setProgress(data.progress); setCardIndex(0); setRevealed(false);
      }
      setContent(next); setActive(item);
    } catch (e) { if (request === openRequest.current) { setError(sharedLearningErrorMessage(e, "open")); reload(); } }
    finally { if (request === openRequest.current) setOpening(false); }
  };

  const start = async () => {
    if (!active) return;
    setBusy(true); setError("");
    try {
      const session = quizRevealMode === "instant" ? await startSharedQuizImmediate(active.resource_id) : await startSharedQuiz(active.resource_id);
      if (!session || !Array.isArray(session.questions) || !session.questions.length || session.questions.some(question => !question || !Array.isArray(question.options) || question.options.some(option => typeof option !== "string"))) throw new Error("Dữ liệu Quiz không hợp lệ. Hãy thử lại.");
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
    const card = cards[cardIndex]; if (!card || !active || ratingLock.current) return;
    ratingLock.current = true;
    setBusy(true); setError("");
    try {
      await rateSharedCard(card.id, rating);
      const next = await getSharedCards(active.resource_id); setProgress(next.progress);
      setRevealed(false); setCardIndex(index => cards.length ? (index + 1) % cards.length : 0);
    } catch (e) { setError(sharedLearningErrorMessage(e, "rate")); }
    finally { ratingLock.current = false; setBusy(false); }
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

  const downloadOriginal = async (id: string) => {
    setBusy(true); setError("");
    try {
      const { blob, name } = await downloadSharedDocument(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = name.replace(/[\\/:*?"<>|]/g, "_");
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(sharedLearningErrorMessage(cause, "open")); }
    finally { setBusy(false); }
  };

  const duplicate = async (project: InboxWorkspace["projects"][number]) => {
    if (!workspace || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await workspace.duplicate(project, `${project.title} — Bản sao`);
      setNotice("Đã lưu bản sao vào Workspace.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu bản sao project.");
    } finally { setBusy(false); }
  };

  const card = cards[cardIndex];
  const cardState = progress.find(p => p.card_id === card?.id);
  const answeredCount = answers.filter(answer => answer !== null).length;
  const reviewQuestions = quizResult?.questions ?? [];
  const listScroll = useListScrollReturn();
  const fits = !!active && (active.kind === "lab" || active.kind === "flashcard" || (active.kind === "quiz" && !!quiz));
  const activityFocus = useActivityFocus(learningActive && fits);
  if (!owner) return <section className="shared-learning"><h2>Được chia sẻ với tôi</h2><p>Đăng nhập để xem nội dung được chia sẻ với tài khoản của bạn.</p>{onSignIn && <button className="primary-button" onClick={onSignIn}>Đăng nhập</button>}</section>;

  return <section className="shared-learning">
    <header className="shared-learning-header"><div><h2>Được chia sẻ với tôi</h2><p className="shared-learning-subtitle">Tìm lại nội dung nhận qua tin nhắn, lời mời và link chia sẻ đã mở khi đăng nhập.</p></div><button className="secondary-button" disabled={listLoading} onClick={refreshAll}><RefreshCw size={15}/>Làm mới</button></header>
    {listError && <div role="alert" className="shared-inbox-error"><p>{listError}</p><button className="secondary-button" disabled={listLoading} onClick={refreshAll}>Thử lại</button></div>}
    {(listLoading || workspace?.loading) && <p role="status">Đang tải nội dung chia sẻ…</p>}{opening && <p role="status">Đang mở học liệu…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}
    {active ? <ActivityViewport inline={!fits} ref={activityFocus} className={`shared-learning-detail${fits ? " activity-screen activity-shared" : ""}`}>
      <PageNavigation quickActions back={<BackButton className="shared-back-button" onClick={() => { setActive(null); resetDetail(); reload(); listScroll.restore(); }}>Học liệu chia sẻ</BackButton>} title={active.title} context={`Chia sẻ bởi ${active.owner_name}`} actions={active.status === "active" && <button className="secondary-button" disabled={busy || savedCopies.some(copy => copy.kind === active.kind && copy.source_id === active.resource_id)} onClick={() => void saveCopy(active)}><Save size={15}/>{savedCopies.some(copy => copy.kind === active.kind && copy.source_id === active.resource_id) ? "Đã lưu vào của tôi" : "Lưu vào của tôi"}</button>}/>
      {fits && error && <p role="alert" className="form-error">{error}</p>}

      {active.kind === "quiz" && (!quiz ? <div className="shared-learning-launch"><p>Bài làm được chấm trên server. Chọn lúc xem đáp án trước khi bắt đầu.</p><label>Hiện đáp án<select value={quizRevealMode} disabled={busy} onChange={event => setQuizRevealMode(event.target.value as "instant" | "submit")}><option value="instant">Ngay khi chọn</option><option value="submit">Sau khi nộp bài</option></select></label><button className="primary-button" disabled={busy} onClick={() => void start()}>Làm Quiz</button></div> : <div className="shared-learning-quiz">
        <div className="shared-progress-row"><span>Phiên bản {quiz.version}</span><strong>{quizResult ? `Kết quả ${quizResult.score}/${quizResult.total}` : `${answeredCount}/${quiz.questions.length} câu đã chọn`}</strong></div>
        <div className="shared-progress-track" aria-hidden="true"><span style={{ width: `${quizResult ? 100 : quiz.questions.length ? (questionIndex + 1) / quiz.questions.length * 100 : 0}%` }}/></div>
        {quizResult ? <div className="shared-quiz-results activity-content"><div className="shared-result-hero"><CheckCircle2 size={22}/><div><strong>{quizResult.score}/{quizResult.total}</strong><span>Đã nộp thành công</span></div></div>{reviewQuestions.map((q, n) => {
          const selected = answers[n];
          return <article key={q.id}><strong>{n + 1}. <FormulaText text={q.prompt}/></strong><p>Bạn chọn: {selected === null ? "Bỏ qua" : q.options[selected] ? <FormulaText text={q.options[selected]}/> : "Không hợp lệ"}</p><p>Đáp án: <strong>{q.options[q.correctIndex] ? <FormulaText text={q.options[q.correctIndex]}/> : "—"}</strong></p><p className="shared-explanation"><FormulaText text={q.explanation?.trim() || "Chưa có lời giải"}/></p></article>;
        })}<button className="secondary-button" disabled={busy} onClick={() => void start()}><RotateCcw size={15}/>Làm lượt mới</button></div> : <>
          <div className="activity-content" key={questionIndex}>
          <div className="shared-question-meta">Câu {questionIndex + 1}/{quiz.questions.length}</div>
          <h3><FormulaText text={quiz.questions[questionIndex]?.prompt ?? ""}/></h3>
          <div className="shared-answer-grid">{quiz.questions[questionIndex]?.options.map((option, n) => <button disabled={busy || !!quizFeedback[questionIndex]} className={`shared-answer ${answers[questionIndex] === n ? "selected" : ""} ${quizFeedback[questionIndex]?.correctIndex === n ? "correct" : ""} ${answers[questionIndex] === n && quizFeedback[questionIndex]?.correctIndex !== undefined && quizFeedback[questionIndex]?.correctIndex !== n ? "wrong" : ""}`} key={n} onClick={() => void chooseQuizAnswer(n)}><span className="shared-answer-label">{String.fromCharCode(65+n)}</span><span className="shared-answer-content"><FormulaText text={option}/></span></button>)}</div>
          {quizFeedback[questionIndex] && <p className="shared-explanation" role="status">{answers[questionIndex] === quizFeedback[questionIndex].correctIndex ? "Chính xác." : <>Đáp án đúng: <FormulaText text={quiz.questions[questionIndex]?.options[quizFeedback[questionIndex].correctIndex] ?? "—"}/>.</>} <FormulaText text={quizFeedback[questionIndex].explanation ?? ""}/></p>}
          </div><footer><button className="secondary-button" disabled={questionIndex === 0 || busy} onClick={() => setQuestionIndex(i => i-1)}>Trước</button>{questionIndex + 1 < quiz.questions.length ? <button className="primary-button" disabled={busy || (quizRevealMode === "instant" && answers[questionIndex] === null)} onClick={() => setQuestionIndex(i => i+1)}>Tiếp</button> : <button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Đang nộp…" : "Nộp bài"}</button>}</footer>
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

      {active.kind === "lab" && <LabViewer fitViewport key={active.resource_id} frameClassName="shared-lab-frame" html={String(content?.program_html ?? "")} title={active.title} allowExternalResources={content?.allow_external_resources === true} viewerConfig={cleanLabViewer(content?.viewer_config)}/>}
      {active.kind === "document" && <div className="shared-document-card"><FileText size={25}/><div><strong>{String(content?.file_name ?? active.title)}</strong><p>{Number(content?.file_size_bytes) ? `${(Number(content?.file_size_bytes) / (1024 * 1024)).toFixed(1)} MB` : "Tài liệu"} · Bản gốc không bị thay đổi.</p><small>Lưu bản sao để tài liệu được thêm vào thư viện Tài liệu của bạn.</small><button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadOriginal(active.resource_id)}>Tải bản gốc</button></div></div>}
    </ActivityViewport> : <>
      {pending.length > 0 && <section className="shared-learning-pending"><h3>Lời mời đang chờ</h3>{pending.map(invite => <article key={invite.id}><span>{invite.kind} · Hạn {new Date(invite.expires_at).toLocaleDateString("vi-VN")}</span><button className="secondary-button" disabled={new Date(invite.expires_at) <= new Date()} onClick={() => void acceptPendingLearningInvite(invite.token_hash).then(reload).catch(e => setError(sharedLearningErrorMessage(e)))}>Nhận lời mời</button></article>)}</section>}
      <div className="shared-learning-summary" aria-label="Tóm tắt nội dung chia sẻ">
        <article><Inbox size={18}/><strong>{inbox.length}</strong><span>Tổng nội dung</span></article>
        <article><Users size={18}/><strong>{activeCount}</strong><span>Có quyền truy cập</span></article>
        <article><Clock3 size={18}/><strong>{inbox.length - activeCount}</strong><span>Cần kiểm tra</span></article>
      </div>
      <div className="shared-learning-controls">
        <div className="shared-learning-filters">{(Object.keys(kindLabels) as Array<keyof typeof kindLabels>).map(value =>
          <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{kindLabels[value]}
            <small>{value === "all" ? inbox.length : inbox.filter(item => item.kind === value).length}</small>
          </button>)}</div>
        <label className="shared-learning-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc người chia sẻ…" aria-label="Tìm nội dung được chia sẻ"/></label>
        <label className="shared-learning-sort"><SlidersHorizontal size={15}/><select value={sort} onChange={event => setSort(event.target.value as "updated" | "title")} aria-label="Sắp xếp nội dung"><option value="updated">Mới nhất</option><option value="title">Tên A–Z</option></select></label>
      </div>
      <div className="shared-learning-list">{visibleItems.map(item => {
        const { learning, project, link } = item;
        const canSaveLearning = learning?.status === "active";
        const saved = learning && savedCopies.some(copy => copy.kind === learning.kind && copy.source_id === learning.resource_id);
        const canEdit = link?.role === "editor" || project?.accessRole === "editor";
        const openLink = link && (link.role === "editor" ? project?.accessRole !== "editor" : !project && !canSaveLearning);
        return <article className={`shared-learning-item status-${item.status}`} key={item.key}>
          <div className="shared-learning-item-top">
            <span className="shared-learning-kind">{kindLabels[item.kind]}</span>
            <span className={`shared-learning-status status-${item.status}`}>{item.status === "active" ? canEdit ? "Có thể chỉnh sửa" : "Có quyền truy cập" : item.status === "paused" ? "Tạm dừng" : "Đã gỡ"}</span>
          </div>
          <h3>{item.title}</h3>
          {item.ownerName && <small>Chia sẻ bởi <strong>{item.ownerName}</strong></small>}
          {item.date && <small>{new Date(item.date).toLocaleDateString("vi-VN")}</small>}
          {item.status !== "active" && <p>{item.status === "paused" ? "Chủ học liệu đã tạm dừng quyền truy cập." : "Học liệu gốc không còn khả dụng."}</p>}
          <div className="shared-learning-item-actions">
            {openLink && link ? <a className="primary-button" href={workspaceShareUrl(link.token)}>{openLabels[item.kind]}</a>
              : project && workspace ? <button className="primary-button" onClick={() => workspace.open(project)}>{openLabels[item.kind]}</button>
              : learning && <button className="primary-button" disabled={!canSaveLearning || opening} onClick={() => { listScroll.remember(); void open(learning); }}>{openLabels[item.kind]}</button>}
            {learning && (canSaveLearning || !link) && <button className="secondary-button" disabled={!canSaveLearning || busy || saved} onClick={() => void saveCopy(learning)}><Save size={14}/>{saved ? "Đã lưu" : busy ? "Đang lưu…" : "Lưu vào của tôi"}</button>}
            {project && <button className="secondary-button" disabled={busy} onClick={() => void duplicate(project)}><Save size={14}/>Lưu bản sao</button>}
          </div>
        </article>;
      })}</div>
      {!listLoading && !workspace?.loading && listLoaded && !inbox.length && <div className="shared-learning-empty"><Inbox size={34}/><h3>Chưa có nội dung được chia sẻ</h3><p>Nội dung gửi trực tiếp đến tài khoản này sẽ xuất hiện ở đây. Với link công khai, hãy đăng nhập rồi mở link để lưu vào danh sách.</p></div>}
      {inbox.length > 0 && !visibleItems.length && <div className="shared-learning-empty"><Search size={30}/><h3>Không tìm thấy kết quả</h3><p>Thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p></div>}
    </>}
  </section>;
}
