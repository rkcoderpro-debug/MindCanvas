import { AlertTriangle, Cloud, Copy, HardDrive } from "lucide-react";
import type { ConflictResolution, WorkspaceConflict } from "../hooks/useWorkspace";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

type Props = {
  conflict: WorkspaceConflict;
  working: boolean;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
};

export default function CloudConflictDialog({ conflict, working, onResolve }: Props) {
  const { t, language } = useLanguage();
  const format = (value: string) => new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US");
  return <Dialog title={t("cloudConflictTitle")} dismissible={false} onClose={() => {}}>
    <div className="conflict-intro"><AlertTriangle size={22}/><p>{t("cloudConflictHint")}</p></div>
    <div className="conflict-versions">
      <section><HardDrive size={20}/><div><strong>{t("deviceVersion")}</strong><small>{format(conflict.local.board.updatedAt)}</small></div></section>
      <section><Cloud size={20}/><div><strong>{t("latestCloudVersion")}</strong><small>{format(conflict.remote.board.updatedAt)}</small></div></section>
    </div>
    <p className="conflict-safety">{t("conflictSafety")}</p>
    <footer className="conflict-actions">
      <button className="secondary-button" disabled={working} onClick={() => void onResolve("cloud")}><Cloud size={17}/>{t("useCloudVersion")}</button>
      <button className="secondary-button" disabled={working} onClick={() => void onResolve("copy")}><Copy size={17}/>{t("saveAsCopy")}</button>
      <button className="primary-button" disabled={working} onClick={() => void onResolve("overwrite")}><HardDrive size={17}/>{working ? t("saving") : t("saveDeviceToCloud")}</button>
    </footer>
  </Dialog>;
}
