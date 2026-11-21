import { Gift, Sparkles } from "lucide-react";
import Dialog from "./Dialog";
import type { PlusTrialState } from "../lib/plusTrial";

function expiryLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PlusTrialPopup({ trial, working, activated, error, onActivate, onClose }: {
  trial: PlusTrialState;
  working: boolean;
  activated: boolean;
  error: string;
  onActivate: () => void;
  onClose: () => void;
}) {
  const expiry = expiryLabel(trial.expiresAt);
  return <Dialog title={activated ? "Plus đã được kích hoạt" : "3 ngày Plus miễn phí"} onClose={onClose} dismissible={!working}>
    <div className={`plus-trial-popup ${activated ? "activated" : ""}`}>
      <div className="plus-trial-orbit" aria-hidden="true"><Sparkles/><Gift/></div>
      {activated ? <>
        <strong className="plus-trial-heading">✨ Chào mừng bạn đến với Plus!</strong>
        <p>Bạn đã mở khóa quyền lợi Plus trong 3 ngày.</p>
        {expiry && <p className="plus-trial-expiry">Có hiệu lực đến <strong>{expiry}</strong>.</p>}
      </> : <>
        <strong className="plus-trial-heading">🎁 Bạn có 3 ngày Plus miễn phí</strong>
        <p>Ưu đãi chưa bắt đầu cho đến khi bạn bấm kích hoạt. Bạn có thể để dành và kích hoạt vào lúc phù hợp.</p>
        <div className="plus-trial-benefits"><span>Quiz & Flashcard Plus</span><span>Theme cao cấp</span><span>Trải nghiệm đầy đủ hơn</span></div>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <footer className="actions">
      {activated ? <button className="primary-button" type="button" onClick={onClose}>Bắt đầu trải nghiệm</button> : <>
        <button className="secondary-button" type="button" disabled={working} onClick={onClose}>Để sau</button>
        <button className="primary-button plus-trial-activate" type="button" disabled={working} onClick={onActivate}><Sparkles size={17}/>{working ? "Đang kích hoạt..." : "Kích hoạt 3 ngày Plus"}</button>
      </>}
    </footer>
  </Dialog>;
}
