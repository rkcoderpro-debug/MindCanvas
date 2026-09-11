import { Cloud, HardDrive, History, RotateCcw, Save } from "lucide-react";
import type { ProjectVersion } from "../lib/projectStore";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

type Props = {
  versions: ProjectVersion[];
  loading: boolean;
  working: boolean;
  onClose: () => void;
  onCheckpoint: () => Promise<void>;
  onRestore: (version: ProjectVersion) => Promise<void>;
};

export default function VersionHistory({ versions, loading, working, onClose, onCheckpoint, onRestore }: Props) {
  const { t, language } = useLanguage();
  const formatDate = (value: string) => new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  return <Dialog title={t("versionHistory")} onClose={onClose}>
    <p>{t("versionHint")}</p>
    <div className="version-toolbar">
      <button className="primary-button" disabled={working} onClick={() => void onCheckpoint()}><Save size={16}/>{t("saveCheckpoint")}</button>
    </div>
    {loading ? <p className="version-empty">{t("loading")}</p> : !versions.length ? <div className="version-empty"><History size={30}/><p>{t("noVersions")}</p></div> : <ol className="version-list">
      {versions.map(version => <li key={version.id}>
        <div className="version-meta"><strong>v{version.version}</strong><span><time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time> · {version.source === "cloud" ? <><Cloud size={13}/> {t("cloudVersion")}</> : <><HardDrive size={13}/> {t("localVersion")}</>}</span></div>
        <button className="secondary-button" disabled={working} onClick={() => void onRestore(version)}><RotateCcw size={15}/>{t("restore")}</button>
      </li>)}
    </ol>}
    <p className="version-note">{t("restoreCreatesUndo")}</p>
  </Dialog>;
}
