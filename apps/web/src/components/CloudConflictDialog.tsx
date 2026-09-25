import { useRef, useState } from "react";
import { AlertTriangle, Cloud, Copy, HardDrive } from "lucide-react";
import type { ConflictResolution, WorkspaceConflict } from "../hooks/useWorkspace";
import { errorMessage } from "../lib/errors";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

type Props = {
  conflict: WorkspaceConflict;
  onResolve: (resolution: ConflictResolution) => Promise<boolean>;
};

export default function CloudConflictDialog({ conflict, onResolve }: Props) {
  const { t, language } = useLanguage();
  const [workingAction, setWorkingAction] = useState<ConflictResolution | null>(null);
  const [queuedAction, setQueuedAction] = useState<ConflictResolution | null>(null);
  const [localError, setLocalError] = useState("");
  const actionInFlight = useRef(false);
  const queuedActionRef = useRef<ConflictResolution | null>(null);
  const resolve = async (resolution: ConflictResolution) => {
    if (actionInFlight.current) {
      queuedActionRef.current = resolution;
      setQueuedAction(resolution);
      setLocalError("");
      return;
    }
    actionInFlight.current = true;
    try {
      let nextAction: ConflictResolution | null = resolution;
      while (nextAction) {
        const currentAction = nextAction;
        nextAction = null;
        queuedActionRef.current = null;
        setQueuedAction(null);
        setWorkingAction(currentAction);
        setLocalError("");

        let resolved = false;
        let failure = "";
        try {
          resolved = await onResolve(currentAction);
        } catch (error) {
          failure = errorMessage(error, language === "vi" ? "Không thể hoàn tất lựa chọn." : "Could not complete this choice.");
        }

        if (resolved) {
          // A successful choice closes the conflict. Never run an alternate
          // queued choice against a conflict that has already been resolved.
          queuedActionRef.current = null;
          setQueuedAction(null);
          break;
        }

        const requestedNext = queuedActionRef.current;
        if (requestedNext) {
          nextAction = requestedNext;
          queuedActionRef.current = null;
          setQueuedAction(null);
          continue;
        }

        setLocalError(failure || (language === "vi" ? "Chưa hoàn tất được lựa chọn. Bản nháp vẫn được giữ; hãy kiểm tra lỗi và thử lại." : "This choice could not be completed. The device draft is still kept; review the error and try again."));
      }
    } finally {
      actionInFlight.current = false;
      setWorkingAction(null);
      queuedActionRef.current = null;
      setQueuedAction(null);
    }
  };
  const actionError = conflict.error || localError;
  const actionLabel = (action: ConflictResolution) => action === "cloud" ? t("useCloudVersion") : action === "copy" ? t("saveAsCopy") : t("saveDeviceToCloud");
  const format = (value: string) => new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US");
  return <Dialog title={t("cloudConflictTitle")} dismissible={false} onClose={() => {}}>
    <div className="conflict-intro"><AlertTriangle size={22}/><p>{t("cloudConflictHint")}</p></div>
    <div className="conflict-versions">
      <section><HardDrive size={20}/><div><strong>{t("deviceVersion")}</strong><small>{format(conflict.local.board.updatedAt)}</small></div></section>
      <section><Cloud size={20}/><div><strong>{t("latestCloudVersion")}</strong><small>{format(conflict.remote.board.updatedAt)}</small></div></section>
    </div>
    <p className="conflict-safety">{t("conflictSafety")}</p>
    {actionError && <div className="conflict-error" role="alert">{actionError}</div>}
    {queuedAction && <div className="conflict-queue-message" role="status">{t("conflictChoiceQueued", { choice: actionLabel(queuedAction) })}</div>}
    <footer className="conflict-actions">
      <button className="secondary-button" disabled={workingAction === "cloud"} onClick={() => void resolve("cloud")}><Cloud size={17}/>{workingAction === "cloud" ? t("saving") : queuedAction === "cloud" ? t("conflictQueued") : t("useCloudVersion")}</button>
      <button className="secondary-button" disabled={workingAction === "copy"} onClick={() => void resolve("copy")}><Copy size={17}/>{workingAction === "copy" ? t("saving") : queuedAction === "copy" ? t("conflictQueued") : t("saveAsCopy")}</button>
      <button className="primary-button" disabled={workingAction === "overwrite"} onClick={() => void resolve("overwrite")}><HardDrive size={17}/>{workingAction === "overwrite" ? t("saving") : queuedAction === "overwrite" ? t("conflictQueued") : t("saveDeviceToCloud")}</button>
    </footer>
  </Dialog>;
}
