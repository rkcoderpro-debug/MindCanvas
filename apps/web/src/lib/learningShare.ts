import { getCurrentSession, supabase } from "./supabase";
import { hashInvitationToken, normalizeInviteEmail } from "./collaboration";
import { validateLabHtml, type LabProject } from "./lab";

export type LearningKind = "quiz" | "flashcard" | "lab" | "document";
export type IncomingLearningShare = { kind: LearningKind; resource_id: string; owner_name: string; title: string; updated_at: string; status: "active" | "paused" | "removed" };
export type LearningCopySource = { kind: LearningKind; copy_id: string; source_id: string; source_title: string; owner_name: string; saved_at: string };
export type LearningInvite = { id: string; email: string; status: string; expires_at: string; recipient_id: string | null };
export type LearningMember = { user_id: string; created_at: string };
export type PublishedLabProject = {
  id: string;
  user_id: string;
  title: string;
  subject: LabProject["subject"];
  learner_level: string;
  program_html: string;
  allow_external_resources: boolean;
  created_at: string;
  updated_at: string;
  content_version?: number;
};
export type SharedQuizQuestion = { id: string; prompt: string; options: string[]; correctIndex?: number; explanation?: string };
export type SharedQuizSession = { id: string; questions: SharedQuizQuestion[]; version: number };
export type SharedQuizResult = { score: number; total: number; version: number; questions: Array<Required<Pick<SharedQuizQuestion, "id" | "prompt" | "options">> & { correctIndex: number; explanation?: string }> };
export type SharedQuizAnswerFeedback = { correctIndex: number; explanation?: string };
export type LearningShareErrorCode = "MIGRATION_MISSING" | "ACCESS_REVOKED" | "RESOURCE_REMOVED" | "ATTEMPT_NOT_FOUND" | "ATTEMPT_ALREADY_COMPLETED" | "INVALID_ANSWERS" | "NETWORK_ERROR" | "UNKNOWN";
export class LearningShareError extends Error {
  constructor(public code: LearningShareErrorCode, message: string, public postgresCode?: string) { super(message); this.name = "LearningShareError"; }
}


async function client() {
  const session = await getCurrentSession();
  if (!supabase || !session) throw new Error("Đăng nhập để dùng học liệu được chia sẻ.");
  return supabase;
}
function learningError(error: { message?: string; code?: string } | unknown): LearningShareError {
  const raw = typeof error === "object" && error !== null ? error as { message?: string; code?: string } : {};
  const message = String(raw.message ?? error ?? "Unknown learning share error");
  if ((raw.code === "42703" || raw.code === "PGRST204") && /allow_external_resources/i.test(message)) return new LearningShareError("MIGRATION_MISSING", "Chưa cài migration 0024_v5_13_0_lab_cdn_resources.sql trên Supabase. Hãy áp dụng migration sau 0023 rồi thử lại.", raw.code);
  if (raw.code === "PGRST202" || /schema cache|could not find the function/i.test(message)) return new LearningShareError("MIGRATION_MISSING", "Chưa cài migration 0023_v5_12_0_save_shared_learning.sql trên Supabase. Hãy áp dụng migration sau các migration hiện có rồi thử lại.", raw.code);
  if (/ACCESS_REVOKED|access revoked|sharing paused/i.test(message)) return new LearningShareError("ACCESS_REVOKED", "Quyền truy cập học liệu đã bị thu hồi hoặc tạm dừng.", raw.code);
  if (/RESOURCE_REMOVED|material removed/i.test(message)) return new LearningShareError("RESOURCE_REMOVED", "Học liệu gốc không còn tồn tại.", raw.code);
  if (/ATTEMPT_NOT_FOUND/i.test(message)) return new LearningShareError("ATTEMPT_NOT_FOUND", "Không tìm thấy lượt làm bài hiện tại.", raw.code);
  if (/ATTEMPT_ALREADY_COMPLETED/i.test(message)) return new LearningShareError("ATTEMPT_ALREADY_COMPLETED", "Lượt làm bài này đã được nộp trước đó.", raw.code);
  if (/INVALID_ANSWERS|Invalid answers/i.test(message)) return new LearningShareError("INVALID_ANSWERS", "Dữ liệu câu trả lời không hợp lệ.", raw.code);
  if (/failed to fetch|network|fetch/i.test(message)) return new LearningShareError("NETWORK_ERROR", "Không thể kết nối. Dữ liệu trên màn hình vẫn được giữ lại.", raw.code);
  return new LearningShareError("UNKNOWN", message, raw.code);
}
function checked<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw learningError(result.error);
  return result.data;
}
export function canShare(kind: LearningKind, plan?: string): boolean {
  return kind === "lab" || kind === "document" ? plan === "pro" || plan === "max" : plan === "plus" || plan === "pro" || plan === "max";
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
export async function listMyLearningCopySources(): Promise<LearningCopySource[]> {
  const c = await client();
  return checked(await c.rpc("list_my_learning_copy_sources")) as LearningCopySource[];
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
  if (!validateLabHtml(valid, { allowExternalResources: lab.allowExternalResources }).ok) throw new Error("HTML của Lab không đạt kiểm tra an toàn. Hãy kiểm tra nội dung trước khi chia sẻ.");
  const { data, error } = await c.from("lab_projects").upsert({ id: lab.id, user_id: owner, title: lab.title, subject: lab.subject, learner_level: lab.learnerLevel, program_html: valid, allow_external_resources: lab.allowExternalResources, updated_at: lab.updatedAt }, { onConflict: "id" }).select("id").single();
  if (error) {
    const mapped = learningError(error);
    if (mapped.code === "MIGRATION_MISSING") throw mapped;
    throw new Error(error.message);
  }
  return data;
}
export async function listPublishedLabs(owner: string) {
  const c = await client();
  return checked(await c.from("lab_projects").select("id,updated_at").eq("user_id", owner)) as Array<{ id: string; updated_at: string }>;
}
/** Read the complete private Lab payload for account recovery on another profile. */
export async function listPublishedLabProjects(owner: string): Promise<PublishedLabProject[]> {
  const c = await client();
  return checked(await c.from("lab_projects").select("id,user_id,title,subject,learner_level,program_html,allow_external_resources,created_at,updated_at,content_version").eq("user_id", owner).order("updated_at", { ascending: false })) as PublishedLabProject[];
}
export async function deletePublishedLab(id: string, owner: string) {
  const c = await client();
  checked(await c.from("lab_projects").delete().eq("id", id).eq("user_id", owner));
}

export async function getSharedContent(kind: LearningKind, id: string) {
  const c = await client();
  return checked(await c.rpc("get_learning_shared_content", { p_kind: kind, p_id: id })) as Record<string, unknown>;
}
export async function saveSharedLearningCopy(kind: LearningKind, id: string): Promise<{ copyId: string; alreadySaved: boolean }> {
  const c = await client();
  const existing = checked(await c.rpc("get_saved_learning_copy", { p_kind: kind, p_source_id: id })) as string | null;
  if (existing) return { copyId: existing, alreadySaved: true };
  if (kind !== "document") {
    const result = checked(await c.rpc("save_learning_copy", { p_kind: kind, p_id: id })) as string;
    return { copyId: result, alreadySaved: false };
  }

  const source = await getSharedContent("document", id);
  const sourcePath = String(source.file_path ?? "");
  const fileName = String(source.file_name ?? source.title ?? "");
  if (!sourcePath || !fileName) throw new Error("Không tìm thấy tệp tài liệu được chia sẻ.");
  const copyId = crypto.randomUUID();
  const extension = (sourcePath.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "bin").replace(/[^a-z0-9]/g, "");
  const userId = (await getCurrentSession())?.user.id;
  if (!userId) throw new Error("Đăng nhập để lưu tài liệu được chia sẻ.");
  const targetPath = `${userId}/${copyId}.${extension}`;
  const copied = await c.storage.from("documents").copy(sourcePath, targetPath);
  if (copied.error) throw learningError(copied.error);
  const finalize = async () => checked(await c.rpc("save_shared_document_copy", { p_source_id: id, p_copy_id: copyId })) as { copy_id: string; already_saved: boolean };
  const finish = async (result: { copy_id: string; already_saved: boolean }) => {
    if (result.copy_id !== copyId) await c.storage.from("documents").remove([targetPath]);
    return { copyId: result.copy_id, alreadySaved: Boolean(result.already_saved || result.copy_id !== copyId) };
  };
  const readMarker = async () => checked(await c.rpc("get_saved_learning_copy", { p_kind: kind, p_source_id: id })) as string | null;
  const isConfirmedDatabaseFailure = (error: unknown) => error instanceof LearningShareError
    && (error.code === "MIGRATION_MISSING" || !!error.postgresCode && /^[0-9A-Z]{5}$/.test(error.postgresCode));
  try {
    return await finish(await finalize());
  } catch (error) {
    // A network timeout can hide a committed RPC. The SQL function takes the
    // same advisory lock before checking access, so a retry waits for any
    // in-flight attempt and then returns its idempotent result.
    let committed: string | null;
    try { committed = await readMarker(); }
    catch { throw error; } // Keep the object if commit state cannot be verified.
    if (committed) return await finish({ copy_id: committed, already_saved: true });
    try { return await finish(await finalize()); }
    catch (retryError) {
      try {
        committed = await readMarker();
        if (committed) return await finish({ copy_id: committed, already_saved: true });
      } catch { throw error; } // An unverified object is safer than a broken saved row.
      if (isConfirmedDatabaseFailure(retryError)) await c.storage.from("documents").remove([targetPath]);
      throw retryError;
    }
  }
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
export async function startSharedQuiz(id: string): Promise<SharedQuizSession> {
  const c = await client();
  return checked(await c.rpc("start_learning_quiz", { p_id: id })) as SharedQuizSession;
}
export async function startSharedQuizImmediate(id: string): Promise<SharedQuizSession> {
  const c = await client();
  return checked(await c.rpc("start_learning_quiz_immediate", { p_id: id })) as SharedQuizSession;
}
export async function revealSharedQuizAnswer(attemptId: string, questionIndex: number, answer: number): Promise<SharedQuizAnswerFeedback> {
  const c = await client();
  return checked(await c.rpc("reveal_learning_quiz_answer", {
    p_attempt: attemptId, p_question_index: questionIndex, p_answer: answer,
  })) as SharedQuizAnswerFeedback;
}
export async function finishSharedQuiz(attemptId: string, answers: Array<number | null>): Promise<SharedQuizResult> {
  const c = await client();
  return checked(await c.rpc("finish_learning_quiz", { p_attempt: attemptId, p_answers: answers })) as SharedQuizResult;
}

export function sharedLearningErrorMessage(error: unknown, action: "open" | "start" | "submit" | "rate" = "open") {
  const resolved = error instanceof LearningShareError ? error : learningError(error);
  if (resolved.code === "NETWORK_ERROR") return resolved.message;
  if (resolved.code === "ACCESS_REVOKED") return action === "submit" ? "Không thể nộp bài vì quyền truy cập đã bị thu hồi hoặc tạm dừng." : resolved.message;
  if (resolved.code === "RESOURCE_REMOVED") return "Học liệu gốc đã bị xóa.";
  if (resolved.code === "ATTEMPT_NOT_FOUND") return "Không tìm thấy lượt làm bài. Câu trả lời hiện tại vẫn được giữ; hãy thử bắt đầu lượt mới nếu lỗi tiếp diễn.";
  if (resolved.code === "ATTEMPT_ALREADY_COMPLETED") return "Lượt làm này đã được nộp. Hãy mở lượt mới để làm lại.";
  if (resolved.code === "INVALID_ANSWERS") return "Không thể nộp vì dữ liệu câu trả lời không hợp lệ. Câu trả lời trên màn hình vẫn được giữ.";
  return resolved.message;
}
