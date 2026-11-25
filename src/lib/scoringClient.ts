import { getCurrentUserIdToken } from './firebase';
import type {
  PublicQuestion,
  QuestionKey,
  QuestionOutcome,
  StudentAnswer,
} from '../types/psas';

async function getStaffScoringHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentUserIdToken();
  if (!token) {
    throw new Error('Sesi guru/admin belum aktif. Silakan masuk kembali.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface EvaluateScoringResponse {
  finalScore: number;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  needsManualReview: boolean;
  durationSeconds: number;
  questionOutcomes: Record<string, QuestionOutcome>;
}

export interface AnalyzeScoringResponse {
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  totalStudents: number;
  passRate: number;
  distribution: Array<{ label: string; count: number }>;
  lowSampleWarning?: {
    active: boolean;
    threshold: number;
    message: string;
  };
  questionStats: Array<{
    questionId: string;
    number: number;
    prompt: string;
    topic: string;
    indicator: string;
    correctPercent: number;
    wrongPercent: number;
    unansweredPercent: number;
    empiricalDifficulty?: 'Mudah' | 'Sedang' | 'Sulit' | 'Belum Cukup Data';
    needsReview?: boolean;
    reviewReason?: string;
    optionDistribution?: Array<{
      label: string;
      text: string;
      count: number;
      percent: number;
      isCorrectKey?: boolean;
    }>;
  }>;
  mostDifficultQuestions?: Array<{
    questionId: string;
    number: number;
    prompt: string;
    topic: string;
    correctPercent: number;
    wrongPercent: number;
  }>;
  reviewNeededQuestions?: Array<{
    questionId: string;
    number: number;
    prompt: string;
    reason: string;
    correctPercent: number;
    unansweredPercent: number;
  }>;
  topicAnalysis: Array<{ topic: string; masteryPercent: number }>;
  indicatorAnalysis: Array<{ indicator: string; masteryPercent: number }>;
}

export async function evaluateSessionOnServer(params: {
  questions: PublicQuestion[];
  keys: QuestionKey[];
  answers: StudentAnswer[];
  manualScores?: Record<string, number>;
  startedAt?: string;
  submittedAt?: string;
}): Promise<EvaluateScoringResponse> {
  const headers = await getStaffScoringHeaders();
  const response = await fetch('/api/scoring/evaluate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      questions: params.questions.map((q) => ({
        id: q.id,
        type: q.type,
        weight: q.weight,
        topic: q.topic,
        indicator: q.indicator,
        prompt: q.prompt,
      })),
      keys: params.keys,
      answers: params.answers.map((a) => ({
        questionId: a.questionId,
        answerValue: a.answerValue,
        isAnswered: a.isAnswered,
      })),
      manualScores: params.manualScores || {},
      startedAt: params.startedAt,
      submittedAt: params.submittedAt,
    }),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || 'Gagal menghitung skor di server.');
  }

  return response.json() as Promise<EvaluateScoringResponse>;
}

export async function analyzeResultsOnServer(params: {
  questions: PublicQuestion[];
  results: Array<{
    finalScore: number;
    questionOutcomes?: Record<string, QuestionOutcome>;
  }>;
  kkm: number;
}): Promise<AnalyzeScoringResponse> {
  const headers = await getStaffScoringHeaders();
  const response = await fetch('/api/scoring/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      questions: params.questions.map((q) => ({
        id: q.id,
        type: q.type,
        weight: q.weight,
        topic: q.topic,
        indicator: q.indicator,
        prompt: q.prompt,
      })),
      results: params.results,
      kkm: params.kkm,
    }),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || 'Gagal menganalisis hasil di server.');
  }

  return response.json() as Promise<AnalyzeScoringResponse>;
}
