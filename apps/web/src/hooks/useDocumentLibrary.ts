import { useEffect, useMemo, useState } from "react";
import { listOwnedCloudDocuments, type CloudDocumentDescriptor } from "../lib/documentCloud";
import type { UploadedDocument } from "../lib/documentStore";
import { listMyLearningCopySources, type LearningCopySource } from "../lib/learningShare";

export function useDocumentLibrary(owner: string | null, documents: UploadedDocument[], enabled = true) {
  const [cloudFiles, setCloudFiles] = useState<CloudDocumentDescriptor[]>([]);
  const [savedSources, setSavedSources] = useState<LearningCopySource[]>([]);
  const [loading, setLoading] = useState(!!owner && enabled);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!owner || !enabled) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void Promise.all([listOwnedCloudDocuments(owner), listMyLearningCopySources().catch(() => [])])
      .then(([cloud, sources]) => { if (alive) { setCloudFiles(cloud); setSavedSources(sources); } })
      .catch(cause => { if (alive) setError(cause); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [owner, enabled, version]);

  const { files, cloudIds } = useMemo(() => {
    const cloudById = new Map(cloudFiles.map(file => [file.id, file]));
    const provenance = new Map(savedSources.filter(item => item.kind === "document")
      .map(item => [item.copy_id, { title: item.source_title, ownerName: item.owner_name }]));
    const localIds = new Set(documents.map(file => file.id));
    const local = documents.map(file => ({ ...file, updatedAt: cloudById.get(file.id)?.updatedAt ?? file.updatedAt,
      savedFrom: file.savedFrom ?? provenance.get(file.id) }));
    const cloudOnly: UploadedDocument[] = cloudFiles.filter(file => !localIds.has(file.id)).map(file => ({
      ...file, owner: owner ?? "guest", dataUrl: "", folderId: null, savedFrom: provenance.get(file.id),
    }));
    return { files: [...local, ...cloudOnly], cloudIds: new Set(cloudById.keys()) };
  }, [cloudFiles, documents, owner, savedSources]);

  return { files, cloudIds, setCloudFiles, loading, error, refresh: () => setVersion(current => current + 1) };
}
