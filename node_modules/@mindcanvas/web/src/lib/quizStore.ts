import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";
import { createQuizTest, parseQuizResult, type QuizAttempt, type QuizMode, type QuizQuestion, type QuizTest } from "./quiz";

type RepositoryResult<T> = { items: T[]; source: "cloud" | "local" };
type ItemResult<T> = { item: T; source: "cloud" | "local" };

const testsKey = (owner: string | null) => `mindcanvas:learning-hub:v1:quizzes:${owner ?? "guest"}`;
const attemptsKey = (owner: string | null) => `mindcanvas:learning-hub:v1:quiz-attempts:${owner ?? "guest"}`;

function readList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: T[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* memory is not required for this small cache */ }
}

function questionsFrom(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  try {
    return parseQuizResult({ title: "Imported quiz", description: "", questions: value }, 100).questions;
  } catch {
    // A malformed question must invalidate the imported quiz instead of being
    // silently replaced or removed from the learner's test.
    return [];
  }
}

function quizFromRow(row: any, source: "cloud" | "local"): QuizTest | null {
  if (!row || typeof row.id !== "string" || typeof row.title !== "string") return null;
  const questions = questionsFrom(row.questions);
  if (!questions.length) return null;
  return { id: row.id, title: row.title, description: typeof row.description === "string" ? row.description : "", questions, sourceDocumentId: typeof row.source_document_id === "string" ? row.source_document_id : typeof row.sourceDocumentId === "string" ? row.sourceDocumentId : null, createdAt: typeof row.created_at === "string" ? row.created_at : typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(), updatedAt: typeof row.updated_at === "string" ? row.updated_at : typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(), source };
}

function attemptFromRow(row: any, source: "cloud" | "local"): QuizAttempt | null {
  if (!row || typeof row.id !== "string" || typeof row.quiz_id !== "string") return null;
  const score = Number(row.score), total = Number(row.total);
  if (!Number.isInteger(score) || !Number.isInteger(total)) return null;
  const mode: QuizMode = row.mode === "practice" || row.mode === "exam" || row.mode === "review" ? row.mode : "learn";
  const questionIds = Array.isArray(row.question_ids) ? row.question_ids.filter((value: unknown): value is string => typeof value === "string") : undefined;
  return { id: row.id, quizId: row.quiz_id, score: Math.max(0, score), total: Math.max(0, total), answers: Array.isArray(row.answers) ? row.answers.map((value: unknown) => Number.isInteger(value) ? value as number : null) : [], durationSeconds: Number.isInteger(row.duration_seconds) ? Math.max(0, row.duration_seconds) : 0, completedAt: typeof row.completed_at === "string" ? row.completed_at : new Date().toISOString(), mode, questionIds, source };
}

async function clientFor(owner: string) {
  const session = await getCurrentSession();
  if (!supabase || !session || session.user.id !== owner) throw new Error("Session changed. Please sign in again.");
  return supabase;
}

function localTests(owner: string | null) {
  return readList<QuizTest>(testsKey(owner)).map(item => quizFromRow(item, "local")).filter((item): item is QuizTest => !!item);
}

function localAttempts(owner: string | null) {
  return readList<QuizAttempt>(attemptsKey(owner)).filter(item => item && typeof item.id === "string" && typeof item.quizId === "string");
}

function cacheTest(owner: string | null, item: QuizTest) {
  writeList(testsKey(owner), [item, ...localTests(owner).filter(existing => existing.id !== item.id)].slice(0, 100));
}

function cacheAttempt(owner: string | null, item: QuizAttempt) {
  writeList(attemptsKey(owner), [item, ...localAttempts(owner).filter(existing => existing.id !== item.id)].slice(0, 500));
}

export async function fetchQuizTests(owner: string | null): Promise<RepositoryResult<QuizTest>> {
  if (!owner) return { items: localTests(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("quiz_tests").select("id,title,description,questions,source_document_id,created_at,updated_at").eq("user_id", owner).order("updated_at", { ascending: false }).limit(100).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => quizFromRow(row, "cloud")).filter((item): item is QuizTest => !!item);
    writeList(testsKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localTests(owner), source: "local" };
  }
}

export async function upsertQuizTest(owner: string | null, quiz: QuizTest): Promise<ItemResult<QuizTest>> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const row = { id: quiz.id, user_id: owner, title: quiz.title, description: quiz.description, questions: quiz.questions, source_document_id: quiz.sourceDocumentId, created_at: quiz.createdAt, updated_at: quiz.updatedAt };
      const { error } = await client.from("quiz_tests").upsert(row).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      const saved = { ...quiz, source: "cloud" as const };
      cacheTest(owner, saved);
      return { item: saved, source: "cloud" };
    } catch { /* V4.3 migration may not be live yet. */ }
  }
  const saved = { ...quiz, source: "local" as const };
  cacheTest(owner, saved);
  return { item: saved, source: "local" };
}

export async function deleteQuizTest(owner: string | null, quiz: QuizTest) {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("quiz_tests").delete().eq("user_id", owner).eq("id", quiz.id).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      writeList(testsKey(owner), localTests(owner).filter(item => item.id !== quiz.id));
      return "cloud" as const;
    } catch { /* use the local cache until cloud is available */ }
  }
  writeList(testsKey(owner), localTests(owner).filter(item => item.id !== quiz.id));
  return "local" as const;
}

export async function fetchQuizAttempts(owner: string | null): Promise<RepositoryResult<QuizAttempt>> {
  if (!owner) return { items: localAttempts(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("quiz_attempts").select("id,quiz_id,score,total,answers,mode,question_ids,duration_seconds,completed_at").eq("user_id", owner).order("completed_at", { ascending: false }).limit(500).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => attemptFromRow(row, "cloud")).filter((item): item is QuizAttempt => !!item);
    writeList(attemptsKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localAttempts(owner), source: "local" };
  }
}

export async function recordQuizAttempt(owner: string | null, attempt: QuizAttempt): Promise<ItemResult<QuizAttempt>> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("quiz_attempts").upsert({ id: attempt.id, user_id: owner, quiz_id: attempt.quizId, score: attempt.score, total: attempt.total, answers: attempt.answers, mode: attempt.mode ?? "learn", question_ids: attempt.questionIds ?? [], duration_seconds: attempt.durationSeconds, completed_at: attempt.completedAt }).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      const saved = { ...attempt, source: "cloud" as const };
      cacheAttempt(owner, saved);
      return { item: saved, source: "cloud" };
    } catch { /* preserve the result offline */ }
  }
  const saved = { ...attempt, source: "local" as const };
  cacheAttempt(owner, saved);
  return { item: saved, source: "local" };
}

export { createQuizTest };
