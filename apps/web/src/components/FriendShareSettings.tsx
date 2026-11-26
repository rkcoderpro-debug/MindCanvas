import type { StudyArea } from "../hooks/useStudyFolders";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Users } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { listConnections, sendDirectMessage, type Connection } from "../lib/connections";
import { manageWorkspaceFileFriends, manageWorkspaceFolderFriends } from "../lib/workspaceFileFriends";
import { useLanguage } from "../lib/i18n";
import { canShare, listLearningInvites, removeLearningMember, revokeLearning } from "../lib/learningShare";

type LearningHistory = Awaited<ReturnType<typeof listLearningInvites>>;
type History = { invites: LearningHistory["invites"]; members: Array<{ user_id: string; display_name?: string | null }> };
type Job = () => Promise<void | History["members"]>;
export default function FriendShareSettings({ kind, id, plan, area }: { kind: "quiz" | "flashcard" | "file" | "folder" | "learning_folder"; id: string; plan?: AccountPlan; area?: StudyArea }) {
  const { language, t } = useLanguage();
  const tr = (vi: string, en: string) => language === "vi" ? vi : en;
  const folder = kind === "folder" || kind === "learning_folder";
  const accountGrant = kind === "file" || folder;
  const entitlement = kind === "learning_folder" ? area ?? "document" : kind === "file" || kind === "folder" ? "document" : kind;
  const tier = entitlement === "document" || entitlement === "lab" ? "Pro" : "Plus";
  const allowed = canShare(entitlement, plan?.effectivePlanId);
  const manage = (op: "list" | "send" | "remove", peer?: string) => folder
    ? manageWorkspaceFolderFriends(kind, id, op, peer)
    : manageWorkspaceFileFriends(id, op, peer);
  const [friends, setFriends] = useState<Connection[] | null>(null);
  const [friendsFailed, setFriendsFailed] = useState(false);
  const [friendsRetry, retryFriends] = useState(0);
  const [peer, setPeer] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState("");
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
    setHistoryError("");
    const read: Promise<History> = accountGrant
      ? manage("list").then(members => ({ members, invites: [] }))
      : listLearningInvites(kind, id);
    void read.then(items => { if (active) setHistory(items); })
      .catch(cause => { if (active) setHistoryError(cause instanceof Error ? cause.message : "SHARE_UNAVAILABLE"); });
    return () => { active = false; };
  }, [kind, id, historyVersion]);

  const run = async (action: Job, success: string, failure: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    try {
      const members = await action();
      setNotice(success);
      if (members) setHistory({ members, invites: [] });
      else refreshHistory(n => n + 1);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(reason === "FILE_FRIENDS_MIGRATION"
        ? tr("Máy chủ chưa bật chia sẻ tài liệu qua tin nhắn.", "File sharing in messages is not enabled on the server yet.")
        : reason === "MESSAGE_RATE_LIMIT" || reason === "SHARE_RATE"
        ? tr("Đã đạt giới hạn gửi. Hãy thử lại sau.", "The sharing limit was reached. Try again later.")
        : reason === "SHARE_NOT_ALLOWED"
        ? tr(`Cần gói ${tier} trở lên để gửi học liệu này qua tin nhắn.`, `Sending this item in messages requires ${tier} or above.`)
        : failure);
    } finally {
      setBusy(false); lock.current = false;
    }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    const friend = friends?.find(person => person.peer_id === peer);
    if (!allowed || !friend || (accountGrant && !history)) return;
    void run(async () => {
      if (accountGrant) {
        const members = await manage("send", friend.peer_id);
        setPeer("");
        return members;
      }
      await sendDirectMessage(friend.peer_id, "", kind, id);
      setPeer("");
    },
      tr(`Đã gửi cho ${friend.display_name} trong tin nhắn MindCanvas.`, `Sent to ${friend.display_name} in MindCanvas messages.`),
      tr("Chưa gửi được học liệu. Hãy kiểm tra kết nối bạn bè rồi thử lại.", "Could not send this study item. Check your connection and try again."));
  };
  const accessError = historyError === "FILE_FRIENDS_MIGRATION"
    ? tr("Máy chủ chưa bật chia sẻ tài liệu qua tin nhắn.", "File sharing in messages is not enabled on the server yet.")
    : tr("Chưa tải được quyền đã cấp.", "Could not load existing access.");
  const tryAccessAgain = () => refreshHistory(n => n + 1);
  const pending = history?.invites.filter(invite => invite.status === "pending") ?? [];
  const members = history?.members ?? [];
  const memberName = (memberId: string) => friends?.find(person => person.peer_id === memberId)?.display_name
    ?? members.find(member => member.user_id === memberId)?.display_name
    ?? history?.invites.find(invite => invite.recipient_id === memberId)?.email
    ?? `${tr("Thành viên", "Member")} · ${memberId.slice(0, 8)}`;
  const revoke = (action: Job) => void run(action, tr("Đã thu hồi quyền.", "Access revoked."),
    tr("Chưa thu hồi được quyền. Hãy thử lại.", "Could not revoke access. Try again."));

  return <section className="workspace-share-block workspace-share-friends">
    <h2><Users size={18}/>{tr("Gửi cho bạn bè", "Send to friends")}</h2>
    {!allowed ? <small>{kind === "learning_folder"
      ? tr(`Gửi trực tiếp qua tin nhắn dành cho gói ${tier} trở lên. Bạn có thể dùng link bên dưới.`, `Direct sharing in messages requires ${tier} or above. You can use a link below.`)
      : tr(`Gửi trực tiếp qua tin nhắn dành cho gói ${tier} trở lên. Bạn vẫn có thể dùng link hoặc mời qua email bên dưới.`, `Direct sharing in messages is available on ${tier} and above. You can still use a link or invite by email below.`)}</small>
      : <><small>{folder
        ? tr("Chỉ tài khoản bạn chọn nhận quyền xem thư mục và học liệu bên trong.", "The selected account receives view access to the folder and its contents.")
        : kind === "file"
        ? tr("Bạn bè mở hoặc tải tài liệu ngay từ tin nhắn. Chỉ tài khoản bạn chọn được cấp quyền xem.", "Friends can open or download this file from messages. Only the selected account receives view access.")
        : tr("Gửi học liệu vào tin nhắn MindCanvas. Bạn bè có thể học và lưu bản sao riêng.", "Send this study item in MindCanvas messages. Friends can study and save their own copy.")}</small>
        {friendsFailed ? <div className="workspace-share-friend-error"><small role="status">{tr("Không tải được danh sách bạn bè.", "Could not load friends.")}</small>
          <button type="button" className="secondary-button" onClick={() => retryFriends(n => n + 1)}>{t("retry")}</button></div>
          : !friends ? <small role="status">{t("loading")}</small>
          : !friends.length ? <small>{tr("Chưa có bạn bè kết nối trên MindCanvas.", "You have no connected friends on MindCanvas yet.")}</small>
          : <form className="workspace-share-friend-form" onSubmit={send}>
            <label>{tr("Bạn bè", "Friend")}<select value={peer} onChange={event => { setPeer(event.target.value); setNotice(""); }} disabled={busy} required>
              <option value="" disabled>{tr("Chọn người nhận", "Choose a recipient")}</option>
              {friends.map(friend => <option key={friend.peer_id} value={friend.peer_id}>{friend.display_name}</option>)}
            </select></label>
            <button className="primary-button" disabled={!peer || busy || (accountGrant && !history)}><Send size={15}/>{tr("Gửi qua tin nhắn", "Send in messages")}</button>
          </form>}
      </>}
    {accountGrant && historyError && <div className="workspace-share-friend-error"><small role="status">{accessError}</small>
      <button type="button" className="secondary-button" onClick={tryAccessAgain}>{t("retry")}</button></div>}
    {(members.length > 0 || pending.length > 0 || (!accountGrant && historyError)) && <details className="workspace-share-prior">
      <summary>{accountGrant ? tr("Bạn bè đã được cấp quyền", "Friends with access") : tr("Quyền từ tin nhắn và lời mời trước đây", "Access from messages and earlier invites")}{members.length + pending.length > 0 ? ` (${members.length + pending.length})` : ""}</summary>
      {!accountGrant && historyError && <div className="workspace-share-friend-error"><small role="status">{accessError}</small>
        <button type="button" className="secondary-button" onClick={tryAccessAgain}>{t("retry")}</button></div>}
      {members.length > 0 && <ul className="workspace-share-grants">{members.map(member => <li key={member.user_id}>
        <strong>{memberName(member.user_id)}</strong>
        <button type="button" className="secondary-button" disabled={busy} aria-label={`${tr("Thu hồi quyền của", "Revoke access for")} ${memberName(member.user_id)}`} onClick={() => revoke(() => accountGrant ? manage("remove", member.user_id) : removeLearningMember(kind, id, member.user_id))}>{tr("Thu hồi", "Revoke")}</button>
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
