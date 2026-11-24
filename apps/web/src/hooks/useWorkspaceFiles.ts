import { useCallback, useEffect, useState } from "react";
import { listWorkspaceFiles, type WorkspaceFile } from "../lib/workspaceFiles";

export function useWorkspaceFiles(owner: string | null, enabled: boolean) {
  const [files,setFiles] = useState<WorkspaceFile[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<unknown>(null);
  const [version,setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(prev => prev+1),[]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(null);
    void listWorkspaceFiles(owner).then(rows => { if (active) setFiles(rows); })
      .catch(cause => { if (active) setError(cause); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [owner,enabled,version]);
  return { files, setFiles, loading, error, refresh };
}
