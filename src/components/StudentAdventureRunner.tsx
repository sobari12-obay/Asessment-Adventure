import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Flag,
  Grid,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { getExplorerCharacter } from '../data/characters';
import { DEFAULT_COMPLETION_MESSAGE, getWorldConfig } from '../data/worlds';
import { audioEngine } from '../lib/audioEngine';
import {
  ApiClientError,
  autosaveStudentAnswer,
  fetchStudentExamStatus,
  recordAdventureExamCompletedHook,
  submitStudentExam,
  toggleStudentQuestionFlag,
  type StudentSessionPayloadResponse,
  type StudentSubmissionSummary,
} from '../services/apiClient';
import {
  clearLocalActiveSession,
  flushPendingOfflineAnswers,
  getStudentVisibleResult,
  recordCompletedWorldLocally,
  saveLocalSessionSnapshot,
  saveStudentAnswerWithAutosave,
  updateStudentSessionProgress,
} from '../services/firestoreService';
import { QuestionRenderer } from './QuestionRenderer';
import { JourneyTrailBar } from './WorldVisuals';
import { AdventureCelebrationOverlay } from './adventure/AdventureCelebrationOverlay';
import type {
  AccessibilityPreferences,
  AdventureCelebrationDelta,
  AssessmentResult,
  AssessmentSession,
  PublicAssessment,
  PublicQuestion,
  SaveSyncStatus,
} from '../types/psas';

interface StudentAdventureRunnerProps {
  assessment: PublicAssessment;
  questions: PublicQuestion[];
  initialSession: AssessmentSession;
  initialAnswers: Record<string, string>;
  initialFlaggedIds?: string[];
  serverNowAt?: string;
  examMeta?: StudentSessionPayloadResponse['exam'];
  studentToken?: string | null;
  prefs: AccessibilityPreferences;
  onSessionCompleted?: () => void;
  onExitToMap: () => void;
}

const OFFLINE_QUEUE_PREFIX = 'psas_offline_queue_';

function readKeyFreeOfflineQueue(sessionId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(`${OFFLINE_QUEUE_PREFIX}${sessionId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

function writeKeyFreeOfflineQueue(sessionId: string, queue: Record<string, string>): void {
  try {
    const keys = Object.keys(queue);
    if (keys.length === 0) {
      window.localStorage.removeItem(`${OFFLINE_QUEUE_PREFIX}${sessionId}`);
    } else {
      window.localStorage.setItem(`${OFFLINE_QUEUE_PREFIX}${sessionId}`, JSON.stringify(queue));
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function formatRemainingClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

export const StudentAdventureRunner: React.FC<StudentAdventureRunnerProps> = ({
  assessment,
  questions,
  initialSession,
  initialAnswers,
  initialFlaggedIds,
  serverNowAt,
  examMeta,
  studentToken,
  prefs,
  onSessionCompleted,
  onExitToMap,
}) => {
  const world = getWorldConfig(assessment.subjectId);
  const explorer = getExplorerCharacter(initialSession.characterId);

  const navigationMode = examMeta?.navigationMode || assessment.navigationMode || 'free';
  const allowBack = examMeta?.allowBack ?? assessment.allowBack ?? true;
  const allowEditAfterAnswer =
    examMeta?.allowEditAfterAnswer ?? assessment.allowEditAfterAnswer ?? true;
  const requireAnswerBeforeNext =
    examMeta?.requireAnswerBeforeNext ?? assessment.requireAnswerBeforeNext ?? false;
  const audioEnabled = examMeta?.audioEnabled ?? assessment.audioEnabled ?? true;
  const effectiveMode = examMeta?.mode || assessment.mode;

  const orderedQuestions = useMemo(() => {
    const map = new Map<string, PublicQuestion>();
    for (const q of questions) map.set(q.id, q);
    const ordered = initialSession.questionOrder
      .map((id) => map.get(id))
      .filter((q): q is PublicQuestion => Boolean(q));
    return ordered.length > 0 ? ordered : questions;
  }, [questions, initialSession.questionOrder]);

  const [session, setSession] = useState<AssessmentSession>(initialSession);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>(() => ({
    ...initialAnswers,
    ...readKeyFreeOfflineQueue(initialSession.id),
  }));
  const [flaggedIds, setFlaggedIds] = useState<string[]>(
    initialFlaggedIds || initialSession.flaggedIds || []
  );
  const [currentIndex, setCurrentIndex] = useState<number>(
    Math.min(initialSession.currentIndex || 0, Math.max(0, orderedQuestions.length - 1))
  );
  const [syncStatus, setSyncStatus] = useState<SaveSyncStatus>('saved');
  const [syncErrorDetail, setSyncErrorDetail] = useState('');
  const [showNavigator, setShowNavigator] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [checkpointCelebration, setCheckpointCelebration] = useState<{
    checkpointNum: number;
    artifact: string;
  } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialSession.status !== 'in_progress');
  const [submissionSummary, setSubmissionSummary] = useState<StudentSubmissionSummary | null>(null);
  const [legacyVisibleResult, setLegacyVisibleResult] = useState<AssessmentResult | null>(null);
  const [fallbackCelebration, setFallbackCelebration] =
    useState<AdventureCelebrationDelta | null>(null);
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);
  const [navWarning, setNavWarning] = useState('');

  // Server-authoritative timer refs & state
  const clockOffsetMsRef = useRef<number>(
    serverNowAt && Number.isFinite(Date.parse(serverNowAt))
      ? Date.parse(serverNowAt) - Date.now()
      : initialSession.serverNowAt && Number.isFinite(Date.parse(initialSession.serverNowAt))
        ? Date.parse(initialSession.serverNowAt) - Date.now()
        : 0
  );
  const deadlineMsRef = useRef<number>(
    initialSession.deadlineAt && Number.isFinite(Date.parse(initialSession.deadlineAt))
      ? Date.parse(initialSession.deadlineAt)
      : Date.parse(initialSession.startedAt || new Date().toISOString()) +
        (examMeta?.durationMinutes || assessment.durationMinutes || 30) * 60_000
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    Math.max(
      0,
      Math.floor((deadlineMsRef.current - (Date.now() + clockOffsetMsRef.current)) / 1000)
    )
  );

  const debounceTimersRef = useRef<Record<string, number>>({});
  const pendingQueueRef = useRef<Record<string, string>>(readKeyFreeOfflineQueue(initialSession.id));
  const autoSubmitTriggeredRef = useRef(false);
  const isCompletedRef = useRef(isCompleted);
  isCompletedRef.current = isCompleted;

  const currentQuestion = orderedQuestions[currentIndex];
  const checkpointInterval = Math.max(1, assessment.checkpointInterval || 3);

  const answeredCount = useMemo(
    () => orderedQuestions.filter((q) => (answersMap[q.id] || '').trim() !== '').length,
    [orderedQuestions, answersMap]
  );
  const unansweredCount = Math.max(0, orderedQuestions.length - answeredCount);

  const flushOfflineQueueToServer = useCallback(async (): Promise<boolean> => {
    const queue = { ...pendingQueueRef.current };
    const qIds = Object.keys(queue);
    if (qIds.length === 0) return true;

    if (!navigator.onLine) {
      setSyncStatus('offline_queued');
      return false;
    }

    if (!studentToken) {
      const synced = await flushPendingOfflineAnswers(session.id);
      if (synced > 0) {
        pendingQueueRef.current = {};
        writeKeyFreeOfflineQueue(session.id, {});
        setSyncStatus('saved');
      }
      return true;
    }

    setSyncStatus('saving');
    setSyncErrorDetail('');
    for (const qId of qIds) {
      try {
        const res = await autosaveStudentAnswer(studentToken, session.id, {
          questionId: qId,
          answerValue: queue[qId],
          currentIndex,
        });
        if (res.ok) {
          delete pendingQueueRef.current[qId];
          writeKeyFreeOfflineQueue(session.id, pendingQueueRef.current);
          clockOffsetMsRef.current = Date.parse(res.serverNowAt) - Date.now();
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) {
          setSyncErrorDetail(err.message);
          setSyncStatus('error');
          return false;
        }
        setSyncStatus('offline_queued');
        return false;
      }
    }

    if (Object.keys(pendingQueueRef.current).length === 0) {
      setSyncStatus('saved');
    }
    return true;
  }, [studentToken, session.id, currentIndex]);

  // Listen for network restoration to flush queued answers
  useEffect(() => {
    const handleOnline = () => {
      void flushOfflineQueueToServer();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushOfflineQueueToServer]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      Object.values(timers).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleFinishAdventure = useCallback(
    async (autoSubmittedByTimeout = false) => {
      if (isCompleting || isCompletedRef.current) return;

      if (
        !autoSubmittedByTimeout &&
        requireAnswerBeforeNext &&
        currentQuestion &&
        (answersMap[currentQuestion.id] || '').trim() === ''
      ) {
        setShowSubmitConfirm(false);
        setNavWarning('Isi jawaban pada pos terakhir ini sebelum menyelesaikan petualangan ya!');
        return;
      }

      setShowSubmitConfirm(false);
      setIsCompleting(true);

      // Clear all debounce timers and gather unsaved answers
      Object.values(debounceTimersRef.current).forEach((id) => window.clearTimeout(id));
      debounceTimersRef.current = {};

      const pendingEntries = Object.entries(pendingQueueRef.current).map(
        ([questionId, answerValue]) => ({
          questionId,
          answerValue,
        })
      );

      try {
        if (studentToken) {
          const submitRes = await submitStudentExam(studentToken, session.id, {
            pendingAnswers: pendingEntries,
            autoSubmittedByTimeout,
          });
          pendingQueueRef.current = {};
          writeKeyFreeOfflineQueue(session.id, {});
          clearLocalActiveSession(session.id);

          if (submitRes.result) {
            setSubmissionSummary(submitRes.result);
          }

          recordCompletedWorldLocally({
            subjectId: assessment.subjectId,
            assessmentId: assessment.id,
            sessionId: session.id,
            artifactName: world.artifactName,
            badgeTitle: world.badgeTitle,
            starsEarned: Math.max(3, answeredCount + 3),
            completedAt: new Date().toISOString(),
          });

          audioEngine.playComplete();
          setIsCompleted(true);
          onSessionCompleted?.();
          return;
        }

        // Legacy Firestore fallback when operating without Stage 3 student token
        const submittedAt = new Date().toISOString();
        await flushPendingOfflineAnswers(session.id);
        await updateStudentSessionProgress({
          sessionId: session.id,
          currentIndex,
          answeredIds: orderedQuestions
            .filter((q) => (answersMap[q.id] || '').trim() !== '')
            .map((q) => q.id),
          progressPercent: Math.round((answeredCount / Math.max(1, orderedQuestions.length)) * 100),
          checkpointsUnlocked: Math.floor(answeredCount / checkpointInterval),
          artifactsEarned: session.artifactsEarned,
          starsEarned: Math.max(3, answeredCount + 3),
          status: 'submitted',
          submittedAt,
        });

        clearLocalActiveSession(session.id);
        recordCompletedWorldLocally({
          subjectId: assessment.subjectId,
          assessmentId: assessment.id,
          sessionId: session.id,
          artifactName: world.artifactName,
          badgeTitle: world.badgeTitle,
          starsEarned: Math.max(3, answeredCount + 3),
          completedAt: submittedAt,
        });

        audioEngine.playComplete();
        setIsCompleted(true);
        onSessionCompleted?.();
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'SESSION_ALREADY_SUBMITTED') {
          try {
            if (studentToken) {
              const st = await fetchStudentExamStatus(studentToken, session.id);
              if (st.submissionSummary) setSubmissionSummary(st.submissionSummary);
            }
          } catch {
            // ignore
          }
          clearLocalActiveSession(session.id);
          setIsCompleted(true);
          onSessionCompleted?.();
        } else {
          setNavWarning(
            err instanceof Error
              ? err.message
              : 'Koneksi sempat terganggu saat mengirim. Jawabanmu aman, silakan coba kirim ulang.'
          );
          autoSubmitTriggeredRef.current = false;
        }
      } finally {
        setIsCompleting(false);
      }
    },
    [
      isCompleting,
      requireAnswerBeforeNext,
      currentQuestion,
      answersMap,
      studentToken,
      session.id,
      session.artifactsEarned,
      assessment.subjectId,
      assessment.id,
      world.artifactName,
      world.badgeTitle,
      answeredCount,
      currentIndex,
      orderedQuestions,
      checkpointInterval,
      onSessionCompleted,
    ]
  );

  // Server-authoritative countdown ticker (1s) + auto-submit when remaining reaches 0
  useEffect(() => {
    if (isCompleted) return;
    const tick = () => {
      const rem = Math.max(
        0,
        Math.floor((deadlineMsRef.current - (Date.now() + clockOffsetMsRef.current)) / 1000)
      );
      setRemainingSeconds(rem);
      if (rem === 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        void handleFinishAdventure(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isCompleted, handleFinishAdventure]);

  // Poll server session status every ~15 seconds for clock sync & timeout enforcement
  useEffect(() => {
    if (isCompleted || !studentToken) return;
    const poll = async () => {
      try {
        const st = await fetchStudentExamStatus(studentToken, session.id);
        if (st.serverNowAt && Number.isFinite(Date.parse(st.serverNowAt))) {
          clockOffsetMsRef.current = Date.parse(st.serverNowAt) - Date.now();
        }
        if (st.deadlineAt && Number.isFinite(Date.parse(st.deadlineAt))) {
          deadlineMsRef.current = Date.parse(st.deadlineAt);
        }
        if (st.status !== 'in_progress' || st.autoSubmittedByTimeout) {
          pendingQueueRef.current = {};
          writeKeyFreeOfflineQueue(session.id, {});
          clearLocalActiveSession(session.id);
          if (st.submissionSummary) {
            setSubmissionSummary(st.submissionSummary);
          }
          setIsCompleted(true);
          onSessionCompleted?.();
        }
      } catch {
        // Non-blocking poll
      }
    };
    const id = window.setInterval(() => void poll(), 15_000);
    return () => window.clearInterval(id);
  }, [isCompleted, studentToken, session.id, onSessionCompleted]);

  // Legacy Firestore visible result & celebration hook fallback when no submissionSummary came from server
  useEffect(() => {
    if (!isCompleted || submissionSummary) return;
    if (assessment.showScoreToStudent) {
      void getStudentVisibleResult(session.id).then((res) => {
        if (res) setLegacyVisibleResult(res);
      });
    }
    if (studentToken) {
      void recordAdventureExamCompletedHook(studentToken, {
        sessionId: session.id,
        assessmentId: assessment.id,
        worldId: assessment.subjectId,
      })
        .then((res) => {
          if (res.celebration) setFallbackCelebration(res.celebration);
        })
        .catch(() => {});
    }
  }, [
    isCompleted,
    submissionSummary,
    assessment.showScoreToStudent,
    assessment.id,
    assessment.subjectId,
    session.id,
    studentToken,
  ]);

  async function handleToggleFlag() {
    if (!currentQuestion || isCompleted) return;
    const nextFlagged = !flaggedIds.includes(currentQuestion.id);
    const updatedFlags = nextFlagged
      ? [...flaggedIds, currentQuestion.id]
      : flaggedIds.filter((id) => id !== currentQuestion.id);

    setFlaggedIds(updatedFlags);
    const nextSession = { ...session, flaggedIds: updatedFlags };
    setSession(nextSession);
    saveLocalSessionSnapshot(nextSession, answersMap);

    if (studentToken) {
      try {
        const res = await toggleStudentQuestionFlag(
          studentToken,
          session.id,
          currentQuestion.id,
          nextFlagged
        );
        if (Array.isArray(res.flaggedIds)) {
          setFlaggedIds(res.flaggedIds);
        }
      } catch {
        // Keep optimistic flag state when offline
      }
    }
  }

  async function persistProgressIndex(nextIndex: number, nextAnswers: Record<string, string>) {
    const answeredIds = orderedQuestions
      .filter((q) => (nextAnswers[q.id] || '').trim() !== '')
      .map((q) => q.id);

    const total = orderedQuestions.length || 1;
    const progressPercent = Math.round((answeredIds.length / total) * 100);
    const checkpointsUnlocked = Math.floor(answeredIds.length / checkpointInterval);
    const artifactsEarned =
      checkpointsUnlocked > 0 ? [world.artifactName] : session.artifactsEarned;
    const starsEarned = Math.max(1, answeredIds.length + checkpointsUnlocked * 2);

    const updatedSession: AssessmentSession = {
      ...session,
      currentIndex: nextIndex,
      answeredIds,
      flaggedIds,
      progressPercent,
      checkpointsUnlocked,
      artifactsEarned,
      starsEarned,
    };

    setSession(updatedSession);
    saveLocalSessionSnapshot(updatedSession, nextAnswers);

    if (!studentToken) {
      await updateStudentSessionProgress({
        sessionId: session.id,
        currentIndex: nextIndex,
        answeredIds,
        progressPercent,
        checkpointsUnlocked,
        artifactsEarned,
        starsEarned,
      });
    }
  }

  function handleAnswerChange(nextValue: string) {
    if (!currentQuestion || isCompleted) return;
    const qId = currentQuestion.id;
    const qPrompt = currentQuestion.prompt;
    const qWeight = currentQuestion.weight;
    const isTextHeavy = currentQuestion.type === 'short_answer' || currentQuestion.type === 'essay';

    setNavWarning('');
    setSyncErrorDetail('');

    const nextAnswers = { ...answersMap, [qId]: nextValue };
    setAnswersMap(nextAnswers);

    // Key-free offline persistence
    pendingQueueRef.current[qId] = nextValue;
    writeKeyFreeOfflineQueue(session.id, pendingQueueRef.current);

    const answeredIds = orderedQuestions
      .filter((q) => (nextAnswers[q.id] || '').trim() !== '')
      .map((q) => q.id);
    const total = orderedQuestions.length || 1;
    const checkpointsUnlocked = Math.floor(answeredIds.length / checkpointInterval);
    const starsEarned = Math.max(1, answeredIds.length + checkpointsUnlocked * 2);

    const nextSession: AssessmentSession = {
      ...session,
      answeredIds,
      flaggedIds,
      progressPercent: Math.round((answeredIds.length / total) * 100),
      checkpointsUnlocked,
      starsEarned,
    };
    setSession(nextSession);
    saveLocalSessionSnapshot(nextSession, nextAnswers);

    if (!navigator.onLine) {
      setSyncStatus('offline_queued');
      return;
    }

    setSyncStatus('saving');
    if (debounceTimersRef.current[qId]) {
      window.clearTimeout(debounceTimersRef.current[qId]);
    }

    const delayMs = isTextHeavy ? 450 : 120;
    debounceTimersRef.current[qId] = window.setTimeout(() => {
      delete debounceTimersRef.current[qId];
      void (async () => {
        if (studentToken) {
          try {
            const res = await autosaveStudentAnswer(studentToken, session.id, {
              questionId: qId,
              answerValue: nextValue,
              currentIndex,
            });
            if (res.ok) {
              if (pendingQueueRef.current[qId] === nextValue) {
                delete pendingQueueRef.current[qId];
                writeKeyFreeOfflineQueue(session.id, pendingQueueRef.current);
              }
              if (res.serverNowAt) {
                clockOffsetMsRef.current = Date.parse(res.serverNowAt) - Date.now();
              }
              if (Object.keys(pendingQueueRef.current).length === 0) {
                setSyncStatus('saved');
              }
            }
          } catch (err) {
            if (err instanceof ApiClientError) {
              if (err.code === 'DEADLINE_EXCEEDED' || err.code === 'SESSION_ALREADY_SUBMITTED') {
                if (!autoSubmitTriggeredRef.current) {
                  autoSubmitTriggeredRef.current = true;
                  void handleFinishAdventure(true);
                }
                return;
              }
              setSyncErrorDetail(err.message);
              setSyncStatus('error');
            } else {
              setSyncStatus('offline_queued');
            }
          }
          return;
        }

        const result = await saveStudentAnswerWithAutosave({
          sessionId: session.id,
          assessmentId: assessment.id,
          questionId: qId,
          questionPromptSnapshot: qPrompt,
          questionWeightSnapshot: qWeight,
          answerValue: nextValue,
          isAnswered: nextValue.trim() !== '',
        });
        if (result === 'saved') {
          delete pendingQueueRef.current[qId];
          writeKeyFreeOfflineQueue(session.id, pendingQueueRef.current);
        }
        setSyncStatus(result);
      })();
    }, delayMs);
  }

  async function handleNavigateTo(targetIdx: number) {
    if (targetIdx < 0 || targetIdx >= orderedQuestions.length) return;
    setNavWarning('');

    if (navigationMode !== 'free' && Math.abs(targetIdx - currentIndex) > 1 && targetIdx > currentIndex) {
      setNavWarning('Gurumu mengatur misi ini agar dikerjakan berurutan langkah demi langkah.');
      return;
    }

    if (targetIdx < currentIndex && !allowBack) {
      setNavWarning('Gurumu mengatur misi ini untuk berjalan maju saja.');
      return;
    }

    if (
      targetIdx > currentIndex &&
      requireAnswerBeforeNext &&
      currentQuestion &&
      (answersMap[currentQuestion.id] || '').trim() === ''
    ) {
      setNavWarning('Jawab soal ini dulu sebelum melangkah ke pos berikutnya ya!');
      return;
    }

    const movingForward = targetIdx > currentIndex;
    if (
      movingForward &&
      (currentIndex + 1) % checkpointInterval === 0 &&
      currentIndex + 1 < orderedQuestions.length
    ) {
      audioEngine.playCheckpoint();
      setCheckpointCelebration({
        checkpointNum: Math.floor((currentIndex + 1) / checkpointInterval),
        artifact: world.artifactName,
      });
    } else {
      audioEngine.playStep();
    }

    setCurrentIndex(targetIdx);
    setShowNavigator(false);
    await persistProgressIndex(targetIdx, answersMap);
  }

  // --- COMPLETION SCREEN ---
  if (isCompleted) {
    const celebration = submissionSummary?.celebration || fallbackCelebration;
    const showScore =
      submissionSummary !== null
        ? submissionSummary.scoreVisible && submissionSummary.finalScore !== null
        : assessment.showScoreToStudent && legacyVisibleResult !== null;

    const displayedScore =
      submissionSummary !== null ? submissionSummary.finalScore : legacyVisibleResult?.finalScore ?? null;
    const displayedCorrect =
      submissionSummary !== null
        ? submissionSummary.correctCount
        : legacyVisibleResult?.correctCount ?? null;
    const statusText =
      submissionSummary?.statusLabel ||
      (assessment.showScoreToStudent
        ? 'Penilaian Selesai'
        : 'Jawaban Tersimpan oleh Guru');

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
        <AdventureCelebrationOverlay
          celebration={celebrationDismissed ? null : celebration || null}
          reducedMotion={prefs.reducedMotion}
          onDismiss={() => setCelebrationDismissed(true)}
        />
        <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 text-center space-y-6 shadow-sm">
          <div className="flex justify-center gap-4 items-center">
            <img
              src={explorer.avatarUrl}
              alt={explorer.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-2xl object-cover border border-slate-200"
            />
            <img
              src="/src/assets/images/badge_master_explorer_1795448997972.jpg"
              alt="Lencana Penyelesaian"
              referrerPolicy="no-referrer"
              className={`w-24 h-24 rounded-2xl object-cover border border-amber-200 ${
                prefs.animationsEnabled ? 'animate-float-slow' : ''
              }`}
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-teal-700">
              {world.worldName} · {world.subjectName}
              {submissionSummary?.examMode === 'latihan'
                ? ' · Latihan'
                : submissionSummary?.examMode === 'simulasi'
                  ? ' · Simulasi'
                  : ''}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Misi Selesai dengan Hebat!
            </h1>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-slate-700 text-base leading-relaxed whitespace-pre-line">
            {DEFAULT_COMPLETION_MESSAGE}
          </div>

          {/* Adventure XP & Badge Delta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800 font-semibold">Pengalaman (XP)</p>
              <p className="font-display font-bold text-slate-900 mt-1 flex items-center gap-1.5 font-mono-tabular">
                <Sparkles className="w-4 h-4 text-amber-600" />
                {celebration ? `+${celebration.xpGranted} XP` : world.artifactName}
              </p>
              {celebration && (
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Level {celebration.newLevel} · {celebration.newLevelTitle}
                </p>
              )}
            </div>
            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200">
              <p className="text-xs text-teal-800 font-semibold">Lencana Penjelajah</p>
              <p className="font-display font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-teal-700" />
                {celebration && celebration.unlockedBadges.length > 0
                  ? celebration.unlockedBadges.map((b) => b.badgeName).join(', ')
                  : world.badgeTitle}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 tabular-nums">
              <p className="text-xs text-emerald-800 font-semibold">Jawaban Terkirim</p>
              <p className="font-display font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                {answeredCount} / {orderedQuestions.length} Soal
              </p>
            </div>
          </div>

          {/* Score / Policy Card */}
          {showScore && displayedScore !== null ? (
            <div className="p-5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-950 space-y-1">
              <p className="text-xs font-semibold text-teal-800">Hasil Penilaian</p>
              <p className="font-display text-3xl font-extrabold font-mono-tabular">
                {displayedScore}
              </p>
              {displayedCorrect !== null && (
                <p className="text-xs text-teal-800 tabular-nums">
                  Benar {displayedCorrect} dari {orderedQuestions.length} soal
                </p>
              )}
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 space-y-1">
              <p className="font-display font-bold text-base inline-flex items-center gap-2 justify-center">
                {submissionSummary?.gradingStatus === 'waiting_essay_grading' ||
                submissionSummary?.needsManualReview ? (
                  <Clock className="w-4 h-4 text-amber-700" />
                ) : (
                  <Award className="w-4 h-4 text-teal-700" />
                )}
                {statusText}
              </p>
              <p className="text-xs text-slate-600">
                {submissionSummary?.gradingStatus === 'waiting_essay_grading' ||
                submissionSummary?.needsManualReview
                  ? 'Jawaban soal objektifmu sudah tercatat dan jawaban uraian akan diperiksa Bapak/Ibu Guru.'
                  : 'Seluruh jawabanmu sudah diterima dengan aman oleh server sekolah.'}
              </p>
            </div>
          )}

          {/* Practice Mode Explanations (Only when returned by server policy) */}
          {submissionSummary?.reviewItems && submissionSummary.reviewItems.length > 0 && (
            <div className="text-left border-t border-slate-200 pt-5 space-y-3">
              <h2 className="font-display font-bold text-base text-slate-900">
                Pembahasan Latihan
              </h2>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {submissionSummary.reviewItems.map((item, idx) => (
                  <div
                    key={item.questionId}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1"
                  >
                    <p className="font-semibold text-slate-900">
                      #{idx + 1}. {item.prompt}
                    </p>
                    {item.correctAnswer && (
                      <p className="text-emerald-800">
                        <strong>Kunci:</strong> {item.correctAnswer}
                      </p>
                    )}
                    {item.explanation && (
                      <p className="text-slate-600">{item.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onExitToMap}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-teal-700 text-white font-display font-bold text-base hover:bg-teal-800 transition-colors cursor-pointer"
          >
            Kembali ke Base Camp
          </button>
        </div>
      </div>
    );
  }

  const isCurrentFlagged = currentQuestion ? flaggedIds.includes(currentQuestion.id) : false;
  const isLowTimeReminder = remainingSeconds > 0 && remainingSeconds <= 300;

  return (
    <div
      className={`min-h-screen bg-slate-50 flex flex-col ${prefs.reducedMotion ? 'reduced-motion' : ''}`}
    >
      {/* Adventure Runner Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={explorer.avatarUrl}
              alt={explorer.name}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-display font-bold text-sm sm:text-base text-slate-900 truncate">
                {examMeta?.title || world.worldName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {session.studentName} · Kelas {session.gradeClass}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Real Autosave Sync Badge */}
            <div
              className="flex items-center gap-1.5 text-xs font-medium"
              title={syncErrorDetail || 'Status penyimpanan jawaban ke server'}
            >
              {syncStatus === 'saving' && (
                <span className="inline-flex items-center gap-1 text-teal-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Menyimpan...</span>
                </span>
              )}
              {syncStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Cloud className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tersimpan</span>
                </span>
              )}
              {syncStatus === 'offline_queued' && (
                <button
                  type="button"
                  onClick={() => void flushOfflineQueueToServer()}
                  className="inline-flex items-center gap-1 text-amber-800 hover:underline cursor-pointer"
                >
                  <CloudOff className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Menunggu koneksi</span>
                </button>
              )}
              {syncStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => void flushOfflineQueueToServer()}
                  className="inline-flex items-center gap-1 text-rose-700 hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Gagal menyimpan</span>
                </button>
              )}
            </div>

            {/* Calm Server-Synced Timer */}
            <div
              className={`flex items-center gap-1.5 text-xs font-mono-tabular font-bold px-2.5 py-1.5 rounded-lg border ${
                isLowTimeReminder
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
              title="Sisa waktu pengerjaan"
            >
              <Timer className="w-3.5 h-3.5" />
              {formatRemainingClock(remainingSeconds)}
            </div>

            <button
              type="button"
              onClick={() => setShowNavigator((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline">Daftar Soal</span>
              <span className="font-mono-tabular">
                ({answeredCount}/{orderedQuestions.length})
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Question Stage */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 sm:py-6 space-y-4">
        {/* Gentle < 5 minute notice (calm amber, never harsh red alarm) */}
        {isLowTimeReminder && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-amber-900">
            <Clock className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              Sisa waktu kurang dari 5 menit. Periksa kembali jawabanmu dengan tenang sebelum
              waktu berakhir.
            </span>
          </div>
        )}

        <JourneyTrailBar
          total={orderedQuestions.length}
          currentIndex={currentIndex}
          answeredIds={session.answeredIds}
          questionIds={orderedQuestions.map((q) => q.id)}
          checkpointInterval={checkpointInterval}
          accentHex={world.accentHex}
          animationsEnabled={prefs.animationsEnabled}
        />

        {/* Visual Question Navigator with 3 explicit statuses */}
        {showNavigator && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Navigator Nomor Soal</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-700" /> Sudah dijawab ({answeredCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-amber-600" /> Ditandai ({flaggedIds.length})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-slate-200 inline-block" /> Belum dijawab (
                  {unansweredCount})
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {orderedQuestions.map((q, idx) => {
                const answered = (answersMap[q.id] || '').trim() !== '';
                const flagged = flaggedIds.includes(q.id);
                const current = idx === currentIndex;
                const canJump =
                  navigationMode === 'free' ||
                  (idx <= currentIndex && allowBack) ||
                  idx === currentIndex + 1;

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!canJump}
                    onClick={() => void handleNavigateTo(idx)}
                    className={`relative w-11 h-11 rounded-xl font-bold text-sm tabular-nums flex items-center justify-center transition-colors ${
                      !canJump ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      flagged
                        ? 'bg-amber-300 text-slate-950 border border-amber-500'
                        : answered
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } ${current ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
                    title={`Soal ${idx + 1}: ${
                      flagged ? 'Ditandai' : answered ? 'Sudah dijawab' : 'Belum dijawab'
                    }`}
                  >
                    {idx + 1}
                    {flagged && (
                      <Flag className="w-2.5 h-2.5 absolute top-1 right-1 text-slate-900 fill-current" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Flag / Mark-for-review toolbar above active question */}
        {currentQuestion && (
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-xs font-semibold text-slate-600 tabular-nums">
              Soal {currentIndex + 1} dari {orderedQuestions.length}
            </span>
            <button
              type="button"
              onClick={() => void handleToggleFlag()}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isCurrentFlagged
                  ? 'bg-amber-100 border-amber-400 text-amber-950'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Flag className={`w-3.5 h-3.5 ${isCurrentFlagged ? 'fill-amber-500 text-amber-700' : ''}`} />
              {isCurrentFlagged ? 'Ditandai untuk Ditinjau' : 'Tandai untuk Ditinjau'}
            </button>
          </div>
        )}

        {currentQuestion ? (
          <QuestionRenderer
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={orderedQuestions.length}
            answerValue={answersMap[currentQuestion.id] || ''}
            mode={effectiveMode}
            audioEnabled={audioEnabled}
            lockedAfterAnswer={!allowEditAfterAnswer}
            onChangeAnswer={handleAnswerChange}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-600">
            Belum ada soal yang dipublikasikan pada dunia ini.
          </div>
        )}

        {navWarning && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>{navWarning}</span>
          </p>
        )}

        {/* Bottom Navigation Controls */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={currentIndex === 0 || !allowBack}
            onClick={() => void handleNavigateTo(currentIndex - 1)}
            className="px-5 py-3.5 rounded-2xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Sebelumnya
          </button>

          <div className="flex items-center gap-2.5">
            {currentIndex < orderedQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => void handleNavigateTo(currentIndex + 1)}
                className={`px-6 py-3.5 rounded-2xl ${world.primaryColor} text-white font-display font-bold text-base hover:opacity-95 flex items-center gap-2 cursor-pointer`}
              >
                Lanjut Langkah
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isCompleting}
                onClick={() => setShowSubmitConfirm(true)}
                className="px-6 py-3.5 rounded-2xl bg-emerald-600 text-white font-display font-bold text-base hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
              >
                <Flag className="w-4 h-4" />
                {isCompleting ? 'Mengirim...' : 'Selesaikan Misi'}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Pre-Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900">
                  Kirim Jawaban Misi?
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Periksa ringkasan pengerjaanmu sebelum mengirim ke server guru.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center tabular-nums">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-lg font-extrabold text-emerald-800">{answeredCount}</p>
                <p className="text-[11px] font-semibold text-emerald-700">Sudah Dijawab</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                <p className="text-lg font-extrabold text-slate-800">{unansweredCount}</p>
                <p className="text-[11px] font-semibold text-slate-600">Belum Dijawab</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-lg font-extrabold text-amber-800">{flaggedIds.length}</p>
                <p className="text-[11px] font-semibold text-amber-700">Ditandai</p>
              </div>
            </div>

            {(unansweredCount > 0 || flaggedIds.length > 0) && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                Masih ada{' '}
                {unansweredCount > 0 ? `${unansweredCount} soal belum dijawab` : ''}
                {unansweredCount > 0 && flaggedIds.length > 0 ? ' dan ' : ''}
                {flaggedIds.length > 0 ? `${flaggedIds.length} soal ditandai` : ''}. Kamu boleh
                memeriksa lagi atau langsung mengirim sekarang.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  setShowNavigator(true);
                }}
                className="flex-1 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                disabled={isCompleting}
                onClick={() => void handleFinishAdventure(false)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {isCompleting ? 'Mengirim...' : 'Kirim Jawaban Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Gate Open Modal */}
      {checkpointCelebration && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-amber-200 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="font-display text-xl font-extrabold text-slate-900">
              Checkpoint {checkpointCelebration.checkpointNum} Terbuka!
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Gerbang perjalanan terbuka! Kamu menemukan jejak artefak{' '}
              <strong className="text-slate-900">{checkpointCelebration.artifact}</strong>. Tetap
              semangat melangkah!
            </p>
            <button
              type="button"
              onClick={() => setCheckpointCelebration(null)}
              className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold text-sm hover:bg-teal-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Lanjutkan Perjalanan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

