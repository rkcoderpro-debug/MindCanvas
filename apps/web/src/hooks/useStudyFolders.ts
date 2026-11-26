import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { folderAncestors, type FolderTreeNode } from "../components/FolderTreePicker";

export type StudyArea = "quiz" | "flashcard" | "lab";
export type StudyFolder = FolderTreeNode & { parentId: string | null };
type Placements = Record<string, string | null>;
type FolderState = { folders: StudyFolder[]; placements: Placements; pending: Placements };
const empty: FolderState = { folders: [], placements: {}, pending: {} };

function readState(scope: string): FolderState {
  try {
    const cached = JSON.parse(localStorage.getItem(scope) ?? "null");
    return cached && Array.isArray(cached.folders) ? { ...empty, ...cached } : empty;
  } catch {
    return empty;
  }
}

function writeState(scope: string, value: FolderState) {
  localStorage.setItem(scope, JSON.stringify(value));
}

function removePlacement(placements: Placements, id: string) {
  const next = { ...placements };
  delete next[id];
  return next;
}

export function useStudyFolders(owner: string | null, area: StudyArea, cloudIds: readonly string[] = []) {
  const scope = `mindcanvas:study-folders:v1:${owner ?? "guest"}:${area}`;
  const [snapshot, setSnapshot] = useState(() => ({ scope, value: readState(scope) }));
  const [current, setCurrent] = useState<{ scope: string; id: string | null }>({ scope, id: null });
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [moving, setMoving] = useState(false);
  const stateRef = useRef(snapshot);
  const activeScope = useRef(scope);
  const moveLock = useRef<string | null>(null);
  activeScope.current = scope;
  const value = snapshot.scope === scope ? snapshot.value : empty;
  const client = owner ? supabase : null;
  const ready = !client || readyScope === scope;
  const order = current.scope === scope ? current.id : null;
  const folderId = value.folders.some(folder => folder.id === order) ? order : null;

  function update(mutate: (old: FolderState) => FolderState) {
    if (activeScope.current !== scope) return;
    const old = stateRef.current.scope === scope ? stateRef.current.value : readState(scope);
    const next = mutate(old);
    if (!client) writeState(scope, next);
    else {
      try {
        writeState(scope, next);
      } catch (error) {
        if (next.pending !== old.pending && Object.keys(next.pending).length) throw error;
      }
    }
    const record = { scope, value: next };
    stateRef.current = record;
    setSnapshot(record);
  }

  useEffect(() => {
    let active = true;
    const starting = { scope, value: readState(scope) };
    stateRef.current = starting;
    setSnapshot(starting);
    setFetchError(false);
    setMoving(false);
    if (!client) return;
    setReadyScope(null);
    const load = async () => {
      const [folders, items] = await Promise.all([
        client.from("study_folders").select("id,name,parent_id").eq("user_id", owner!).eq("area", area).order("name"),
        client.from("study_folder_items").select("item_id,folder_id").eq("user_id", owner!).eq("area", area),
      ]);
      if (!active || activeScope.current !== scope) return;
      if (folders.error || items.error) throw folders.error ?? items.error;
      update(old => ({
        ...old,
        folders: folders.data.map(row => ({ id: row.id, name: row.name, parentId: row.parent_id })),
        placements: Object.fromEntries(items.data.map(row => [row.item_id, row.folder_id])),
      }));
      setReadyScope(scope);
    };
    void load().catch(() => { if (active) setFetchError(true); });
    return () => { active = false; };
  }, [client, owner, area, scope]);

  async function saveFolder(name: string, existing?: StudyFolder) {
    if (!ready) throw new Error("Thư mục chưa đồng bộ. Hãy thử tải lại trang.");
    const parentId = existing ? existing.parentId : folderId;
    let id = existing?.id ?? crypto.randomUUID();
    if (client) {
      const { data, error } = await client.rpc("study_folder_save", {
        p_area: area, p_id: existing?.id ?? null, p_parent: parentId, p_name: name,
      });
      if (error) throw error;
      id = data;
    } else if (!existing && folderAncestors(value.folders, parentId).length >= 16) {
      throw new Error("Thư mục đã đạt độ sâu tối đa.");
    }
    update(old => ({
      ...old,
      folders: old.folders.filter(folder => folder.id !== id).concat({ id, parentId, name }),
    }));
    return id;
  }

  async function moveItem(id: string, target: string | null, synced = true) {
    if (!ready || moveLock.current === scope) throw new Error("Thư mục chưa sẵn sàng. Hãy thử lại.");
    if (!client) {
      update(old => ({ ...old, placements: target ? { ...old.placements, [id]: target } : removePlacement(old.placements, id) }));
      return;
    }
    moveLock.current = scope;
    setMoving(true);
    try {
      const hadCloudFolder = !!stateRef.current.value.placements[id];
      let saved = false;
      if ((synced || hadCloudFolder) && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
        const { data, error } = await client.rpc("study_folder_move", {
          p_area: area, p_item: id, p_folder: synced ? target : null,
        });
        if (error) throw error;
        saved = !!data;
      }
      update(old => ({
        ...old,
        placements: saved && synced && target ? { ...old.placements, [id]: target } : removePlacement(old.placements, id),
        pending: (saved && synced) || !target ? removePlacement(old.pending, id) : { ...old.pending, [id]: target },
      }));
    } finally {
      if (moveLock.current === scope) moveLock.current = null;
      if (activeScope.current === scope) setMoving(false);
    }
  }

  const cloudKey = cloudIds.slice().sort().join(",");
  useEffect(() => {
    if (!client || !ready || !cloudKey) return;
    const cloud = new Set(cloudKey.split(","));
    const settle = async () => {
      const pending = stateRef.current.value.pending;
      for (const [id, target] of Object.entries(pending)) {
        if (activeScope.current !== scope || moveLock.current === scope) return;
        if (cloud.has(id) && stateRef.current.value.pending[id] === target) await moveItem(id, target);
      }
    };
    void settle().catch(() => undefined);
  }, [client, ready, scope, cloudKey]);

  const itemFolder = (id: string): string | null => (Object.hasOwn(value.pending, id) ? value.pending[id] : value.placements[id]) ?? null;
  return {
    folders: value.folders, folderId, selectFolder: (id: string | null) => setCurrent({ scope, id }),
    itemFolder, saveFolder, moveItem, ready, fetchError, moving,
    pendingIn: (id: string, items: { id: string; title: string; cloud: boolean }[]) => items.filter(item =>
      !item.cloud && folderAncestors(value.folders, itemFolder(item.id)).some(folder => folder.id === id)),
  };
}

export type StudyFolders = ReturnType<typeof useStudyFolders>;
