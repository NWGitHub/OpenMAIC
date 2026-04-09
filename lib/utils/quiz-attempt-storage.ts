import { createLogger } from '@/lib/logger';
import { db } from '@/lib/utils/database';

const log = createLogger('QuizAttemptStorage');

export interface StoredQuestionResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
}

export interface SaveQuizAttemptInput {
  stageId: string;
  sceneId: string;
  studentId: string;
  studentName: string;
  score: number;
  total: number;
  answers: Record<string, string | string[]>;
  results: StoredQuestionResult[];
}

export interface QuizAttemptItem {
  id: number;
  stageId: string;
  sceneId: string;
  studentId: string;
  studentName: string;
  score: number;
  total: number;
  answeredCount: number;
  questionCount: number;
  answers: Record<string, string | string[]>;
  results: StoredQuestionResult[];
  createdAt: number;
}

export async function saveQuizAttempt(input: SaveQuizAttemptInput): Promise<number> {
  try {
    const id = await db.quizAttempts.add({
      ...input,
      answeredCount: Object.values(input.answers).filter((v) => {
        if (Array.isArray(v)) return v.length > 0;
        return String(v).trim().length > 0;
      }).length,
      questionCount: input.results.length,
      resultsJson: JSON.stringify(input.results),
      createdAt: Date.now(),
    });

    return id as number;
  } catch (error) {
    log.error('Failed to save quiz attempt:', error);
    throw error;
  }
}

export async function listQuizAttemptsForScene(
  stageId: string,
  sceneId: string,
): Promise<QuizAttemptItem[]> {
  try {
    const records = await db.quizAttempts.where('sceneId').equals(sceneId).reverse().toArray();

    return records
      .filter((r) => r.stageId === stageId)
      .map((r) => ({
        id: r.id || 0,
        stageId: r.stageId,
        sceneId: r.sceneId,
        studentId: r.studentId,
        studentName: r.studentName,
        score: r.score,
        total: r.total,
        answeredCount: r.answeredCount,
        questionCount: r.questionCount,
        answers: r.answers,
        results: parseResults(r.resultsJson),
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    log.error('Failed to list quiz attempts:', error);
    return [];
  }
}

function parseResults(raw: string): StoredQuestionResult[] {
  try {
    const parsed = JSON.parse(raw) as StoredQuestionResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
