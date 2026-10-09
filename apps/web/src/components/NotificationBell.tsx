import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BookOpen, Check, MessageCircle, RefreshCw, Users, X } from "lucide-react";
import {
  acceptLearningNotification, listActivityNotifications, markActivityNotificationRead, respondConnectionNotification,
  type ActivityNotification,
} from "../lib/activityNotifications";
import { markDirectMessagesRead } from "../lib/connections";

export default function NotificationBell({ owner, onNavigate }: { owner: string | null; onNavigate: (item: ActivityNotification) => void }) {
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const load = useCallback(async () => {
    if (!owner) { setItems([]); return; }
    try { const result = await listActivityNotifications(); if (ownerRef.current === owner) { setItems(result); setError(""); } }
    catch (cause) { if (ownerRef.current === owner) setError(cause instanceof Error ? cause.message : "Không thể tải thông báo."); }
  }, [owner]);
  useEffect(() => {
    void load();
    if (!owner) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("mindcanvas:activity-updated", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("mindcanvas:activity-updated", onFocus); };
  }, [owner, load]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const visit = async (item: ActivityNotification) => {
    if (busy) return;
    setBusy(item.source_id);
    try { await markActivityNotificationRead(item); if (item.kind === "message") await markDirectMessagesRead(item.actor_id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đánh dấu đã đọc."); }
    finally { setBusy(null); if (item.kind !== "learning_invite") { setOpen(false); onNavigate(item); } }
  };
  const accept = async (item: ActivityNotification, approve: boolean) => {
    setBusy(item.source_id);
    try {
      if (item.kind === "learning_invite") await acceptLearningNotification(item.source_id);
      else await respondConnectionNotification(item.source_id, approve);
      await load();
      if (approve) { setOpen(false); onNavigate(item); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xử lý lời mời."); }
    finally { setBusy(null); }
  };
  if (!owner) return null;
  const unread = items.filter(item => !item.read_at).length;
  return <div className="notification-root" ref={root}>
    <button ref={trigger} type="button" className="icon-button notification-trigger" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`} title="Thông báo" aria-expanded={open} aria-controls="notification-panel" onClick={() => { setOpen(value => !value); if (!open) void load(); }}><Bell size={19}/>{unread > 0 && <span aria-hidden="true">{unread >= 99 ? "99+" : unread}</span>}</button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Danh sách thông báo"><header><h2>Thông báo</h2><div><button type="button" className="icon-button" aria-label="Tải lại thông báo" onClick={() => void load()}><RefreshCw size={16}/></button><button type="button" className="icon-button" aria-label="Đóng thông báo" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17}/></button></div></header>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="notification-list">{items.map(item => <article className={item.read_at ? "" : "unread"} key={`${item.kind}:${item.source_id}`}><span className="notification-icon">{item.kind === "message" ? <MessageCircle size={18}/> : item.kind.includes("invite") ? <Users size={18}/> : <BookOpen size={18}/>}</span><div><button type="button" className="notification-item-link" disabled={busy === item.source_id} onClick={() => void visit(item)}><strong>{item.title}</strong><span>{item.preview}</span><small>{new Date(item.created_at).toLocaleString("vi-VN")}</small></button>{item.kind === "learning_invite" && <small>Chấp nhận để đưa học liệu vào mục Được chia sẻ với tôi.</small>}{(item.kind === "learning_invite" || item.kind === "connection_invite") && <div className="notification-invite-actions"><button type="button" className="primary-button" disabled={!!busy} onClick={() => void accept(item,true)}><Check size={14}/>Chấp nhận</button>{item.kind === "connection_invite" && <button type="button" className="secondary-button" disabled={!!busy} onClick={() => void accept(item,false)}>Từ chối</button>}</div>}</div></article>)}{!items.length && !error && <p className="notification-empty">Bạn chưa có thông báo nào.</p>}</div>
    </section>}
  </div>;
}
