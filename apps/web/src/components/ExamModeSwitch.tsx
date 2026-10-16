import { Sparkles, Copy } from "lucide-react";

export default function ExamModeSwitch({ mode, disabled, onChange }: { mode: "auto" | "manual"; disabled: boolean; onChange: (mode: "auto" | "manual") => void }) {
  return <div className="exam-mode-switch" role="group" aria-label="Chế độ AI đề thi">
    <button type="button" aria-label="AI Auto" aria-pressed={mode === "auto"} disabled={disabled} onClick={() => onChange("auto")}><Sparkles size={18}/><span>AI Auto<small>Tạo đề ngay trên MindCanvas</small></span></button>
    <button type="button" aria-label="AI Manual" aria-pressed={mode === "manual"} disabled={disabled} onClick={() => onChange("manual")}><Copy size={18}/><span>AI Manual<small>Lấy prompt, gửi AI bạn chọn</small></span></button>
  </div>;
}
