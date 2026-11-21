import { getCurrentSession, supabase } from "./supabase";
import { hashInvitationToken, normalizeInviteEmail } from "./collaboration";
import type { LearningKind } from "./learningShare";

export type Connection = { peer_id: string; display_name: string; unread_count: number; connected_at: string };
export type ConnectionInvitation = { id: string; sender_id: string; sender_name: string; recipient_email: string | null; token_hash: string; status: string; expires_at: string; outgoing: boolean };
export type BlockedConnection = { peer_id: string; display_name: string; blocked_at: string };
export type DirectMessage = { id: string; sender_id: string; recipient_id: string; body: string; resource_kind: LearningKind | null; resource_id: string | null; resource_title: string | null; created_at: string };

function client() {
  if (!supabase) throw new Error("Cần cấu hình cloud để dùng kết nối.");
  return supabase;
}
function checked<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    if (result.error.code === "PGRST202" || /schema cache|could not find the function/i.test(result.error.message))
      throw new Error("Chưa chạy migration 0026_v5_15_0_connections_messages.sql trên Supabase.");
    throw new Error(result.error.message);
  }
  return result.data;
}
export async function createConnectionInvitation(email: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  checked(await client().rpc("create_connection_invitation", { p_email: email.trim() ? normalizeInviteEmail(email) : null, p_hash: await hashInvitationToken(token) }));
  const link = new URL(window.location.href);
  link.search = "";
  link.searchParams.set("connection_invite", token);
  return link.toString();
}
export async function respondConnectionInvitation(tokenOrHash: string, action: "accepted" | "declined", alreadyHashed = false) {
  const hash = alreadyHashed ? tokenOrHash : await hashInvitationToken(tokenOrHash.trim());
  checked(await client().rpc("respond_connection_invitation", { p_hash: hash, p_action: action }));
}
export async function listConnections(): Promise<Connection[]> {
  return checked(await client().rpc("list_connections")) as Connection[];
}
export async function listConnectionInvitations(): Promise<ConnectionInvitation[]> {
  return checked(await client().rpc("list_connection_invitations")) as ConnectionInvitation[];
}
export async function cancelConnectionInvitation(id: string) {
  checked(await client().rpc("cancel_connection_invitation", { p_id: id }));
}
export async function listDirectMessages(peerId: string, before?: string): Promise<DirectMessage[]> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Hãy đăng nhập để xem tin nhắn.");
  const ownId = session.user.id;
  let query = client().from("direct_messages").select("id,sender_id,recipient_id,body,resource_kind,resource_id,resource_title,created_at")
    .or(`and(sender_id.eq.${ownId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${ownId})`)
    .order("created_at", { ascending: false }).limit(50);
  if (before) query = query.lt("created_at", before);
  return checked(await query) as DirectMessage[];
}
export async function sendDirectMessage(peerId: string, body: string, kind?: LearningKind, resourceId?: string) {
  if (!body.trim() && !resourceId) throw new Error("Nhập tin nhắn hoặc chọn học liệu để gửi.");
  checked(await client().rpc("send_direct_message", { p_peer: peerId, p_body: body.trim(), p_kind: kind ?? null, p_resource_id: resourceId ?? null }));
}
export async function markDirectMessagesRead(peerId: string) {
  checked(await client().rpc("mark_direct_messages_read", { p_peer: peerId }));
}
export async function removeConnection(peerId: string) {
  checked(await client().rpc("remove_connection", { p_peer: peerId }));
}
export async function blockConnection(peerId: string) {
  checked(await client().rpc("block_connection", { p_peer: peerId }));
}
export async function listBlockedConnections(): Promise<BlockedConnection[]> {
  return checked(await client().rpc("list_blocked_connections")) as BlockedConnection[];
}
export async function unblockConnection(peerId: string) {
  checked(await client().rpc("unblock_connection", { p_peer: peerId }));
}
export async function reportConnection(peerId: string, reason: string) {
  checked(await client().rpc("report_connection", { p_peer: peerId, p_reason: reason }));
}
