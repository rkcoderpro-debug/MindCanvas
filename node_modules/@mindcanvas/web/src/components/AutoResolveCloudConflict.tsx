import { useEffect, useRef } from "react";
import type { WorkspaceConflict } from "../hooks/useWorkspace";

type Props = {
  conflict: WorkspaceConflict;
  onResolve: () => Promise<boolean>;
};

/** Resolves a cloud conflict without rendering or opening a dialog. */
export default function AutoResolveCloudConflict({ conflict, onResolve }: Props) {
  const attemptedProject = useRef<string | null>(null);

  useEffect(() => {
    if (attemptedProject.current === conflict.projectId) return;
    attemptedProject.current = conflict.projectId;
    void onResolve().catch(() => undefined);
  }, [conflict.projectId, onResolve]);

  return null;
}
