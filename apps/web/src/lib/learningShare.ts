import { getCurrentSession, supabase } from "./supabase";
import { hashInvitationToken, normalizeInviteEmail } from "./collaboration";
import { validateLabHtml, type LabProject } from "./lab";

export type LearningKind = "quiz" | "flashcard" | "lab";
export type IncomingLearningShare = { kind: LearningKind; resource_id: string; owner_name: string; title: string; updated_at: string; status: "active" | "paused" | "removed" };
export type LearningInvite = { id: string; email: string; status: string; expires_at: string; recipient_id: string | null };
export type LearningMember = { user_id: string; created_at: string };

async function client() {
  const session = await getCurrentSession();
  if (!supabase || !session) throw new Error("Đăng nhập để dùng học liệu được chia sẻ.");
  return supabase;
}
function checked<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(result.error.code === "PGRST202" ? "Chưa cài migration 0018_v4_9_learning_shares.sql trên Supabase." : result.error.message);
  return result.data;
}
export function canShare(kind: LearningKind, plan?: string): boolean {
  return kind === "lab" ? plan === "pro" || plan === "max" : plan === "plus" || plan === "pro" || plan === "max";
}

export async function inviteLearning(kind: LearningKind, id: string, email: string, days: number) {
  const c = await client();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const hash = await hashInvitationToken(token);
  checked(await c.rpc("create_learning_invitation", { p_kind: kind, p_id: id, p_email: normalizeInviteEmail(email), p_hash: hash, p_days: days }));
  const link = new URL(window.location.href);
  link.search = "";
  link.searchParams.set("learning_invite", token);
  return link.toString();
}
export async function acceptLearning(token: string) {
  const c = await client();
  return checked(await c.rpc("accept_learning_invitation", { p_hash: await hashInvitationToken(token) })) as { kind: LearningKind; resourceId: string };
}
export async function listLearningShares(): Promise<IncomingLearningShare[]> {
  const c = await client();
  return checked(await c.rpc("list_learning_shares")) as IncomingLearningShare[];
}
export async function listPendingLearningInvites() {
  const c = await client();
  const session = await getCurrentSession();
  const result = await c.from("learning_share_invitations").select("id,kind,token_hash,expires_at").eq("status", "pending").eq("email", session?.user.email?.toLowerCase() ?? "");
  return checked(result) as Array<{ id: string; kind: LearningKind; token_hash: string; expires_at: string }>;
}
export async function acceptPendingLearningInvite(hash: string) {
  const c = await client(); checked(await c.rpc("accept_learning_invitation", { p_hash: hash }));
}
export async function listLearningInvites(kind: LearningKind, id: string) {
  const c = await client();
  const [invites, members] = await Promise.all([
    c.from("learning_share_invitations").select("id,email,status,expires_at,recipient_id").eq("kind", kind).eq("resource_id", id).order("created_at", { ascending: false }),
    c.from("learning_share_members").select("user_id,created_at").eq("kind", kind).eq("resource_id", id),
  ]);
  return { invites: checked(invites) as LearningInvite[], members: checked(members) as LearningMember[] };
}
export async function revokeLearning(invitationId: string) {
  const c = await client(); checked(await c.rpc("revoke_learning_share", { p_invitation: invitationId }));
}
export async function removeLearningMember(kind: LearningKind, id: string, recipient: string) {
  const c = await client(); checked(await c.rpc("revoke_learning_share", { p_kind: kind, p_id: id, p_recipient: recipient }));
}

/** Deliberate cloud publish. Local data survives any network failure. Only display fields leave this device. */
export async function publishLab(lab: LabProject, owner: string) {
  const c = await client();
  const valid = lab.programHtml.trim();
  if (!valid) throw new Error("Lab cần HTML mô phỏng trước khi đưa lên cloud.");
  if (!validateLabHtml(valid).ok) throw new Error("HTML của Lab không đạt kiểm tra an toàn. Hãy kiểm tra nội dung trước khi chia sẻ.");
  const { data, error } = await c.from("lab_projects").upsert({ id: lab.id, user_id: owner, title: lab.title, subject: lab.subject, learner_level: lab.learnerLevel, program_html: valid, updated_at: lab.updatedAt }, { onConflict: "id" }).select("id").single();
  if (error) throw new Error(error.message);
  return data;
}
export async function listPublishedLabs(owner: string) {
  const c = await client();
  return checked(await c.from("lab_projects").select("id,updated_at").eq("user_id", owner)) as Array<{ id: string; updated_at: string }>;
}
export async function deletePublishedLab(id: string, owner: string) {
  const c = await client();
  checked(await c.from("lab_projects").delete().eq("id", id).eq("user_id", owner));
}

export async function getSharedContent(kind: LearningKind, id: string) {
  const c = await client();
  const table = kind === "quiz" ? "quiz_tests" : kind === "lab" ? "lab_projects" : "flashcard_decks";
  const result = await c.from(table).select("*").eq("id", id).single();
  return checked(result) as Record<string, unknown>;
}
export async function getSharedCards(id: string) {
  const c = await client();
  const cards = checked(await c.from("flashcards").select("id,front,back,content_version").eq("deck_id", id).order("created_at")) as Array<{ id: string; front: string; back: string; content_version: number }>;
  if (!cards.length) return { cards, progress: [] };
  const progress = checked(await c.from("learning_card_progress").select("card_id,content_version,rating,reviewed_count,due_at").in("card_id", cards.map(card => card.id))) as Array<{ card_id: string; content_version: number; rating: string; reviewed_count: number; due_at: string }>;
  return { cards, progress };
}
export async function rateSharedCard(id: string, rating: "again" | "hard" | "good" | "easy") {
  const c = await client(); checked(await c.rpc("rate_learning_card", { p_card: id, p_rating: rating }));
}
export async function startSharedQuiz(id: string) {
  const c = await client();
  return checked(await c.rpc("start_learning_quiz", { p_id: id })) as { id: string; questions: Array<{ id: string; prompt: string; options: string[]; correctIndex: number; explanation: string }>; version: number };
}
export async function finishSharedQuiz(attemptId: string, answers: Array<number | null>) {
  const c = await client();
  return checked(await c.rpc("finish_learning_quiz", { p_attempt: attemptId, p_answers: answers })) as number;
}
