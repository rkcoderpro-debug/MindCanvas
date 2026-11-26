import { supabase } from "./supabase";

export type WorkspaceFileFriend = { user_id: string; display_name: string | null };

export async function manageWorkspaceFolderFriends(kind: "folder" | "learning_folder", folderId: string, op: "list" | "send" | "remove", peerId?: string): Promise<WorkspaceFileFriend[]> {
  if (!supabase) throw new Error("SHARE_UNAVAILABLE");
  const { data, error } = await supabase.rpc("ws_share_folder_friend", {
    p_kind: kind, p_folder: folderId, p_op: op, p_peer: peerId ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("FILE_FRIENDS_MIGRATION");
    throw new Error(error.message);
  }
  return Array.isArray(data) ? data : [];
}

export async function manageWorkspaceFileFriends(fileId: string, op: "list" | "send" | "remove", peerId?: string): Promise<WorkspaceFileFriend[]> {
  if (!supabase) throw new Error("SHARE_UNAVAILABLE");
  const { data, error } = await supabase.rpc("ws_share_file_friend", { p_file: fileId, p_op: op, p_peer: peerId ?? null });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("FILE_FRIENDS_MIGRATION");
    throw new Error(error.message);
  }
  return Array.isArray(data) ? data : [];
}
