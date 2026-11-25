import { Sparkles, Copy, Check } from "lucide-react";
import { useLanguage } from "../lib/i18n";

export default function ExamModeSwitch({ mode, disabled, onChange, documentMode = false }: { documentMode?: boolean; mode: "auto" | "manual"; disabled: boolean; onChange: (mode: "auto" | "manual") => void }) {
  const vi = useLanguage().language === "vi";
  return <div className="exam-mode-switch" role="group" aria-label={vi ? "Chế độ AI" : "AI mode"}>
    <button type="button" aria-label="AI Auto" aria-pressed={mode === "auto"} disabled={disabled} onClick={() => onChange("auto")}>
      <span className="studio-choice-icon"><Sparkles size={17} aria-hidden="true"/></span><span>AI Auto<small>{vi ? documentMode ? "Tạo tài liệu trên MindCanvas" : "Tạo đề trên MindCanvas" : "Generate on MindCanvas"}</small></span>
      {mode === "auto" && <Check className="studio-choice-check" size={15} aria-hidden="true"/>}
    </button>
    <button type="button" aria-label="AI Manual" aria-pressed={mode === "manual"} disabled={disabled} onClick={() => onChange("manual")}>
      <span className="studio-choice-icon"><Copy size={17} aria-hidden="true"/></span><span>AI Manual<small>{vi ? "Dùng AI bạn chọn" : "Use an AI of your choice"}</small></span>
      {mode === "manual" && <Check className="studio-choice-check" size={15} aria-hidden="true"/>}
    </button>
  </div>;
}
