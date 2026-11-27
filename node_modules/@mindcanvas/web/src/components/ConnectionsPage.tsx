import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Ban, BookOpen, Check, Copy, FileText, Folder, FlaskConical, ListChecks, MessageCircle, MoreHorizontal, RefreshCw, Search, Send, UserPlus, Users, X } from "lucide-react";
import {
  blockConnection, cancelConnectionInvitation, createConnectionInvitation, listBlockedConnections, listConnectionInvitations,
  listConnections, listDirectMessages, markDirectMessagesRead, removeConnection,
  reportConnection, respondConnectionInvitation, sendDirectMessage, unblockConnection,
  type BlockedConnection, type Connection, type ConnectionInvitation, type DirectMessage,
} from "../lib/connections";
import { ProfileAvatar } from "./ProfileAvatar";
import { copyTextWithFallback } from "../lib/share";
import { openShareInSameTab, sharedLearningUrl, sharedLearningTarget, workspaceShareUrl, type SharedLearningTarget } from "../lib/workspaceShareLinks";
import { useLearningActive } from "../lib/learningNavigation";

const resourceLabels = { quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu" };
const resourceIcons = { quiz: ListChecks, flashcard: BookOpen, lab: FlaskConical, document: FileText };

function messagePreview(message: Connection["lastMessage"]) {
  if (!message) return "Chưa có tin nhắn";
  const detail = message.body.trim() || (message.kind ? message.title || resourceLabels[message.kind] : "Tin nhắn");
  return `${message.outgoing ? "Bạn: " : ""}${detail}`;
}

function closeToLatest(element: HTMLElement | null) {
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 64;
}

function mergeMessages(latest: DirectMessage[], current: DirectMessage[]) {
  if (!current.length || !latest.length) return latest;
  if (latest[0].id === current[0].id) return current;
  const ids = new Set(latest.map(message => message.id));
  if (latest.length === 50 && !current.some(message => ids.has(message.id))) return latest;
  return [...latest, ...current.filter(message => !ids.has(message.id))];
}

export default function ConnectionsPage({ owner, onOpenShared, initialPeerId, initialPeerVersion, compact = false,
  visible = true, onUnread, onChat, onOpenLink }: {
  owner: string | null; onOpenShared: (item?: SharedLearningTarget, trigger?: HTMLElement) => void; initialPeerId?: string; initialPeerVersion?: number;
  compact?: boolean; visible?: boolean; onUnread?: (count: number) => void; onChat?: (peerId: string) => void;
  onOpenLink?: (token: string, trigger: HTMLElement) => void;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<ConnectionInvitation[]>([]);
  const [blocked, setBlocked] = useState<BlockedConnection[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const peer = connections.find(person => person.peer_id === peerId);
  const learningActive = useLearningActive();
  const active = compact ? visible : learningActive;
  const chatFieldId = useId();
  const composerId = compact ? chatFieldId : "connection-message";
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const currentMessages = useRef(messages);
  currentMessages.current = messages;
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [token, setToken] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const body = peerId ? drafts[peerId] ?? "" : "";
  const [reportText, setReportText] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const listPane = useRef<HTMLElement>(null);
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const scrollPane = useRef<HTMLDivElement>(null);
  const returnScroll = useRef<number | null>(null);
  const rememberThread = () => { returnScroll.current = scrollPane.current?.scrollTop ?? null; };
  const openPeer = useRef<string | null>(null);
  const inboxRequest = useRef(0), threadRequest = useRef(0);
  const lastSeen = useRef<string | null>(null);
  const olderRequest = useRef<symbol | null>(null);
  const adjustScroll = useRef<"bottom" | { height: number; top: number } | null>(null);
  const latestVisible = useRef(active);
  latestVisible.current = active;

  const refresh = useCallback(async () => {
    if (!owner) return;
    const request = ++inboxRequest.current;
    try {
      const [people, invites, blockedPeople] = await Promise.all([
        listConnections(true), compact ? Promise.resolve([]) : listConnectionInvitations(),
        compact ? Promise.resolve([]) : listBlockedConnections(),
      ]);
      if (request !== inboxRequest.current) return;
      setConnections(people); setInvitations(invites); setBlocked(blockedPeople);
      if (openPeer.current && !people.some(person => person.peer_id === openPeer.current)) {
        openPeer.current = null; ++threadRequest.current; olderRequest.current = null;
        setPeerId(null); setMessages([]); setLoadingThread(false); setLoadingOlder(false);
      }
    } finally {
      if (request === inboxRequest.current) setLoadingPeople(false);
    }
  }, [owner, compact]);

  const refreshConversation = useCallback(async (id: string, mode: "open" | "poll" | "send") => {
    if (openPeer.current !== id || (mode === "poll" && olderRequest.current)) return;
    const request = ++threadRequest.current;
    try {
      const latest = await listDirectMessages(id);
      if (request !== threadRequest.current || openPeer.current !== id || (mode === "poll" && olderRequest.current)) return;
      const atLatest = mode !== "poll" || closeToLatest(scrollPane.current);
      const current = currentMessages.current;
      const next = mode === "open" ? latest : mergeMessages(latest, current);
      if (next !== current || mode === "send") {
        if (atLatest) adjustScroll.current = "bottom";
        setMessages(next === current ? [...next] : next);
      }
      if (next === latest) setHasMore(latest.length === 50);
      const newest = latest[0]?.id;
      if (atLatest && newest && lastSeen.current !== newest && latestVisible.current && document.visibilityState !== "hidden") {
        await markDirectMessagesRead(id);
        if (openPeer.current === id && request === threadRequest.current) {
          lastSeen.current = newest;
          setConnections(people => people.map(person => person.peer_id === id ? { ...person, unread_count: 0 } : person));
          window.dispatchEvent(new Event("mindcanvas:activity-updated"));
        }
      }
    } finally {
      if (mode === "open" && openPeer.current === id && request === threadRequest.current) setLoadingThread(false);
    }
  }, []);

  const run = async (job: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await job(); await refresh(); window.dispatchEvent(new Event("mindcanvas:activity-updated")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hoàn tất thao tác."); }
    finally { setBusy(false); }
  };
  useLayoutEffect(() => {
    const element = scrollPane.current, next = adjustScroll.current;
    if (!element || !next) return;
    adjustScroll.current = null;
    element.scrollTop = next === "bottom" ? element.scrollHeight : next.top + element.scrollHeight - next.height;
  }, [messages]);
  useLayoutEffect(() => {
    if (!active || !scrollPane.current || returnScroll.current === null) return;
    scrollPane.current.scrollTop = returnScroll.current;
    returnScroll.current = null;
  }, [active]);
  useEffect(() => {
    onUnread?.(connections.reduce((total, person) => total + person.unread_count, 0));
  }, [connections, onUnread]);

  useEffect(() => {
    if (!compact || active || !owner) return;
    const refreshUnread = () => {
      if (document.visibilityState !== "hidden") void refresh().catch(() => undefined);
    };
    refreshUnread();
    const timer = window.setInterval(refreshUnread, 15000);
    document.addEventListener("visibilitychange", refreshUnread);
    window.addEventListener("mindcanvas:activity-updated", refreshUnread);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshUnread);
      window.removeEventListener("mindcanvas:activity-updated", refreshUnread);
    };
  }, [compact, active, owner, refresh]);

  useEffect(() => {
    if (active) void refresh().catch(cause => setError(String(cause?.message ?? cause)));
    return () => { ++inboxRequest.current; };
  }, [refresh, active]);
  useEffect(() => {
    if (!owner || !active || onChat) return;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      if (peerId && !loadingThread) void refreshConversation(peerId, "poll").catch(() => undefined).finally(() => { if (latestVisible.current) void refresh().catch(() => undefined); });
      else if (!peerId) void refresh().catch(() => undefined);
    };
    if (compact && peerId && !loadingThread) update();
    const timer = window.setInterval(update, peerId ? 5000 : 15000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [owner, active, peerId, loadingThread, compact, onChat, refresh, refreshConversation]);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => { setLink(await createConnectionInvitation(email)); setEmail(""); setNotice("Đã tạo lời mời. Gửi liên kết này cho người bạn muốn kết nối."); });
  };
  const acceptCode = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const value = token.trim();
      const parsed = value.includes("connection_invite=") ? new URL(value).searchParams.get("connection_invite") ?? "" : value;
      await respondConnectionInvitation(parsed, "accepted"); setToken(""); setNotice("Đã kết nối.");
    });
  };
  const returnToList = () => {
    openPeer.current = null; ++threadRequest.current; lastSeen.current = null; olderRequest.current = null;
    adjustScroll.current = null;
    setPeerId(null); setMessages([]); setHasMore(false); setLoadingThread(false); setLoadingOlder(false);
    setShowReport(false); setReportText(""); setError("");
    requestAnimationFrame(() => listPane.current?.querySelector<HTMLButtonElement>(".connections-person")?.focus({ preventScroll: true }));
  };
  const choose = useCallback(async (person: Connection) => {
    if (onChat) { onChat(person.peer_id); return; }
    if (openPeer.current === person.peer_id) return;
    openPeer.current = person.peer_id; lastSeen.current = null; olderRequest.current = null;
    adjustScroll.current = null;
    setPeerId(person.peer_id); setMessages([]); setHasMore(false); setLoadingThread(true); setLoadingOlder(false);
    setShowReport(false); setReportText(""); setError("");
    try { await refreshConversation(person.peer_id, "open"); }
    catch (cause) { if (openPeer.current === person.peer_id) setError(cause instanceof Error ? cause.message : "Không thể tải hội thoại."); }
  }, [onChat, refreshConversation]);
  useEffect(() => {
    const heading = threadHeading.current;
    if (peerId && active && heading && !heading.closest(".connections-conversation")?.contains(document.activeElement)) {
      heading.focus({ preventScroll: true });
    }
  }, [peerId, active]);
  const openedInitialPeer = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialPeerId) { openedInitialPeer.current = undefined; return; }
    const key = initialPeerVersion === undefined ? initialPeerId : `${initialPeerId}:${initialPeerVersion}`;
    if (!active || openedInitialPeer.current === key) return;
    const candidate = connections.find(person => person.peer_id === initialPeerId);
    if (candidate) { openedInitialPeer.current = key; void choose(candidate); }
  }, [active, initialPeerId, initialPeerVersion, connections, choose]);

  if (!owner) return <section className="connections-page"><h2>Bạn bè và tin nhắn</h2><p>Đăng nhập để kết nối và nhắn tin.</p></section>;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!peer || !body.trim()) return;
    const id = peer.peer_id;
    await run(async () => {
      await sendDirectMessage(id, body);
      setDrafts(current => current[id] === body ? { ...current, [id]: "" } : current);
      await refreshConversation(id, "send");
    });
  };
  const loadOlder = async () => {
    if (!peer || !messages.length || olderRequest.current) return;
    const id = peer.peer_id, request = Symbol(), oldest = messages[messages.length - 1];
    olderRequest.current = request; setLoadingOlder(true); setError("");
    try {
      const older = await listDirectMessages(id, oldest);
      if (olderRequest.current !== request || openPeer.current !== id) return;
      const element = scrollPane.current;
      if (element) adjustScroll.current = { height: element.scrollHeight, top: element.scrollTop };
      setMessages(current => {
        const ids = new Set(current.map(message => message.id));
        return [...current, ...older.filter(message => !ids.has(message.id))];
      });
      setHasMore(older.length === 50);
    } catch (cause) {
      if (olderRequest.current === request) setError(cause instanceof Error ? cause.message : "Không thể tải tin cũ.");
    } finally {
      if (olderRequest.current === request) { olderRequest.current = null; setLoadingOlder(false); }
    }
  };
  const people = connections.filter(person => person.display_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pending = invitations.filter(item => item.status === "pending" && new Date(item.expires_at) > new Date());
  const ordered = [...messages].reverse();
  return <section className={`connections-page${onChat ? " connections-contacts" : ""}`}>
    {!compact && <header><div><span className="eyebrow">KẾT NỐI</span><h2>Bạn bè và tin nhắn</h2><p>Kết nối riêng tư bằng lời mời; gửi học liệu và trao đổi 1–1.</p></div><button type="button" className="secondary-button" onClick={() => void run(async () => undefined)}><RefreshCw size={15}/>Làm mới</button></header>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status" className="form-success">{notice}</p>}
    <div className="connections-layout" data-thread-open={!!peer}>
      <aside className="connections-sidebar" ref={listPane} aria-label="Danh sách hội thoại">
        {!compact && <details className="connections-invite" open={!!link || undefined}><summary><UserPlus size={18}/>Mời kết nối</summary><p>Nhập email để lời mời hiện trong tài khoản người nhận, hoặc để trống để tạo liên kết dùng một lần.</p><form onSubmit={event => void invite(event)}><label>Email người nhận (tùy chọn)<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="banhoc@example.com"/></label><button className="primary-button" disabled={busy}>Tạo liên kết</button></form>{link && <div className="connections-link"><input ref={linkInput} aria-label="Liên kết kết nối" value={link} readOnly/><button type="button" className="secondary-button" onClick={() => void copyTextWithFallback(link,linkInput.current).then(ok => { if (!ok) setError("Hãy sao chép liên kết thủ công."); })}><Copy size={15}/>Sao chép</button></div>}<form onSubmit={event => void acceptCode(event)}><label>Nhận lời mời bằng mã hoặc liên kết<input value={token} onChange={event => setToken(event.target.value)} placeholder="Dán mã hoặc liên kết"/></label><button className="secondary-button" disabled={busy || !token.trim()}>Kết nối</button></form></details>}
        {pending.length > 0 && <section className="connections-pending"><h3>Lời mời đang chờ</h3>{pending.map(item => <article key={item.id}><span>{item.outgoing ? `Đã mời ${item.recipient_email ?? "qua liên kết"}` : `${item.sender_name} muốn kết nối`}</span><small>Hết hạn {new Date(item.expires_at).toLocaleDateString("vi-VN")}</small><div>{item.outgoing ? <button type="button" disabled={busy} onClick={() => void run(() => cancelConnectionInvitation(item.id))}><X size={14}/>Hủy</button> : <><button type="button" disabled={busy} onClick={() => void run(() => respondConnectionInvitation(item.token_hash, "accepted", true))}><Check size={14}/>Chấp nhận</button><button type="button" disabled={busy} onClick={() => void run(() => respondConnectionInvitation(item.token_hash, "declined", true))}>Từ chối</button></>}</div></article>)}</section>}
        <section className="connections-people">
          {!compact && <h3><Users size={18}/>Hội thoại <small>{connections.length}</small></h3>}
          {connections.length > 0 && <label className="connections-search"><Search size={16}/><input type="search" aria-label="Tìm cuộc trò chuyện" placeholder="Tìm theo tên…" value={query} onChange={event => setQuery(event.target.value)}/></label>}
          {people.map(person => <button type="button" key={person.peer_id} className={`connections-person ${peerId === person.peer_id ? "active" : ""}`}
            data-unread={Number(person.unread_count) > 0} aria-current={peerId === person.peer_id ? "true" : undefined} onClick={() => void choose(person)}>
            <ProfileAvatar url={person.avatar} name={person.display_name} className="connection-profile-avatar"/>
            <span className="connection-summary"><strong>{person.display_name}</strong><span>{messagePreview(person.lastMessage)}</span></span>
            <span className="connection-metadata">
              {person.lastMessage && <time dateTime={person.lastMessage.at}>{formatPreviewTime(person.lastMessage.at)}</time>}
              {Number(person.unread_count) > 0 && <small aria-label={`${person.unread_count} tin chưa đọc`}>{Number(person.unread_count) > 99 ? "99+" : person.unread_count}</small>}
            </span>
          </button>)}
          {!people.length && <p role="status">{loadingPeople ? "Đang tải hội thoại…" : connections.length ? "Không tìm thấy cuộc trò chuyện." : "Chưa có kết nối. Hãy gửi một lời mời để bắt đầu."}</p>}
        </section>
        {blocked.length > 0 && <section className="connections-pending"><h3>Đã chặn</h3>{blocked.map(person => <article key={person.peer_id}><span>{person.display_name}</span><button type="button" disabled={busy} onClick={() => void run(() => unblockConnection(person.peer_id))}>Bỏ chặn</button></article>)}</section>}
      </aside>
      {!onChat && <section className="connections-conversation" aria-label="Cuộc trò chuyện">
        {peer ? <>
          <header>
            <button type="button" className="icon-button connections-thread-back" onClick={returnToList} aria-label="Quay lại danh sách hội thoại" title="Quay lại danh sách hội thoại"><ArrowLeft size={20}/></button>
            <div className="connection-profile-heading"><ProfileAvatar url={peer.avatar} name={peer.display_name} className="connection-profile-avatar"/><div><h3 ref={threadHeading} tabIndex={-1}>{peer.display_name}</h3>{!compact && <small>Tin nhắn riêng</small>}</div></div>
            <details className="connections-peer-menu" key={peer.peer_id}>
              <summary aria-label="Tùy chọn hội thoại"><MoreHorizontal size={20}/><span>Tùy chọn</span></summary>
              <div className="connections-peer-actions">
                <button type="button" disabled={busy} onClick={() => { if (!window.confirm("Hủy kết nối sẽ thu hồi quyền xem bản gốc đã chia sẻ giữa hai người. Bản sao đã lưu vẫn giữ nguyên. Tiếp tục?")) return; void run(async () => { await removeConnection(peer.peer_id); if (openPeer.current === peer.peer_id) returnToList(); }); }}>Hủy kết nối</button>
                <button type="button" disabled={busy} onClick={() => { if (!window.confirm("Chặn người này và thu hồi quyền xem bản gốc đã chia sẻ?")) return; void run(async () => { await blockConnection(peer.peer_id); if (openPeer.current === peer.peer_id) returnToList(); }); }}><Ban size={14}/>Chặn</button>
                <button type="button" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setShowReport(value => !value); }}>Báo cáo</button>
              </div>
            </details>
          </header>
          <div className="connections-thread">
            {showReport && <form className="connections-report" onSubmit={event => { event.preventDefault(); void run(async () => { await reportConnection(peer.peer_id, reportText); if (openPeer.current === peer.peer_id) { setReportText(""); setShowReport(false); setNotice("Đã gửi báo cáo."); } }); }}>
              <label>Lý do báo cáo (ít nhất 10 ký tự)<textarea minLength={10} maxLength={1000} required value={reportText} onChange={event => setReportText(event.target.value)}/></label>
              <div><button type="button" className="secondary-button" onClick={() => setShowReport(false)}>Hủy</button><button className="primary-button" disabled={busy || reportText.trim().length < 10}>Gửi báo cáo</button></div>
            </form>}
            <div className="connections-messages" ref={scrollPane} tabIndex={0} aria-label="Lịch sử tin nhắn" aria-busy={loadingThread || loadingOlder}>
              {hasMore && <button type="button" className="secondary-button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Đang tải…" : "Tải tin cũ hơn"}</button>}
              {ordered.map((message, index) => {
                const day = new Date(message.created_at).toLocaleDateString("vi-VN");
                const previous = ordered[index - 1];
                const startsDay = !previous || new Date(previous.created_at).toLocaleDateString("vi-VN") !== day;
                return <MessageBubble key={message.id} message={message} mine={message.sender_id === owner} date={startsDay ? day : undefined}
                  onOpenShared={(item, trigger) => { if (item) rememberThread(); onOpenShared(item, trigger); }}
                  onOpenLink={onOpenLink && ((token, trigger) => { rememberThread(); onOpenLink(token, trigger); })}/>;
              })}
              {!messages.length && <p className="connections-empty" role="status">{loadingThread ? "Đang tải tin nhắn…" : "Hãy gửi tin nhắn đầu tiên hoặc chia sẻ học liệu từ thư viện."}</p>}
            </div>
          </div>
          <form className="connections-composer" onSubmit={event => void send(event)}>
            <label className="sr-only" htmlFor={composerId}>Tin nhắn</label>
            <textarea id={composerId} rows={compact ? 1 : 2} maxLength={4000} value={body} onChange={event => {
              const draft = event.target.value;
              setDrafts(current => ({ ...current, [peer.peer_id]: draft }));
            }} placeholder="Viết tin nhắn…"/>
            <button className="primary-button" aria-label="Gửi tin nhắn" title="Gửi tin nhắn" disabled={busy || loadingThread || loadingOlder || !body.trim()}>
              <Send size={17}/>{!compact && "Gửi"}
            </button>
          </form>
        </> : <div className="connections-empty"><MessageCircle size={34}/><h3>Chọn một người kết nối</h3><p>Cuộc trò chuyện riêng của hai người sẽ hiện ở đây.</p></div>}
      </section>}
    </div>
  </section>;
}

function formatPreviewTime(at: string) {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "2-digit" } : {}) });
}

function MessageBubble({ message, mine, date, onOpenShared, onOpenLink }: {
  message: DirectMessage; mine: boolean; date?: string; onOpenShared: (item?: SharedLearningTarget, trigger?: HTMLElement) => void;
  onOpenLink?: (token: string, trigger: HTMLElement) => void;
}) {
  const kind = message.resource_kind;
  const Icon = message.workspace_folder_card ? Folder : kind ? resourceIcons[kind] : FileText;
  const resourceLabel = kind ? resourceLabels[kind] : "";
  const title = message.resource_title || resourceLabel;
  const token = kind === "document" ? message.workspace_file_token : null;
  const fileLink = token && /^[a-f0-9]{48}$/.test(token) ? workspaceShareUrl(token) : "";
  const learningLink = !token && !mine && kind && message.resource_id
    ? sharedLearningUrl({ kind, id: message.resource_id }) : "";
  const learning = learningLink && sharedLearningTarget(new URL(learningLink));
  const asset = <><span className="connections-resource-icon" aria-hidden="true"><Icon size={17}/></span>
    <span className="connections-resource-copy"><strong title={title}>{title}</strong>
      <small>{token ? (fileLink ? message.workspace_folder_card ? "Mở thư mục" : "Mở tài liệu" : "Nội dung không còn khả dụng")
        : mine ? resourceLabel + " đã gửi" : "Mở học liệu"}</small></span>
    {(!mine || fileLink) && <ArrowUpRight className="connections-resource-arrow" size={15} aria-hidden="true"/>}
  </>;
  return <>
    {date && <div className="connections-date">{date}</div>}
    <article className={`${mine ? "mine" : "theirs"}${kind && !message.body ? " connections-attachment-only" : ""}`}>
      {message.body && <p>{message.body}</p>}
      {token
        ? (fileLink ? <a className="connections-resource" href={fileLink} onClick={event => openShareInSameTab(event, onOpenLink && (() => onOpenLink(token, event.currentTarget)))}>{asset}</a> : <span className="connections-resource">{asset}</span>)
        : kind && (mine ? <span className="connections-resource">{asset}</span>
          : learning ? <a className="connections-resource" href={learningLink} onClick={event => openShareInSameTab(event, () => onOpenShared(learning, event.currentTarget))}>{asset}</a>
          : <button type="button" className="connections-resource" onClick={() => onOpenShared()}>{asset}</button>)}
      <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
    </article>
  </>;
}
