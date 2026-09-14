import type { BoardState } from "@mindcanvas/shared";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getCurrentSession, supabase } from "./supabase";
import { parseBoard } from "./board";

export type CollaborationRole = "owner" | "editor" | "viewer";
export type ProjectMember = {
  userId: string;
  role: Exclude<CollaborationRole, "owner">;
  displayName: string;
  avatarUrl: string;
  email: string;
  createdAt: string;
};
export type ProjectInvitation = {
  id: string;
  projectId: string;
  email: string;
  role: Exclude<CollaborationRole, "owner">;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
};
export type CollaborationUpdate = {
  projectId: string;
  board: BoardState;
  revision?: number;
  title?: string;
  folderId?: string | null;
  updatedAt?: string;
};

export type ProjectPresence = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: CollaborationRole;
  color: string;
};

function requireClient() {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  return supabase;
}

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Bạn cần đăng nhập để dùng tính năng chia sẻ.");
  return session;
}

export function normalizeInviteEmail(value: string) {
  return value.trim().toLocaleLowerCase();
}

export async function hashInvitationToken(token: string) {
  if (typeof crypto?.subtle?.digest !== "function") throw new Error("Trình duyệt không hỗ trợ tạo link mời an toàn.");
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function invitationUrl(projectId: string, token: string, origin = typeof window === "undefined" ? "" : window.location.origin) {
  const url = new URL(origin || "http://localhost", origin || "http://localhost");
  url.searchParams.set("invite", token);
  url.searchParams.set("project", projectId);
  return origin ? url.toString() : url.pathname + url.search;
}

export async function createProjectInvitation(projectId: string, email: string, role: Exclude<CollaborationRole, "owner">, expiresInDays = 7) {
  const client = requireClient();
  await requireSession();
  const token = randomToken();
  const tokenHash = await hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + Math.min(Math.max(expiresInDays, 1), 14) * 86400000).toISOString();
  const { data, error } = await client.rpc("create_project_invitation", {
    p_project_id: projectId,
    p_email: normalizeInviteEmail(email),
    p_role: role,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Supabase không trả về lời mời hợp lệ.");
  return { invitation: invitationFromRow(row), url: invitationUrl(projectId, token) };
}

function invitationFromRow(row: any): ProjectInvitation {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    email: String(row.email),
    role: row.role === "editor" ? "editor" : "viewer",
    status: ["accepted", "revoked", "expired"].includes(row.status) ? row.status : "pending",
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

function memberFromRow(row: any): ProjectMember {
  return {
    userId: String(row.user_id),
    role: row.role === "editor" ? "editor" : "viewer",
    displayName: typeof row.display_name === "string" && row.display_name ? row.display_name : String(row.email ?? "Member"),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : "",
    email: typeof row.email === "string" ? row.email : "",
    createdAt: String(row.created_at),
  };
}

export async function listProjectMembers(projectId: string) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client.rpc("list_project_members", { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map(memberFromRow);
}

export async function listProjectInvitations(projectId: string) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client.rpc("list_project_invitations", { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map(invitationFromRow);
}

export async function revokeProjectInvitation(invitationId: string) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client.rpc("revoke_project_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
  if (!data) throw new Error("Lời mời đã được dùng hoặc không còn tồn tại.");
}

export async function setProjectMemberRole(projectId: string, userId: string, role: Exclude<CollaborationRole, "owner">) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client.rpc("set_project_member_role", { p_project_id: projectId, p_user_id: userId, p_role: role });
  if (error) throw error;
  if (!data) throw new Error("Không thể đổi quyền thành viên.");
}

export async function removeProjectMember(projectId: string, userId: string) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client.rpc("remove_project_member", { p_project_id: projectId, p_user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("Thành viên đã được xoá hoặc không còn quyền quản lý.");
}

export async function acceptProjectInvitation(token: string) {
  const client = requireClient();
  await requireSession();
  const tokenHash = await hashInvitationToken(token);
  const { data, error } = await client.rpc("accept_project_invitation", { p_token_hash: tokenHash });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.project_id) throw new Error("Lời mời không trả về project.");
  return { projectId: String(row.project_id), role: (row.role === "editor" ? "editor" : "viewer") as "editor" | "viewer", title: String(row.title ?? "") };
}

export function subscribeToProject(projectId: string, onUpdate: (update: CollaborationUpdate) => void, onStatus?: (status: string) => void) {
  if (!supabase) return () => undefined;
  let channel: RealtimeChannel | null = supabase.channel("mindcanvas:project:" + projectId);
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "notes", filter: "id=eq." + projectId },
    (payload: any) => {
      const row = payload?.new;
      const raw = row?.content?.board ?? row?.content;
      if (!row || !raw) return;
      try {
        onUpdate({
          projectId,
          board: parseBoard({ ...raw, id: String(row.id), title: String(row.title ?? raw.title ?? "Untitled canvas") }),
          revision: typeof row.revision === "number" ? row.revision : Number.isFinite(Number(row.revision)) ? Number(row.revision) : undefined,
          title: typeof row.title === "string" ? row.title : undefined,
          folderId: typeof row.folder_id === "string" ? row.folder_id : row.folder_id === null ? null : undefined,
          updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
        });
      } catch {
        // Ignore malformed remote rows; the next valid snapshot can recover.
      }
    },
  );
  channel.subscribe(status => onStatus?.(status));
  const active = channel;
  return () => {
    if (channel === active) {
      channel = null;
      void supabase?.removeChannel(active);
    }
  };
}

/**
 * Lightweight awareness for a shared project. This intentionally does not
 * mutate board data: durable edits still use the revision-safe autosave path.
 */
export function subscribeToProjectPresence(
  projectId: string,
  identity: ProjectPresence,
  onPresence: (people: ProjectPresence[]) => void,
  onStatus?: (status: string) => void,
) {
  if (!supabase) return () => undefined;
  const channel = supabase.channel("mindcanvas:presence:" + projectId, {
    config: { presence: { key: identity.userId } },
  });
  const emit = () => {
    const state = channel.presenceState<ProjectPresence>();
    const people = Object.values(state)
      .flat()
      .filter(person => person && typeof person.userId === "string")
      .reduce<ProjectPresence[]>((all, person) => {
        if (!all.some(item => item.userId === person.userId)) all.push(person);
        return all;
      }, []);
    onPresence(people);
  };
  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe(status => {
      onStatus?.(status);
      if (status === "SUBSCRIBED") void channel.track(identity);
    });
  return () => { void supabase?.removeChannel(channel); };
}
