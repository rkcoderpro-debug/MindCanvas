import { CheckCircle2, Cloud, CloudOff, HardDrive, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { Project } from "../lib/projectStore";
import type { SaveStatus } from "../hooks/useWorkspace";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

type Props = {
  owner: string | null;
  online: boolean;
  status: SaveStatus;
  projects: Project[];
  working: boolean;
  onRetry: () => Promise<void>;
  onClose: () => void;
};

export default function SyncCenter({ owner, online, status, projects, working, onRetry, onClose }: Props) {
  const { t, language } = useLanguage();
  const pending = projects.filter(project => project.pending);
  const ready = !!owner && online && !pending.length && status !== "saveError";
  return <Dialog title={t("syncCenter")} onClose={onClose}>
    <p className="dialog-intro">{t(owner ? "syncCenterCloudHint" : "syncCenterLocalHint")}</p>
    <div className="sync-overview">
      <section className={online ? "online" : "offline"}>
        {online ? <Wifi size={20}/> : <WifiOff size={20}/>}<span><strong>{t(online ? "networkOnline" : "networkOffline")}</strong><small>{t(online ? "networkOnlineHint" : "networkOfflineHint")}</small></span>
      </section>
      <section className={ready ? "ready" : pending.length ? "pending" : "local"}>
        {ready ? <CheckCircle2 size={20}/> : owner ? pending.length ? <CloudOff size={20}/> : <Cloud size={20}/> : <HardDrive size={20}/>}<span><strong>{t(owner ? ready ? "syncUpToDate" : "syncCloud" : "syncDeviceOnly")}</strong><small>{owner ? t("pendingFiles", { count: pending.length }) : t("signInToSync")}</small></span>
      </section>
    </div>
    <section className="sync-queue">
      <div className="sync-queue-heading"><strong>{t("syncQueue")}</strong><span>{pending.length}</span></div>
      {pending.length ? <div className="sync-project-list">{pending.map(project => <div key={project.id}><span><strong>{project.title}</strong><small>{new Date(project.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</small></span><CloudOff size={16}/></div>)}</div>
        : <div className="sync-empty"><CheckCircle2 size={26}/><span>{t(owner ? "syncQueueEmpty" : "syncLocalReady")}</span></div>}
    </section>
    <p className="sync-safety"><HardDrive size={15}/>{t("offlineSafety")}</p>
    <footer className="actions"><button className="secondary-button" onClick={onClose}>{t("close")}</button><button className="primary-button" disabled={working || !owner || !online} onClick={() => void onRetry()}><RefreshCw className={working ? "spin" : ""} size={16}/>{working ? t("saving") : t("syncNow")}</button></footer>
  </Dialog>;
}
