import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Users } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { listConnections, sendDirectMessage, type Connection } from "../lib/connections";
import { useLanguage } from "../lib/i18n";
import { canShare, listLearningInvites, removeLearningMember, revokeLearning } from "../lib/learningShare";

type History = Awaited<ReturnType<typeof listLearningInvites>>;
export default function FriendShareSettings({ kind, id, plan }: { kind: "quiz" | "flashcard"; id: string; plan?: AccountPlan }) {
  const { language, t } = useLanguage();
  const tr = (vi: string, en: string) => language === "vi" ? vi : en;
  const allowed = canShare(kind, plan?.effectivePlanId);
  const [friends, setFriends] = useState<Connection[] | null>(null);
  const [friendsFailed, setFriendsFailed] = useState(false);
  const [friendsRetry, retryFriends] = useState(0);
  const [peer, setPeer] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyVersion, refreshHistory] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setFriendsFailed(false);
    void listConnections().then(people => { if (active) setFriends(people); })
      .catch(() => { if (active) setFriendsFailed(true); });
    return () => { active = false; };
  }, [allowed, friendsRetry]);

  useEffect(() => {
    let active = true;
    setHistoryFailed(false);
    void listLearningInvites(kind, id).then(items => { if (active) setHistory(items); })
      .catch(() => { if (active) setHistoryFailed(true); });
    return () => { active = false; };
  }, [kind, id, historyVersion]);

  const run = async (action: () => Promise<void>, success: string, failure: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    try {
      await action();
      setNotice(success);
      refreshHistory(n => n + 1);
    } catch {
      setError(failure);
    } finally {
      setBusy(false); lock.current = false;
    }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    const friend = friends?.find(person => person.peer_id === peer);
    if (!allowed || !friend) return;
    void run(async () => { await sendDirectMessage(friend.peer_id, "", kind, id); setPeer(""); },
      tr(`Đã gửi cho ${friend.display_name} trong tin nhắn MindCanvas.`, `Sent to ${friend.display_name} in MindCanvas messages.`),
      tr("Chưa gửi được học liệu. Hãy kiểm tra kết nối bạn bè rồi thử lại.", "Could not send this study item. Check your connection and try again."));
  };
  const pending = history?.invites.filter(invite => invite.status === "pending") ?? [];
  const members = history?.members ?? [];
  const memberName = (memberId: string) => friends?.find(person => person.peer_id === memberId)?.display_name
    ?? history?.invites.find(invite => invite.recipient_id === memberId)?.email
    ?? `${tr("Thành viên", "Member")} · ${memberId.slice(0, 8)}`;
  const revoke = (action: () => Promise<void>) => void run(action, tr("Đã thu hồi quyền.", "Access revoked."),
    tr("Chưa thu hồi được quyền. Hãy thử lại.", "Could not revoke access. Try again."));

  return <section className="workspace-share-block workspace-share-friends">
    <h2><Users size={18}/>{tr("Gửi cho bạn bè", "Send to friends")}</h2>
    {!allowed ? <small>{tr("Gửi trực tiếp qua tin nhắn dành cho gói Plus trở lên. Bạn vẫn có thể dùng link hoặc mời qua email bên dưới.", "Direct sharing in messages is available on Plus and above. You can still use a link or invite by email below.")}</small>
      : <><small>{tr("Gửi học liệu vào tin nhắn MindCanvas. Bạn bè có thể học và lưu bản sao riêng.", "Send this study item in MindCanvas messages. Friends can study and save their own copy.")}</small>
        {friendsFailed ? <div className="workspace-share-friend-error"><small role="status">{tr("Không tải được danh sách bạn bè.", "Could not load friends.")}</small>
          <button type="button" className="secondary-button" onClick={() => retryFriends(n => n + 1)}>{t("retry")}</button></div>
          : !friends ? <small role="status">{t("loading")}</small>
          : !friends.length ? <small>{tr("Chưa có bạn bè kết nối trên MindCanvas.", "You have no connected friends on MindCanvas yet.")}</small>
          : <form className="workspace-share-friend-form" onSubmit={send}>
            <label>{tr("Bạn bè", "Friend")}<select value={peer} onChange={event => { setPeer(event.target.value); setNotice(""); }} disabled={busy} required>
              <option value="" disabled>{tr("Chọn người nhận", "Choose a recipient")}</option>
              {friends.map(friend => <option key={friend.peer_id} value={friend.peer_id}>{friend.display_name}</option>)}
            </select></label>
            <button className="primary-button" disabled={!peer || busy}><Send size={15}/>{tr("Gửi qua tin nhắn", "Send in messages")}</button>
          </form>}
      </>}
    {(members.length > 0 || pending.length > 0 || historyFailed) && <details className="workspace-share-prior">
      <summary>{tr("Quyền từ tin nhắn và lời mời trước đây", "Access from messages and earlier invites")}{members.length + pending.length > 0 ? ` (${members.length + pending.length})` : ""}</summary>
      {historyFailed && <div className="workspace-share-friend-error"><small role="status">{tr("Chưa tải được quyền đã cấp.", "Could not load existing access.")}</small>
        <button type="button" className="secondary-button" onClick={() => refreshHistory(n => n + 1)}>{t("retry")}</button></div>}
      {members.length > 0 && <ul className="workspace-share-grants">{members.map(member => <li key={member.user_id}>
        <strong>{memberName(member.user_id)}</strong>
        <button type="button" className="secondary-button" disabled={busy} aria-label={`${tr("Thu hồi quyền của", "Revoke access for")} ${memberName(member.user_id)}`} onClick={() => revoke(() => removeLearningMember(kind, id, member.user_id))}>{tr("Thu hồi", "Revoke")}</button>
      </li>)}</ul>}
      {pending.length > 0 && <ul className="workspace-share-grants">{pending.map(invite => <li key={invite.id}>
        <strong>{invite.email}</strong>
        <small>{Date.parse(invite.expires_at) <= Date.now() ? tr("Hết hạn", "Expired") : tr("Đang chờ", "Pending")}</small>
        <button type="button" className="secondary-button" disabled={busy} aria-label={`${tr("Hủy lời mời", "Cancel invite")}: ${invite.email}`} onClick={() => revoke(() => revokeLearning(invite.id))}>{tr("Hủy lời mời", "Cancel invite")}</button>
      </li>)}</ul>}
    </details>}
    {busy && <small role="status">{t("saving")}</small>}
    {notice && <small role="status">{notice}</small>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
