import type { ReactNode } from "react";
import { BookOpen, ClipboardList } from "lucide-react";
import { useLanguage } from "../lib/i18n";

export function StudioHeader({ kind, title, description, actions }: { kind: "note" | "exam"; title: string; description: string; actions?: ReactNode }) {
  const { language } = useLanguage();
  const Icon = kind === "note" ? BookOpen : ClipboardList;
  return <header className="studio-header">
    <span className="studio-header-icon" aria-hidden="true"><Icon size={24}/></span>
    <div className="studio-header-copy">
      <span className="eyebrow">{language === "vi" ? "Tạo tài liệu" : "Document studio"}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions && <div className="studio-header-actions">{actions}</div>}
  </header>;
}

export function StudioLegend({ step, children }: { step: number; children: ReactNode }) {
  return <legend className="studio-legend"><span aria-hidden="true">{String(step).padStart(2, "0")}</span>{children}</legend>;
}
