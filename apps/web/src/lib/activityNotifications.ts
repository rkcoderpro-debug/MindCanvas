import { getCurrentSession, supabase } from "./supabase";

export type ActivityNotification = {
  kind: "message" | "connection_invite" | "learning_invite" | "shared_learning" | "class_invite" | "teacher_invite" | "assignment" | "project_invite";
  source_id: string;
  actor_id: string;
  title: string;
  preview: string;
  created_at: string;
  target: "connections" | "shared" | "classrooms" | "workspace";
  target_id: string | null;
  read_at: string | null;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase || !(await getCurrentSession())) throw new Error("Đăng nhập để xem thông báo.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || /schema cache|could not find the function/i.test(error.message))
      throw new Error("Cần chạy migration 0030 và 0031 trên Supabase để dùng thông báo.");
    throw new Error(error.message);
  }
  return data as T;
}

export const listActivityNotifications = () => rpc<ActivityNotification[]>("list_activity_notifications");
export const markActivityNotificationRead = (item: ActivityNotification) =>
  rpc<void>("mark_activity_notification_read", { p_kind: item.kind, p_source: item.source_id });
export const acceptLearningNotification = (id: string) =>
  rpc<{ kind: string; resourceId: string }>("accept_learning_invitation_by_id", { p_id: id });
export const respondConnectionNotification = (id: string, accept: boolean) =>
  rpc<void>("respond_connection_invitation_by_id", { p_id: id, p_action: accept ? "accepted" : "declined" });
