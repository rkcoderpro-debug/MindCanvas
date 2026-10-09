import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ban, Check, Copy, MessageCircle, MoreHorizontal, RefreshCw, Send, UserPlus, Users, X } from "lucide-react";
import {
  blockConnection, cancelConnectionInvitation, createConnectionInvitation, listBlockedConnections, listConnectionInvitations,
  listConnections, listDirectMessages, markDirectMessagesRead, removeConnection,
  reportConnection, respondConnectionInvitation, sendDirectMessage, unblockConnection,
  type BlockedConnection, type Connection, type ConnectionInvitation, type DirectMessage,
} from "../lib/connections";
import { copyTextWithFallback } from "../lib/share";

export default function ConnectionsPage({ owner, onOpenShared, initialPeerId }: { owner: string | null; onOpenShared: () => void; initialPeerId?: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<ConnectionInvitation[]>([]);
  const [blocked, setBlocked] = useState<BlockedConnection[]>([]);
  const [peer, setPeer] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [token, setToken] = useState("");
  const [body, setBody] = useState("");
  const [reportText, setReportText] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    if (!owner) return;
    const [people, invites, blockedPeople] = await Promise.all([listConnections(), listConnectionInvitations(), listBlockedConnections()]);
    setConnections(people); setInvitations(invites); setBlocked(blockedPeople);
    setPeer(current => current ? people.find(person => person.peer_id === current.peer_id) ?? null : null);
  };
  const refreshConversation = async (id: string) => {
    const latest = await listDirectMessages(id);
    setMessages(latest); setHasMore(latest.length === 50);
    await markDirectMessagesRead(id);
    window.dispatchEvent(new Event("mindcanvas:activity-updated"));
    await refresh();
  };
  const run = async (job: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await job(); await refresh(); window.dispatchEvent(new Event("mindcanvas:activity-updated")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hoàn tất thao tác."); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (!owner) return; void refresh().catch(cause => setError(String(cause?.message ?? cause))); }, [owner]);
  useEffect(() => {
    if (!owner) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh().catch(() => undefined);
      if (peer) void listDirectMessages(peer.peer_id).then(latest => {
        setMessages(current => current.length && latest.length && current[0]?.id === latest[0]?.id ? current : latest);
        if (latest.length) void markDirectMessagesRead(peer.peer_id).catch(() => undefined);
      }).catch(() => undefined);
    }, peer ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [owner, peer?.peer_id]);
  if (!owner) return <section className="connections-page"><h2>Bạn bè và tin nhắn</h2><p>Đăng nhập để kết nối và nhắn tin.</p></section>;
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
  const choose = async (person: Connection) => {
    setPeer(person); setError("");
    try { await refreshConversation(person.peer_id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải hội thoại."); }
  };
  useEffect(() => {
    if (!initialPeerId || !connections.length || peer?.peer_id === initialPeerId) return;
    const candidate = connections.find(person => person.peer_id === initialPeerId);
    if (candidate) void choose(candidate);
  }, [initialPeerId, connections.length]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!peer || !body.trim()) return;
    await run(async () => { await sendDirectMessage(peer.peer_id, body); setBody(""); await refreshConversation(peer.peer_id); });
  };
  const loadOlder = async () => {
    if (!peer || !messages.length) return;
    await run(async () => {
      const older = await listDirectMessages(peer.peer_id, messages[messages.length - 1].created_at);
      setMessages(current => [...current, ...older.filter(item => !current.some(existing => existing.id === item.id))]);
      setHasMore(older.length === 50);
    });
  };
  return <section className="connections-page">
    <header><div><span className="eyebrow">LEARNING HUB · KẾT NỐI</span><h2>Bạn bè và tin nhắn</h2><p>Kết nối riêng tư bằng lời mời; gửi học liệu và trao đổi 1–1.</p></div><button type="button" className="secondary-button" onClick={() => void run(async () => undefined)}><RefreshCw size={15}/>Làm mới</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status" className="form-success">{notice}</p>}
    <div className="connections-layout">
      <aside className="connections-sidebar">
        <details className="connections-invite" open={!!link || undefined}><summary><UserPlus size={18}/>Mời kết nối</summary><p>Nhập email để lời mời hiện trong tài khoản người nhận, hoặc để trống để tạo liên kết dùng một lần.</p><form onSubmit={event => void invite(event)}><label>Email người nhận (tùy chọn)<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="banhoc@example.com"/></label><button className="primary-button" disabled={busy}>Tạo liên kết</button></form>{link && <div className="connections-link"><input ref={linkInput} aria-label="Liên kết kết nối" value={link} readOnly/><button type="button" className="secondary-button" onClick={() => void copyTextWithFallback(link,linkInput.current).then(ok => { if (!ok) setError("Hãy sao chép liên kết thủ công."); })}><Copy size={15}/>Sao chép</button></div>}<form onSubmit={event => void acceptCode(event)}><label>Nhận lời mời bằng mã hoặc liên kết<input value={token} onChange={event => setToken(event.target.value)} placeholder="Dán mã hoặc liên kết"/></label><button className="secondary-button" disabled={busy || !token.trim()}>Kết nối</button></form></details>
        {invitations.some(item => item.status === "pending" && new Date(item.expires_at) > new Date()) && <section className="connections-pending"><h3>Lời mời đang chờ</h3>{invitations.filter(item => item.status === "pending" && new Date(item.expires_at) > new Date()).map(item => <article key={item.id}><span>{item.outgoing ? `Đã mời ${item.recipient_email ?? "qua liên kết"}` : `${item.sender_name} muốn kết nối`}</span><small>Hết hạn {new Date(item.expires_at).toLocaleDateString("vi-VN")}</small><div>{item.outgoing ? <button type="button" disabled={busy} onClick={() => void run(() => cancelConnectionInvitation(item.id))}><X size={14}/>Hủy</button> : <><button type="button" disabled={busy} onClick={() => void run(() => respondConnectionInvitation(item.token_hash, "accepted", true))}><Check size={14}/>Chấp nhận</button><button type="button" disabled={busy} onClick={() => void run(() => respondConnectionInvitation(item.token_hash, "declined", true))}>Từ chối</button></>}</div></article>)}</section>}
        <section className="connections-people"><h3><Users size={18}/>Người kết nối ({connections.length})</h3>{connections.map(person => <button type="button" key={person.peer_id} className={`connections-person ${peer?.peer_id === person.peer_id ? "active" : ""}`} onClick={() => void choose(person)}><MessageCircle size={17}/><span>{person.display_name}</span>{Number(person.unread_count)>0 && <small>{person.unread_count}</small>}</button>)}{!connections.length && <p>Chưa có kết nối. Hãy gửi một lời mời để bắt đầu.</p>}</section>
        {blocked.length > 0 && <section className="connections-pending"><h3>Đã chặn</h3>{blocked.map(person => <article key={person.peer_id}><span>{person.display_name}</span><button type="button" disabled={busy} onClick={() => void run(() => unblockConnection(person.peer_id))}>Bỏ chặn</button></article>)}</section>}
      </aside>
      <div className="connections-conversation">{peer ? <><header><div><h3>{peer.display_name}</h3><small>Chỉ hai người trong cuộc trò chuyện xem được tin nhắn.</small></div><details className="connections-peer-menu"><summary aria-label="Tùy chọn hội thoại"><MoreHorizontal size={20}/><span>Tùy chọn</span></summary><div className="connections-peer-actions"><button type="button" disabled={busy} onClick={() => { if (!window.confirm("Hủy kết nối sẽ thu hồi quyền xem bản gốc đã chia sẻ giữa hai người. Bản sao đã lưu vẫn giữ nguyên. Tiếp tục?")) return; void run(async () => { await removeConnection(peer.peer_id); setPeer(null); setMessages([]); }); }}>Hủy kết nối</button><button type="button" disabled={busy} onClick={() => { if (!window.confirm("Chặn người này và thu hồi quyền xem bản gốc đã chia sẻ?")) return; void run(async () => { await blockConnection(peer.peer_id); setPeer(null); setMessages([]); }); }}><Ban size={14}/>Chặn</button><button type="button" onClick={() => setShowReport(value => !value)}>Báo cáo</button></div></details></header>{showReport && <form className="connections-report" onSubmit={event => { event.preventDefault(); void run(async () => { await reportConnection(peer.peer_id, reportText); setReportText(""); setShowReport(false); setNotice("Đã gửi báo cáo."); }); }}><label>Lý do báo cáo (ít nhất 10 ký tự)<textarea minLength={10} maxLength={1000} required value={reportText} onChange={event => setReportText(event.target.value)}/></label><button disabled={busy || reportText.trim().length<10}>Gửi báo cáo</button></form>}<div className="connections-messages">{hasMore && <button type="button" className="secondary-button" disabled={busy} onClick={() => void loadOlder()}>Tải tin cũ hơn</button>}{[...messages].reverse().map(message => <article key={message.id} className={message.sender_id === owner ? "mine" : "theirs"}><p>{message.body}</p>{message.resource_kind && (message.sender_id === owner ? <span className="connections-resource">Đã gửi {message.resource_title || ({ quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu" })[message.resource_kind]}</span> : <button type="button" className="connections-resource" onClick={onOpenShared}>Học liệu được chia sẻ · {message.resource_title || ({ quiz: "Quiz", flashcard: "Flashcard", lab: "Lab", document: "Tài liệu" })[message.resource_kind]} → Mở trong Được chia sẻ với tôi</button>)}<small>{new Date(message.created_at).toLocaleString("vi-VN")}</small></article>)}{!messages.length && <p className="connections-empty">Hãy gửi tin nhắn đầu tiên hoặc chia sẻ học liệu từ thư viện.</p>}</div><form className="connections-composer" onSubmit={event => void send(event)}><label className="sr-only" htmlFor="connection-message">Tin nhắn</label><textarea id="connection-message" rows={2} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} placeholder="Viết tin nhắn…"/><button className="primary-button" disabled={busy || !body.trim()}><Send size={17}/>Gửi</button></form></> : <div className="connections-empty"><MessageCircle size={34}/><h3>Chọn một người kết nối</h3><p>Cuộc trò chuyện riêng của hai người sẽ hiện ở đây.</p></div>}</div>
    </div>
  </section>;
}
