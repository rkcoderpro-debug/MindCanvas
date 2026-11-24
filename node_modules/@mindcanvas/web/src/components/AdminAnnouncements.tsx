import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Megaphone, RefreshCw, Send } from "lucide-react";
import { listAdminSystemAnnouncements, publishAdminSystemAnnouncement } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import { SYSTEM_ANNOUNCEMENTS_UPDATED, type SystemAnnouncement } from "../lib/systemAnnouncements";
import Dialog from "./Dialog";

export default function AdminAnnouncements() {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const labels = vi ? {
    heading: "Soạn tin hệ thống", description: "Gửi thông báo trong MindCanvas đến tất cả tài khoản hiện có.",
    title: "Tiêu đề", body: "Nội dung", preview: "Xem trước", confirmTitle: "Xác nhận gửi tin hệ thống",
    audience: "Tin sẽ xuất hiện trong tab Tin nhắn hệ thống của toàn bộ người dùng hiện có.", send: "Gửi toàn bộ người dùng",
    success: "Đã gửi thông báo hệ thống.", error: "Chưa xác nhận được lần gửi. Hãy thử lại từ bản xem trước.",
    history: "Lịch sử đã gửi", historyError: "Chưa tải được lịch sử.", empty: "Chưa gửi tin hệ thống nào.", older: "Xem tin cũ hơn",
  } : {
    heading: "Compose a system message", description: "Send an in-app message to all existing MindCanvas accounts.",
    title: "Title", body: "Message", preview: "Preview", confirmTitle: "Confirm system message",
    audience: "This will appear in the System messages tab for every existing account.", send: "Send to all users",
    success: "System message sent.", error: "Delivery could not be confirmed. Retry from the preview.",
    history: "Sent messages", historyError: "Could not load history.", empty: "No system messages sent yet.", older: "Show older messages",
  };
  const [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [items, setItems] = useState<SystemAnnouncement[]>([]), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false), [historyError, setHistoryError] = useState(false);
  const [preview, setPreview] = useState(false), [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(""), [sendError, setSendError] = useState(false);
  const pendingId = useRef<string | null>(null), submitLock = useRef(false);
  const historyTask = useRef<AbortController | null>(null), sendTask = useRef<AbortController | null>(null);

  const load = useCallback(async (before?: SystemAnnouncement) => {
    historyTask.current?.abort();
    const request = new AbortController();
    historyTask.current = request; setLoading(true); setHistoryError(false);
    try {
      const page = await listAdminSystemAnnouncements(before, request.signal);
      if (request.signal.aborted) return;
      setItems(previous => before ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setHasMore(page.hasMore);
    } catch {
      if (!request.signal.aborted) setHistoryError(true);
    } finally {
      if (historyTask.current === request) { historyTask.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { historyTask.current?.abort(); historyTask.current = null; sendTask.current?.abort(); };
  }, [load]);

  const dirty = (value: string, update: (text: string) => void) => {
    pendingId.current = null; setNotice(""); setSendError(false); update(value);
  };

  const publish = async () => {
    if (submitLock.current || !title.trim() || !body.trim()) return;
    const request = new AbortController();
    sendTask.current = request; submitLock.current = true; setSending(true); setSendError(false);
    const timeout = window.setTimeout(() => request.abort("timeout"), 15_000);
    try {
      const { item } = await publishAdminSystemAnnouncement({ requestId: pendingId.current ??= crypto.randomUUID(), title: title.trim(), body: body.trim() }, request.signal);
      if (request.signal.aborted) return;
      setItems(current => [item, ...current.filter(entry => entry.id !== item.id)]);
      setTitle(""); setBody(""); pendingId.current = null;
      setPreview(false); setNotice(labels.success);
      window.dispatchEvent(new Event(SYSTEM_ANNOUNCEMENTS_UPDATED));
      void load();
    } catch {
      if (!request.signal.aborted || request.signal.reason === "timeout") setSendError(true);
    } finally {
      window.clearTimeout(timeout);
      if (sendTask.current === request && (!request.signal.aborted || request.signal.reason === "timeout")) {
        sendTask.current = null; submitLock.current = false; setSending(false);
      }
    }
  };

  return <div className="broadcast-layout">
    <section className="phase-one-card">
      <h2><Megaphone size={18}/>{labels.heading}</h2><p>{labels.description}</p>
      <form className="broadcast-form" onSubmit={event => { event.preventDefault(); if (title.trim() && body.trim()) { setSendError(false); setPreview(true); } }}>
        <label>{labels.title}<input required maxLength={120} value={title} onChange={event => dirty(event.target.value, setTitle)}/></label>
        <label>{labels.body}<textarea required rows={7} maxLength={4000} value={body} onChange={event => dirty(event.target.value, setBody)}/></label>
        <div className="broadcast-form-actions"><small aria-hidden="true">{body.length}/4000</small><button className="primary-button" disabled={!title.trim() || !body.trim()}><Eye size={16}/>{labels.preview}</button></div>
      </form>
      {notice && <p className="form-success" role="status">{notice}</p>}
    </section>
    <section className="phase-one-card broadcast-history">
      <header><h2>{labels.history}</h2><button type="button" className="icon-button" title={t("refresh")} aria-label={t("refresh")} disabled={loading} onClick={() => void load()}><RefreshCw size={17}/></button></header>
      {historyError && <p className="form-error" role="alert">{labels.historyError}</p>}
      {loading && !items.length ? <p role="status">{t("loading")}</p> : !items.length && !historyError && <p>{labels.empty}</p>}
      {items.map(item => <details key={item.id}><summary><strong>{item.title}</strong><time dateTime={item.published_at}>{new Date(item.published_at).toLocaleString(vi ? "vi-VN" : "en")}</time></summary><p className="announcement-body">{item.body}</p></details>)}
      {hasMore && <button type="button" className="secondary-button" disabled={loading} onClick={() => void load(items.at(-1))}>{labels.older}</button>}
    </section>
    {preview && <Dialog workspace title={labels.confirmTitle} dismissible={!sending} onClose={() => setPreview(false)}
      footer={<footer className="actions"><button type="button" className="secondary-button" disabled={sending} onClick={() => setPreview(false)}>{t("cancel")}</button><button type="button" className="primary-button" onClick={() => void publish()} disabled={sending}><Send size={16}/>{sending ? t("loading") : labels.send}</button></footer>}>
      <p className="field-hint">{labels.audience}</p>
      <article className="announcement-preview"><h3>{title.trim()}</h3><p className="announcement-body">{body.trim()}</p></article>
      {sendError && <p className="form-error" role="alert">{labels.error}</p>}
    </Dialog>}
  </div>;
}
