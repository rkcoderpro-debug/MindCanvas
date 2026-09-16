import { useEffect, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { canShare, inviteLearning, listLearningInvites, removeLearningMember, revokeLearning, type LearningInvite, type LearningKind, type LearningMember } from "../lib/learningShare";
import { copyTextWithFallback } from "../lib/share";
import Dialog from "./Dialog";

export function LearningShareButton({ kind, id, title, plan, available = true }: { kind: LearningKind; id: string; title: string; plan?: AccountPlan; available?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="secondary-button" onClick={() => setOpen(true)}><Share2 size={16}/>Chia sẻ</button>
    {open && <LearningShareDialog kind={kind} id={id} title={title} plan={plan} available={available} onClose={() => setOpen(false)}/>}</>;
}

function LearningShareDialog({ kind, id, title, plan, available, onClose }: { kind: LearningKind; id: string; title: string; plan?: AccountPlan; available: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [invites, setInvites] = useState<LearningInvite[]>([]);
  const [members, setMembers] = useState<LearningMember[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const allowed = canShare(kind, plan?.effectivePlanId);
  const refresh = async () => { const result = await listLearningInvites(kind, id); setInvites(result.invites); setMembers(result.members); };
  useEffect(() => { if (available) void refresh().catch(e => setError(String(e.message ?? e))); }, [kind, id, available]);
  const run = async (job: () => Promise<void>) => { setBusy(true); setError(""); try { await job(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Không thể lưu thay đổi."); } finally { setBusy(false); } };
  return <Dialog title={`Chia sẻ ${title}`} onClose={onClose}>
    {!allowed ? <div className="learning-share-upgrade"><p>Gói {kind === "lab" ? "Pro" : "Plus"} trở lên mới có thể chia sẻ {kind === "lab" ? "Lab" : "Quiz và Flashcard"}. Người được mời có thể dùng gói Free để học. Nếu hạ gói, lời mời và dữ liệu vẫn được giữ nhưng quyền truy cập tạm dừng.</p>{members.map(m => <div className="learning-share-row" key={m.user_id}><span>{invites.find(i => i.recipient_id === m.user_id)?.email ?? m.user_id}</span><button disabled={busy} onClick={() => void run(() => removeLearningMember(kind, id, m.user_id))}>Thu hồi</button></div>)}{invites.filter(i => i.status === "pending").map(i => <div className="learning-share-row" key={i.id}><span>Lời mời: {i.email}</span><button disabled={busy} onClick={() => void run(() => revokeLearning(i.id))}>Hủy</button></div>)}<button className="secondary-button" onClick={onClose}>Đóng</button></div>
      : !available ? <p>Hãy lưu học liệu lên cloud trước khi chia sẻ. Dữ liệu local vẫn được giữ nguyên.</p>
      : <div className="learning-share-dialog"><p>Chỉ email được mời mới có thể nhận liên kết. Người nhận có quyền học/xem và không thể sửa bản gốc.</p>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { setUrl(await inviteLearning(kind, id, email, days)); setEmail(""); }); }}><label>Email người nhận<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="banhoc@example.com"/></label><label>Hạn lời mời (ngày)<input type="number" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))}/></label><button className="primary-button" disabled={busy}>Tạo liên kết mời</button></form>
        {url && <div className="learning-share-link"><input aria-label="Liên kết mời" ref={input} readOnly value={url}/><button className="secondary-button" onClick={() => void copyTextWithFallback(url, input.current).then(ok => { if (!ok) setError("Hãy chọn và sao chép liên kết thủ công."); })}>Sao chép</button></div>}
        <h3>Người đã nhận ({members.length})</h3>{members.map(m => <div className="learning-share-row" key={m.user_id}><span>{invites.find(i => i.recipient_id === m.user_id)?.email ?? m.user_id}</span><button disabled={busy} onClick={() => void run(() => removeLearningMember(kind, id, m.user_id))}>Thu hồi</button></div>)}
        <h3>Lời mời</h3>{invites.map(i => <div className="learning-share-row" key={i.id}><span>{i.email} · {i.status === "pending" && new Date(i.expires_at) <= new Date() ? "Hết hạn" : i.status === "pending" ? "Đang chờ" : i.status === "accepted" ? "Đã nhận" : "Đã hủy"} · {new Date(i.expires_at).toLocaleDateString("vi-VN")}</span>{i.status === "pending" && <button disabled={busy} onClick={() => void run(() => revokeLearning(i.id))}><X size={14}/>Hủy</button>}</div>)}
      </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </Dialog>;
}
