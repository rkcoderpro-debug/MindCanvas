import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";

export type SystemAnnouncement = { id: string; title: string; body: string; published_at: string };
export type AnnouncementCursor = Pick<SystemAnnouncement, "id" | "published_at">;
export type SystemAnnouncementFeed = {
  items: Array<SystemAnnouncement & { read_at: string | null }>;
  unreadCount: number;
  hasMore: boolean;
};

async function announcementRpc<T>(name: string, args: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (!supabase || !(await getCurrentSession())) throw new Error("AUTH_REQUIRED");
  if (signal?.aborted) throw new Error("ABORTED");
  const { data, error } = await supabase.rpc(name, args).abortSignal(signal ?? requestTimeoutSignal(10_000));
  if (error) throw new Error(error.code || "ANNOUNCEMENT_UNAVAILABLE");
  return data as T;
}

export function listSystemAnnouncements(signal?: AbortSignal, before?: AnnouncementCursor) {
  return announcementRpc<SystemAnnouncementFeed>("list_system_announcements", before ? { p_before_at: before.published_at, p_before_id: before.id } : {}, signal);
}

export function markSystemAnnouncementRead(id: string) {
  return announcementRpc<string>("mark_system_announcement_read", { p_id: id });
}

export const SYSTEM_ANNOUNCEMENTS_UPDATED = "mindcanvas:system-announcements-updated";
