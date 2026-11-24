import { useEffect, useRef, useState } from "react";
import { Bell, BookOpen, Check, Megaphone, MessageCircle, RefreshCw, Users, X } from "lucide-react";
import {
  acceptLearningNotification, listActivityNotifications, markActivityNotificationRead, respondConnectionNotification,
  type ActivityNotification,
} from "../lib/activityNotifications";
import { markDirectMessagesRead } from "../lib/connections";
import { useSystemAnnouncements } from "../hooks/useSystemAnnouncements";
import { useLanguage } from "../lib/i18n";
import { useBackgroundRead } from "../hooks/useBackgroundRead";

export default function NotificationBell({ owner, onNavigate }: { owner: string | null; onNavigate: (item: ActivityNotification) => void }) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const system = useSystemAnnouncements(owner);
  const [tab, setTab] = useState<"activity" | "system">("activity");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [loadError, setLoadError] = useState(false);
  const locallyRead = useRef(new Map<string, string>());
  const handled = useRef(new Set<string>());
  const keyOf = (item: ActivityNotification) => `${item.kind}:${item.source_id}`;
  useEffect(() => { setItems([]); setTab("activity"); setExpanded(null); setLoadError(false); setError(""); setOpen(false); locallyRead.current.clear(); handled.current.clear(); }, [owner]);
  const { loading, refresh } = useBackgroundRead(owner, listActivityNotifications, rows => {
    setItems(rows.filter(item => !handled.current.has(keyOf(item))).map(item => ({
      ...item, read_at: item.read_at ?? locallyRead.current.get(keyOf(item)) ?? null,
    })));
    setLoadError(false);
  }, () => setLoadError(true), 45_000);
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
    setError("");
    if (item.kind !== "learning_invite") { setOpen(false); onNavigate(item); }
    try {
      await markActivityNotificationRead(item);
      const key = keyOf(item);
      const readAt = new Date().toISOString();
      locallyRead.current.set(key, readAt);
      setItems(current => current.map(row => keyOf(row) === key ? { ...row, read_at: readAt } : row));
      if (item.kind === "message") await markDirectMessagesRead(item.actor_id);
    } catch { setError("Chưa thể đánh dấu đã đọc. Hãy thử lại."); }
    finally { setBusy(null); }
  };
  const accept = async (item: ActivityNotification, approve: boolean) => {
    setBusy(item.source_id);
    setError("");
    try {
      if (item.kind === "learning_invite") await acceptLearningNotification(item.source_id);
      else await respondConnectionNotification(item.source_id, approve);
      handled.current.add(keyOf(item));
      setItems(current => current.filter(row => keyOf(row) !== keyOf(item)));
      if (approve) { setOpen(false); onNavigate(item); }
    } catch { setError("Chưa thể xử lý lời mời. Hãy thử lại."); }
    finally { setBusy(null); }
  };
  if (!owner) return null;
  const activityUnread = items.filter(item => !item.read_at).length;
  const unread = activityUnread + system.unreadCount;
  const label = vi ? "Thông báo" : "Notifications";
  const date = (value: string) => new Date(value).toLocaleString(vi ? "vi-VN" : "en");
  const unreadLabel = (count: number) => vi ? `${count} chưa đọc` : `${count} unread`;
  const activityTab = tab === "activity";
  const changeTab = (next: "activity" | "system") => {
    setTab(next);
    if (next === "system") void system.refresh(); else void refresh();
  };
  const countChip = (count: number) => count > 0 ? <span className="notification-count" aria-label={unreadLabel(count)}>{count > 99 ? "99+" : count}</span> : null;
  return <div className="notification-root" ref={root}>
    <button ref={trigger} type="button" className="icon-button notification-trigger" aria-label={unread ? `${label}, ${unreadLabel(unread)}` : label} title={label} aria-expanded={open} aria-controls="notification-panel" onClick={() => {
      setOpen(value => !value);
      if (!open) { void refresh(); void system.refresh(); }
    }}><Bell size={19}/>{unread > 0 && <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}</button>
    {open && <section id="notification-panel" className="notification-panel" aria-label={label}>
      <header><h2>{label}</h2><div>
        <button type="button" className="icon-button" aria-label={vi ? "Tải lại thông báo" : "Refresh notifications"} disabled={activityTab ? loading : system.loading} onClick={() => void (activityTab ? refresh(true) : system.refresh(true))}><RefreshCw size={16}/></button>
        <button type="button" className="icon-button" aria-label={vi ? "Đóng thông báo" : "Close notifications"} onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17}/></button>
      </div></header>
      <div className="phase-one-tabs notification-tabs" role="tablist" aria-label={label} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "activity" : event.key === "End" ? "system" : activityTab ? "system" : "activity";
        changeTab(next); root.current?.querySelector<HTMLButtonElement>(`#notification-tab-${next}`)?.focus();
      }}>
        <button type="button" id="notification-tab-activity" role="tab" tabIndex={activityTab ? 0 : -1} aria-controls="notification-tab-content" aria-selected={activityTab} onClick={() => changeTab("activity")}>{label}{countChip(activityUnread)}</button>
        <button type="button" id="notification-tab-system" role="tab" tabIndex={activityTab ? -1 : 0} aria-controls="notification-tab-content" aria-selected={!activityTab} onClick={() => changeTab("system")}><Megaphone size={15}/>{vi ? "Tin nhắn hệ thống" : "System messages"}{countChip(system.unreadCount)}</button>
      </div>
      <div id="notification-tab-content" role="tabpanel" aria-labelledby={`notification-tab-${tab}`} className="notification-list">
        {activityTab ? <>
          {error ? <p className="form-error" role="alert">{error}</p> : loadError ? <p className="form-error" role="status">{vi ? "Chưa tải được thông báo. Nhấn tải lại để thử lại." : "Could not load notifications. Try refreshing."}</p> : null}
          {items.map(item => <article className={item.read_at ? "" : "unread"} key={keyOf(item)}>
            <span className="notification-icon">{item.kind === "message" ? <MessageCircle size={18}/> : item.kind.includes("invite") ? <Users size={18}/> : <BookOpen size={18}/>}</span>
            <div>
              <button type="button" className="notification-item-link" disabled={busy === item.source_id} onClick={() => void visit(item)}><strong>{item.title}</strong><span>{item.preview}</span><small>{date(item.created_at)}</small></button>
              {item.kind === "learning_invite" && <small>{vi ? "Chấp nhận để đưa học liệu vào mục Được chia sẻ với tôi." : "Accept to add this to Shared with me."}</small>}
              {(item.kind === "learning_invite" || item.kind === "connection_invite") && <div className="notification-invite-actions"><button type="button" className="primary-button" disabled={!!busy} onClick={() => void accept(item, true)}><Check size={14}/>{vi ? "Chấp nhận" : "Accept"}</button>{item.kind === "connection_invite" && <button type="button" className="secondary-button" disabled={!!busy} onClick={() => void accept(item, false)}>{vi ? "Từ chối" : "Decline"}</button>}</div>}
            </div>
          </article>)}
          {!items.length && !error && !loadError && <p className="notification-empty">{loading ? t("loading") : vi ? "Bạn chưa có thông báo nào." : "No notifications yet."}</p>}
        </> : <>
          {system.loadError && <p className="form-error" role="status">{vi ? "Chưa tải được tin hệ thống. Nhấn tải lại để thử lại." : "Could not load system messages. Try refreshing."}</p>}
          {system.actionError && <p className="form-error" role="alert">{system.actionError === "read" ? (vi ? "Chưa đánh dấu đã đọc. Mở lại tin để thử lại." : "This message could not be marked read. Open it again to retry.") : (vi ? "Chưa tải được tin cũ hơn." : "Could not load older messages.")}</p>}
          {system.items.map(item => <article key={item.id} className={item.read_at ? "" : "unread"}>
            <span className="notification-icon system-message-icon"><Megaphone size={18}/></span>
            <div><button type="button" className="notification-item-link" aria-expanded={expanded === item.id} aria-controls={expanded === item.id ? `notification-message-${item.id}` : undefined} onClick={() => {
              setExpanded(current => current === item.id ? null : item.id);
              if (expanded !== item.id) void system.openItem(item);
            }}><strong>{item.title}</strong><small>{date(item.published_at)}</small></button>
            {expanded === item.id && <p id={`notification-message-${item.id}`} className="announcement-body">{item.body}</p>}</div>
          </article>)}
          {!system.items.length && !system.loadError && <p className="notification-empty">{system.loading ? t("loading") : vi ? "Chưa có tin nhắn hệ thống." : "No system messages yet."}</p>}
          {system.hasMore && <div className="notification-more"><button type="button" className="secondary-button" disabled={system.loadingMore} onClick={() => void system.loadMore()}>{system.loadingMore ? t("loading") : vi ? "Xem tin cũ hơn" : "Show older messages"}</button></div>}
        </>}
      </div>
    </section>}
  </div>;
}
