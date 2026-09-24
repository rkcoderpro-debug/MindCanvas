import { useCallback, useEffect, useState } from "react";
import { createQuizTest, type QuizAttempt, type QuizQuestion, type QuizTest } from "../lib/quiz";
import { deleteQuizTest, fetchQuizAttempts, fetchQuizTests, recordQuizAttempt, upsertQuizTest } from "../lib/quizStore";
import { listMyLearningCopySources } from "../lib/learningShare";

export function useQuizzes(owner: string | null) {
  const [quizzes, setQuizzes] = useState<QuizTest[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"cloud" | "local">(owner ? "cloud" : "local");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tests, quizAttempts, savedSources] = await Promise.all([
        fetchQuizTests(owner), fetchQuizAttempts(owner),
        owner ? listMyLearningCopySources().catch(() => []) : Promise.resolve([]),
      ]);
      const sources = new Map(savedSources.filter(item => item.kind === "quiz").map(item => [item.copy_id, { title: item.source_title, ownerName: item.owner_name }]));
      setQuizzes(tests.items.map(item => ({ ...item, savedFrom: sources.get(item.id) })));
      setAttempts(quizAttempts.items);
      setSource(tests.source === "cloud" || quizAttempts.source === "cloud" ? "cloud" : "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quizzes.");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveQuiz = useCallback(async (quiz: QuizTest) => {
    setBusy(true); setError("");
    try {
      const result = await upsertQuizTest(owner, quiz);
      setQuizzes(items => [result.item, ...items.filter(item => item.id !== result.item.id)]);
      setSource(result.source);
      return result.item;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quiz.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const createQuiz = useCallback(async (input: { title: string; description?: string; questions: QuizQuestion[]; sourceDocumentId?: string | null }) => saveQuiz(createQuizTest(input)), [saveQuiz]);

  const removeQuiz = useCallback(async (quiz: QuizTest) => {
    setBusy(true); setError("");
    try {
      const result = await deleteQuizTest(owner, quiz);
      setQuizzes(items => items.filter(item => item.id !== quiz.id));
      setAttempts(items => items.filter(item => item.quizId !== quiz.id));
      setSource(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete quiz.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const saveAttempt = useCallback(async (attempt: QuizAttempt) => {
    const result = await recordQuizAttempt(owner, attempt);
    setAttempts(items => [result.item, ...items.filter(item => item.id !== result.item.id)]);
    setSource(result.source);
    return result.item;
  }, [owner]);

  return { quizzes, attempts, loading, busy, error, setError, source, refresh, saveQuiz, createQuiz, removeQuiz, saveAttempt };
}

export type QuizStore = ReturnType<typeof useQuizzes>;
