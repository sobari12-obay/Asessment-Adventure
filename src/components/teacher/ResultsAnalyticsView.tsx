import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  History,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';
import { getWorldConfig } from '../../data/worlds';
import {
  analyzeResultsOnServer,
  evaluateSessionOnServer,
  type AnalyzeScoringResponse,
} from '../../lib/scoringClient';
import {
  fetchTeacherExamResults,
  fetchTeacherSubmissionDetail,
  gradeSubmissionEssays,
} from '../../services/apiClient';
import {
  getSessionAnswersForTeacher,
  getTeacherQuestionsWithKeys,
  saveTeacherResult,
} from '../../services/firestoreService';
import type {
  AssessmentConfig,
  AssessmentResult,
  AssessmentSession,
  ExamAuditTrailEntry,
  QuestionKey,
  QuestionWithKey,
  StudentAnswer,
} from '../../types/psas';

interface ResultsAnalyticsViewProps {
  assessments: AssessmentConfig[];
  sessions: AssessmentSession[];
  results: AssessmentResult[];
  teacherUid: string;
  onOpenReports?: () => void;
}

type RecapScopeTab = 'official' | 'practice' | 'all';

function isOfficialResult(
  result: AssessmentResult,
  assessmentMap: Map<string, AssessmentConfig>
): boolean {
  if (typeof result.isOfficialScore === 'boolean') return result.isOfficialScore;
  const asm = assessmentMap.get(result.assessmentId);
  const examType = result.examType || asm?.examType || result.examMode || asm?.mode || 'psas';
  return examType !== 'latihan' && examType !== 'simulasi';
}

function getExamTypeLabel(
  result: AssessmentResult,
  assessmentMap: Map<string, AssessmentConfig>
): string {
  const asm = assessmentMap.get(result.assessmentId);
  const t = result.examType || asm?.examType || result.examMode || asm?.mode || 'psas';
  if (t === 'latihan') return 'Latihan';
  if (t === 'simulasi') return 'Simulasi';
  if (t === 'ulangan_harian') return 'Ulangan Harian';
  if (t === 'sumatif') return 'Sumatif';
  return 'PSAS';
}

function isWaitingEssay(r: AssessmentResult): boolean {
  return r.gradingStatus === 'waiting_essay_grading' || Boolean(r.needsManualReview);
}

export const ResultsAnalyticsView: React.FC<ResultsAnalyticsViewProps> = ({
  assessments,
  sessions,
  results,
  teacherUid,
  onOpenReports,
}) => {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(
    assessments[0]?.id || 'all'
  );
  const [classFilter, setClassFilter] = useState<string>('all');
  const [recapTab, setRecapTab] = useState<RecapScopeTab>('official');
  const [serverResults, setServerResults] = useState<AssessmentResult[]>([]);
  const [isLoadingServer, setIsLoadingServer] = useState(false);

  const [isSyncingScores, setIsSyncingScores] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  const [analysis, setAnalysis] = useState<AnalyzeScoringResponse | null>(null);

  // Manual grading drawer state
  const [gradingTargetId, setGradingTargetId] = useState<string | null>(null);
  const [gradingStudentName, setGradingStudentName] = useState('');
  const [gradingGradeClass, setGradingGradeClass] = useState('');
  const [gradingQuestions, setGradingQuestions] = useState<QuestionWithKey[]>([]);
  const [gradingAnswersMap, setGradingAnswersMap] = useState<Record<string, string>>({});
  const [manualScoresDraft, setManualScoresDraft] = useState<Record<string, string>>({});
  const [manualCommentsDraft, setManualCommentsDraft] = useState<Record<string, string>>({});
  const [gradingAuditTrail, setGradingAuditTrail] = useState<ExamAuditTrailEntry[]>([]);
  const [gradingHasServerSubmission, setGradingHasServerSubmission] = useState(false);
  const [isSavingManualGrade, setIsSavingManualGrade] = useState(false);

  const assessmentMap = useMemo(() => {
    const map = new Map<string, AssessmentConfig>();
    for (const a of assessments) map.set(a.id, a);
    return map;
  }, [assessments]);

  const selectedAssessment = useMemo(
    () => (selectedAssessmentId === 'all' ? null : assessmentMap.get(selectedAssessmentId) || null),
    [assessmentMap, selectedAssessmentId]
  );

  // Auto-switch scope tab if user explicitly selects a Latihan/Simulasi assessment
  useEffect(() => {
    if (!selectedAssessment) return;
    const isPractice =
      selectedAssessment.mode === 'latihan' ||
      selectedAssessment.mode === 'simulasi' ||
      selectedAssessment.examType === 'latihan' ||
      selectedAssessment.examType === 'simulasi';
    if (isPractice && recapTab === 'official') {
      setRecapTab('practice');
    } else if (!isPractice && recapTab === 'practice') {
      setRecapTab('official');
    }
  }, [selectedAssessment, recapTab]);

  const loadServerResults = useCallback(async () => {
    setIsLoadingServer(true);
    try {
      if (selectedAssessmentId !== 'all') {
        const res = await fetchTeacherExamResults(selectedAssessmentId);
        setServerResults(Array.isArray(res.submissions) ? res.submissions : []);
      } else {
        const targetIds = assessments.map((a) => a.id).slice(0, 20);
        const responses = await Promise.all(
          targetIds.map((id) =>
            fetchTeacherExamResults(id).catch(() => ({
              ok: false,
              exam: null,
              isOfficialRecap: true,
              submissions: [] as AssessmentResult[],
            }))
          )
        );
        const mergedAll: AssessmentResult[] = [];
        for (const r of responses) {
          if (Array.isArray(r.submissions)) mergedAll.push(...r.submissions);
        }
        setServerResults(mergedAll);
      }
    } catch {
      // Fallback gracefully to Firestore results prop when offline or unauthenticated on server
    } finally {
      setIsLoadingServer(false);
    }
  }, [selectedAssessmentId, assessments]);

  useEffect(() => {
    void loadServerResults();
  }, [loadServerResults]);

  // Merge Firestore results + server submissions (prefer server submission for Stage 3 fields)
  const mergedResults = useMemo(() => {
    const bySessionId = new Map<string, AssessmentResult>();
    for (const r of results) {
      bySessionId.set(r.sessionId, r);
    }
    for (const sr of serverResults) {
      const existing = bySessionId.get(sr.sessionId);
      if (!existing) {
        bySessionId.set(sr.sessionId, sr);
      } else {
        bySessionId.set(sr.sessionId, {
          ...existing,
          ...sr,
        });
      }
    }
    return Array.from(bySessionId.values());
  }, [results, serverResults]);

  const scopedCounts = useMemo(() => {
    const byAssessment = mergedResults.filter(
      (r) => selectedAssessmentId === 'all' || r.assessmentId === selectedAssessmentId
    );
    let official = 0;
    let practice = 0;
    for (const r of byAssessment) {
      if (isOfficialResult(r, assessmentMap)) official += 1;
      else practice += 1;
    }
    return { official, practice, all: byAssessment.length };
  }, [mergedResults, selectedAssessmentId, assessmentMap]);

  const filteredResults = useMemo(() => {
    return mergedResults
      .filter((r) => selectedAssessmentId === 'all' || r.assessmentId === selectedAssessmentId)
      .filter((r) => classFilter === 'all' || r.gradeClass === classFilter)
      .filter((r) => {
        if (recapTab === 'all') return true;
        const official = isOfficialResult(r, assessmentMap);
        return recapTab === 'official' ? official : !official;
      })
      .sort((a, b) => {
        // Pending essay reviews first, then highest score
        const aWait = isWaitingEssay(a) ? 0 : 1;
        const bWait = isWaitingEssay(b) ? 0 : 1;
        if (aWait !== bWait) return aWait - bWait;
        return (b.finalScore ?? 0) - (a.finalScore ?? 0);
      });
  }, [mergedResults, selectedAssessmentId, classFilter, recapTab, assessmentMap]);

  const ungradedSubmittedSessions = useMemo(() => {
    const resultIds = new Set(mergedResults.map((r) => r.sessionId));
    return sessions.filter(
      (s) =>
        (s.status === 'submitted' || s.status === 'in_progress') &&
        !resultIds.has(s.id) &&
        (selectedAssessmentId === 'all' || s.assessmentId === selectedAssessmentId)
    );
  }, [sessions, mergedResults, selectedAssessmentId]);

  const availableClasses = useMemo(() => {
    const set = new Set(mergedResults.map((r) => r.gradeClass));
    return Array.from(set).sort();
  }, [mergedResults]);

  const pendingEssayCount = useMemo(
    () => filteredResults.filter((r) => isWaitingEssay(r)).length,
    [filteredResults]
  );

  // Run backend analysis whenever selected assessment or finalized results change
  useEffect(() => {
    let active = true;
    async function runAnalysis() {
      if (selectedAssessmentId === 'all' || !selectedAssessment) {
        setAnalysis(null);
        return;
      }
      try {
        const qs = await getTeacherQuestionsWithKeys(selectedAssessment.id);
        if (!active) return;

        const finalizedOnly = filteredResults.filter((r) => !isWaitingEssay(r));
        const res = await analyzeResultsOnServer({
          questions: qs,
          results: finalizedOnly,
          kkm: selectedAssessment.kkm || 75,
        });
        if (active) {
          setAnalysis(res);
          setSyncError('');
        }
      } catch (err) {
        if (active) {
          setSyncError(
            err instanceof Error ? err.message : 'Gagal memuat analisis hasil dari server.'
          );
        }
      }
    }
    void runAnalysis();
    return () => {
      active = false;
    };
  }, [selectedAssessmentId, selectedAssessment, filteredResults]);

  async function handleSyncAllSubmitted() {
    setIsSyncingScores(true);
    setSyncMessage('');
    setSyncError('');
    try {
      const resultIds = new Set(mergedResults.map((r) => r.sessionId));
      const toGrade = sessions.filter((s) => s.status === 'submitted' && !resultIds.has(s.id));

      if (toGrade.length === 0) {
        await loadServerResults();
        setSyncMessage('Data hasil penilaian dari server sudah diperbarui.');
        return;
      }

      const questionCache = new Map<string, QuestionWithKey[]>();
      let gradedCount = 0;

      for (const sess of toGrade) {
        const asm = assessmentMap.get(sess.assessmentId);
        if (!asm) continue;

        let qWithKeys = questionCache.get(asm.id);
        if (!qWithKeys) {
          qWithKeys = await getTeacherQuestionsWithKeys(asm.id);
          questionCache.set(asm.id, qWithKeys);
        }

        const answers = await getSessionAnswersForTeacher(sess.id);
        const keys: QuestionKey[] = qWithKeys.map((q) => ({
          questionId: q.id,
          assessmentId: q.assessmentId,
          type: q.type,
          correctAnswer: q.correctAnswer,
          acceptedVariations: q.acceptedVariations,
          numericTolerance: q.numericTolerance,
          rubric: q.rubric,
          explanation: q.explanation,
          weight: q.weight,
          ownerId: q.ownerId,
        }));

        const evaluated = await evaluateSessionOnServer({
          questions: qWithKeys,
          keys,
          answers,
          startedAt: sess.startedAt,
          submittedAt: sess.submittedAt,
        });

        await saveTeacherResult(
          {
            sessionId: sess.id,
            schoolId: sess.schoolId,
            assessmentId: asm.id,
            assessmentTitle: asm.title,
            subjectId: asm.subjectId,
            classId: sess.classId,
            studentId: sess.studentId,
            studentName: sess.studentName,
            gradeClass: sess.gradeClass,
            participantNumber: sess.participantNumber,
            examMode: asm.mode,
            examType: asm.examType || asm.mode,
            isOfficialScore: asm.mode !== 'latihan' && asm.mode !== 'simulasi',
            gradingStatus: evaluated.needsManualReview ? 'waiting_essay_grading' : 'auto_graded',
            objectiveScore: evaluated.finalScore,
            finalScore: evaluated.finalScore,
            earnedPoints: evaluated.earnedPoints,
            maxPoints: evaluated.maxPoints,
            correctCount: evaluated.correctCount,
            wrongCount: evaluated.wrongCount,
            unansweredCount: evaluated.unansweredCount,
            needsManualReview: evaluated.needsManualReview,
            questionOutcomes: evaluated.questionOutcomes,
            durationSeconds: evaluated.durationSeconds,
            showToStudent: asm.showScoreToStudent && !evaluated.needsManualReview,
            gradedBy: teacherUid,
            startedAt: sess.startedAt,
            submittedAt: sess.submittedAt || new Date().toISOString(),
          },
          true
        );
        gradedCount++;
      }

      await loadServerResults();
      setSyncMessage(
        `Berhasil menghitung ${gradedCount} sesi siswa melalui backend scoring engine.`
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Gagal menghitung nilai sesi siswa.');
    } finally {
      setIsSyncingScores(false);
    }
  }

  async function openManualGrading(resultItem: AssessmentResult) {
    setSyncError('');
    setSyncMessage('');

    try {
      // Try Stage 3 server submission detail first
      const detail = await fetchTeacherSubmissionDetail(resultItem.sessionId);
      setGradingTargetId(detail.submission.sessionId);
      setGradingStudentName(detail.submission.studentName);
      setGradingGradeClass(detail.submission.gradeClass);
      setGradingQuestions(detail.questions);

      const ansMap: Record<string, string> = {};
      for (const [qId, ans] of Object.entries(detail.answers || {})) {
        ansMap[qId] = ans.answerValue || '';
      }
      setGradingAnswersMap(ansMap);

      const scoreDraft: Record<string, string> = {};
      const commentDraft: Record<string, string> = {};
      for (const q of detail.questions) {
        const entry = detail.submission.essayGrading?.[q.id];
        if (entry) {
          scoreDraft[q.id] = String(entry.score);
          commentDraft[q.id] = entry.comment || '';
        } else if (
          detail.submission.manualScores &&
          detail.submission.manualScores[q.id] !== undefined
        ) {
          scoreDraft[q.id] = String(detail.submission.manualScores[q.id]);
        }
      }
      setManualScoresDraft(scoreDraft);
      setManualCommentsDraft(commentDraft);
      setGradingAuditTrail(detail.submission.auditTrail || []);
      setGradingHasServerSubmission(true);
      return;
    } catch {
      // Fallback to Firestore session/questions
    }

    const sess = sessions.find((s) => s.id === resultItem.sessionId);
    try {
      const [qs, ans] = await Promise.all([
        getTeacherQuestionsWithKeys(resultItem.assessmentId),
        getSessionAnswersForTeacher(resultItem.sessionId),
      ]);
      const ansMap: Record<string, string> = {};
      for (const a of ans as StudentAnswer[]) {
        ansMap[a.questionId] = a.answerValue || '';
      }
      const scoreDraft: Record<string, string> = {};
      const commentDraft: Record<string, string> = {};
      for (const [qId, val] of Object.entries(resultItem.manualScores || {})) {
        scoreDraft[qId] = String(val);
      }
      for (const [qId, entry] of Object.entries(resultItem.essayGrading || {})) {
        scoreDraft[qId] = String(entry.score);
        commentDraft[qId] = entry.comment || '';
      }

      setGradingTargetId(resultItem.sessionId);
      setGradingStudentName(sess?.studentName || resultItem.studentName);
      setGradingGradeClass(sess?.gradeClass || resultItem.gradeClass);
      setGradingQuestions(qs);
      setGradingAnswersMap(ansMap);
      setManualScoresDraft(scoreDraft);
      setManualCommentsDraft(commentDraft);
      setGradingAuditTrail(resultItem.auditTrail || []);
      setGradingHasServerSubmission(false);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Gagal membuka rincian jawaban siswa.');
    }
  }

  async function handleSaveManualGrade() {
    if (!gradingTargetId) return;
    setSyncError('');
    setIsSavingManualGrade(true);

    try {
      // Validate inputs
      const gradesPayload: Array<{ questionId: string; score: number; comment?: string }> = [];
      const numericManualScores: Record<string, number> = {};

      for (const q of gradingQuestions) {
        const raw = manualScoresDraft[q.id];
        if (raw === undefined || raw.trim() === '') continue;
        const parsed = Number(raw);
        const maxWeight = typeof q.weight === 'number' && q.weight >= 0 ? q.weight : 10;
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxWeight) {
          setSyncError(`Skor untuk "${q.prompt.slice(0, 40)}..." harus antara 0 dan ${maxWeight}.`);
          setIsSavingManualGrade(false);
          return;
        }
        numericManualScores[q.id] = parsed;
        gradesPayload.push({
          questionId: q.id,
          score: parsed,
          comment: manualCommentsDraft[q.id]?.trim() || '',
        });
      }

      if (gradingHasServerSubmission && gradesPayload.length > 0) {
        const res = await gradeSubmissionEssays(gradingTargetId, gradesPayload);
        await loadServerResults();

        // Also mirror to Firestore results if the assessment exists locally
        const sub = res.submission;
        try {
          await saveTeacherResult(
            {
              sessionId: sub.sessionId,
              schoolId: sub.schoolId,
              assessmentId: sub.assessmentId,
              assessmentTitle: sub.assessmentTitle,
              subjectId: sub.subjectId,
              classId: sub.classId,
              studentId: sub.studentId,
              studentName: sub.studentName,
              gradeClass: sub.gradeClass,
              participantNumber: sub.participantNumber,
              examMode: sub.examMode,
              examType: sub.examType,
              isOfficialScore: sub.isOfficialScore,
              gradingStatus: sub.gradingStatus,
              objectiveScore: sub.objectiveScore,
              finalScore: sub.finalScore,
              earnedPoints: sub.earnedPoints,
              maxPoints: sub.maxPoints,
              correctCount: sub.correctCount,
              wrongCount: sub.wrongCount,
              unansweredCount: sub.unansweredCount,
              needsManualReview: sub.needsManualReview,
              manualScores: sub.manualScores,
              essayGrading: sub.essayGrading,
              questionOutcomes: sub.questionOutcomes,
              auditTrail: sub.auditTrail,
              durationSeconds: sub.durationSeconds,
              showToStudent: sub.showToStudent,
              gradedBy: teacherUid,
              startedAt: sub.startedAt,
              submittedAt: sub.submittedAt,
            },
            !results.some((r) => r.sessionId === sub.sessionId)
          );
        } catch {
          // Non-blocking Firestore mirror
        }

        setGradingTargetId(null);
        setSyncMessage(
          `Penilaian uraian untuk ${gradingStudentName} berhasil disimpan (Nilai akhir: ${sub.finalScore}).`
        );
        return;
      }

      // Fallback path for legacy Firestore-only sessions
      const existingRes = mergedResults.find((r) => r.sessionId === gradingTargetId);
      const sess = sessions.find((s) => s.id === gradingTargetId);
      const asm = assessmentMap.get(existingRes?.assessmentId || sess?.assessmentId || '');
      if (!asm) {
        throw new Error('Data asesmen untuk sesi ini tidak ditemukan.');
      }

      const keys: QuestionKey[] = gradingQuestions.map((q) => ({
        questionId: q.id,
        assessmentId: q.assessmentId,
        type: q.type,
        correctAnswer: q.correctAnswer,
        acceptedVariations: q.acceptedVariations,
        numericTolerance: q.numericTolerance,
        rubric: q.rubric,
        explanation: q.explanation,
        weight: q.weight,
        ownerId: q.ownerId,
      }));
      const answersArray = Object.entries(gradingAnswersMap).map(([questionId, answerValue]) => ({
        id: questionId,
        schoolId: asm.schoolId,
        sessionId: gradingTargetId,
        questionId,
        answerValue,
        isAnswered: answerValue.trim().length > 0,
      }));
      const evaluated = await evaluateSessionOnServer({
        questions: gradingQuestions,
        keys,
        answers: answersArray,
        manualScores: numericManualScores,
        startedAt: sess?.startedAt || existingRes?.startedAt,
        submittedAt: sess?.submittedAt || existingRes?.submittedAt,
      });

      await saveTeacherResult(
        {
          sessionId: gradingTargetId,
          schoolId: sess?.schoolId || existingRes?.schoolId || asm.schoolId,
          assessmentId: asm.id,
          assessmentTitle: asm.title,
          subjectId: asm.subjectId,
          classId: sess?.classId || existingRes?.classId,
          studentId: sess?.studentId || existingRes?.studentId,
          studentName: gradingStudentName,
          gradeClass: gradingGradeClass,
          participantNumber: sess?.participantNumber || existingRes?.participantNumber,
          examMode: asm.mode,
          examType: asm.examType || asm.mode,
          isOfficialScore: asm.mode !== 'latihan' && asm.mode !== 'simulasi',
          gradingStatus: evaluated.needsManualReview ? 'waiting_essay_grading' : 'finalized',
          finalScore: evaluated.finalScore,
          earnedPoints: evaluated.earnedPoints,
          maxPoints: evaluated.maxPoints,
          correctCount: evaluated.correctCount,
          wrongCount: evaluated.wrongCount,
          unansweredCount: evaluated.unansweredCount,
          needsManualReview: evaluated.needsManualReview,
          manualScores: numericManualScores,
          questionOutcomes: evaluated.questionOutcomes,
          durationSeconds: evaluated.durationSeconds,
          showToStudent: asm.showScoreToStudent && !evaluated.needsManualReview,
          gradedBy: teacherUid,
          startedAt: sess?.startedAt || existingRes?.startedAt,
          submittedAt:
            sess?.submittedAt || existingRes?.submittedAt || new Date().toISOString(),
        },
        !results.some((r) => r.sessionId === gradingTargetId)
      );

      setGradingTargetId(null);
      setSyncMessage(`Nilai manual untuk ${gradingStudentName} telah diperbarui.`);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Gagal menyimpan penilaian manual.');
    } finally {
      setIsSavingManualGrade(false);
    }
  }

  function handleExportExcel() {
    const wb = XLSX.utils.book_new();
    const rekapRows = filteredResults.map((r, i) => ({
      No: i + 1,
      Nama_Siswa: r.studentName,
      Kelas: r.gradeClass,
      No_Peserta: r.participantNumber || '-',
      Mata_Pelajaran: getWorldConfig(r.subjectId).subjectName,
      Asesmen: r.assessmentTitle,
      Jenis_Sesi: isOfficialResult(r, assessmentMap)
        ? `Nilai Resmi (${getExamTypeLabel(r, assessmentMap)})`
        : `Latihan/Simulasi (${getExamTypeLabel(r, assessmentMap)})`,
      Percobaan_Ke: r.attemptNumber || 1,
      Nilai_Objektif: r.objectiveScore ?? r.finalScore,
      Nilai_Akhir: isWaitingEssay(r) ? 'Menunggu Uraian' : r.finalScore,
      Benar: r.correctCount,
      Salah: r.wrongCount,
      Kosong: r.unansweredCount,
      Durasi_Detik: r.durationSeconds,
      Status: isWaitingEssay(r) ? 'Menunggu Penilaian Uraian' : 'Final',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapRows), 'Rekap_Nilai');

    if (analysis && analysis.questionStats.length > 0) {
      const itemRows = analysis.questionStats.map((qs) => ({
        Nomor_Soal: qs.number,
        Materi: qs.topic,
        Indikator: qs.indicator,
        Persen_Benar: qs.correctPercent,
        Persen_Salah: qs.wrongPercent,
        Persen_Kosong: qs.unansweredPercent,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Analisis_Soal');
    }

    const scopeSuffix =
      recapTab === 'official' ? 'Resmi' : recapTab === 'practice' ? 'Latihan' : 'Semua';
    XLSX.writeFile(wb, `Laporan_PSAS_${selectedAssessment?.code || 'Semua'}_${scopeSuffix}.xlsx`);
  }

  function escapeCsvCell(raw: string | number): string {
    const text = String(raw ?? '');
    const formulaSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }

  function handleExportCsv() {
    const header =
      'Nama,Kelas,Mapel,Asesmen,Jenis_Sesi,Nilai_Objektif,Nilai_Akhir,Benar,Salah,Kosong,Durasi_Detik,Status\n';
    const body = filteredResults
      .map((r) =>
        [
          escapeCsvCell(r.studentName),
          escapeCsvCell(r.gradeClass),
          escapeCsvCell(getWorldConfig(r.subjectId).subjectName),
          escapeCsvCell(r.assessmentTitle),
          escapeCsvCell(
            isOfficialResult(r, assessmentMap) ? 'Nilai Resmi' : 'Latihan / Simulasi'
          ),
          r.objectiveScore ?? r.finalScore,
          isWaitingEssay(r) ? 'Menunggu Uraian' : r.finalScore,
          r.correctCount,
          r.wrongCount,
          r.unansweredCount,
          r.durationSeconds,
          escapeCsvCell(isWaitingEssay(r) ? 'Menunggu Penilaian Uraian' : 'Final'),
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const scopeSuffix =
      recapTab === 'official' ? 'Resmi' : recapTab === 'practice' ? 'Latihan' : 'Semua';
    link.download = `Rekap_PSAS_${selectedAssessment?.code || 'Semua'}_${scopeSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Scope Segmented Control: Official vs Practice */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setRecapTab('official')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              recapTab === 'official'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nilai Resmi ({scopedCounts.official})
          </button>
          <button
            type="button"
            onClick={() => setRecapTab('practice')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              recapTab === 'practice'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Latihan &amp; Simulasi ({scopedCounts.practice})
          </button>
          <button
            type="button"
            onClick={() => setRecapTab('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              recapTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({scopedCounts.all})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {pendingEssayCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
              <Clock className="w-3.5 h-3.5" />
              {pendingEssayCount} menunggu penilaian uraian
            </span>
          )}
          <button
            type="button"
            disabled={isLoadingServer}
            onClick={() => void loadServerResults()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingServer ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          {onOpenReports && (
            <button
              type="button"
              onClick={onOpenReports}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800 text-xs font-semibold cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Pusat Laporan &amp; Ekspor PDF
            </button>
          )}
        </div>
      </div>

      {recapTab === 'practice' && (
        <div className="no-print flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <p>
            <strong>Sesi Latihan &amp; Simulasi:</strong> Nilai pada tab ini hanya untuk latihan
            siswa dan <strong>tidak masuk ke rekap nilai resmi rapor sekolah</strong>.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedAssessmentId}
            onChange={(e) => setSelectedAssessmentId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium"
          >
            <option value="all">Semua Asesmen</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                [{a.code}] {a.title} ({a.mode === 'latihan' ? 'Latihan' : a.mode === 'simulasi' ? 'Simulasi' : 'Resmi'})
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="all">Semua Kelas</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isSyncingScores}
            onClick={() => void handleSyncAllSubmitted()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingScores ? 'animate-spin' : ''}`} />
            Hitung Nilai ({sessions.filter((s) => s.status === 'submitted').length} Menunggu)
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="no-print bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-900 font-medium">
          {syncMessage}
        </div>
      )}

      {syncError && (
        <div className="no-print bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-900 font-medium">
          {syncError}
        </div>
      )}

      {/* Analysis KPIs */}
      {analysis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Rata-rata Nilai Final</p>
            <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
              {analysis.averageScore}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Tertinggi / Terendah</p>
            <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
              {analysis.highestScore} / {analysis.lowestScore}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Ketuntasan (KKM {selectedAssessment?.kkm || 75})
            </p>
            <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
              {analysis.passRate}%
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Final / Menunggu Uraian</p>
            <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
              {analysis.totalStudents} / {pendingEssayCount}
            </p>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900">
              {recapTab === 'official'
                ? 'Rekap Nilai Resmi Peserta'
                : recapTab === 'practice'
                ? 'Rekap Latihan & Simulasi Siswa'
                : 'Seluruh Rekap Penilaian Peserta'}
            </h3>
            <p className="text-xs text-slate-500">
              Skor akhir baru bersifat final setelah seluruh butir uraian selesai dinilai oleh guru.
            </p>
          </div>
          {ungradedSubmittedSessions.length > 0 && (
            <span className="text-xs text-amber-700 font-semibold">
              {ungradedSubmittedSessions.length} sesi menunggu sinkronisasi nilai
            </span>
          )}
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">Nama Siswa</th>
              <th className="py-3 px-4">Kelas</th>
              <th className="py-3 px-4">Asesmen</th>
              <th className="py-3 px-4 text-right">Objektif / Akhir</th>
              <th className="py-3 px-4 text-right">B / S / K</th>
              <th className="py-3 px-4 text-right">Durasi</th>
              <th className="py-3 px-4">Status Penilaian</th>
              <th className="no-print py-3 px-4 text-right">Koreksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  Belum ada hasil pada kategori ini. Sesi yang diselesaikan siswa akan muncul otomatis di sini.
                </td>
              </tr>
            ) : (
              filteredResults.map((r) => {
                const waiting = isWaitingEssay(r);
                const official = isOfficialResult(r, assessmentMap);
                const typeLabel = getExamTypeLabel(r, assessmentMap);
                const objScore = r.objectiveScore ?? r.finalScore;

                return (
                  <tr key={r.sessionId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{r.studentName}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.participantNumber ? `No. ${r.participantNumber} · ` : ''}
                        Percobaan #{r.attemptNumber || 1}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{r.gradeClass}</td>
                    <td className="py-3 px-4">
                      <p className="text-slate-800 text-xs font-medium">{r.assessmentTitle}</p>
                      <p className="text-[11px] text-slate-500">
                        {typeLabel} · {official ? 'Nilai Resmi' : 'Latihan (Non-Rapor)'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular">
                      {waiting ? (
                        <div>
                          <p className="text-xs font-semibold text-amber-800">
                            Sementara: {objScore}
                          </p>
                          <p className="text-[11px] text-slate-500">Belum final</p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-slate-900 text-base">{r.finalScore}</p>
                          {r.objectiveScore !== undefined && r.objectiveScore !== r.finalScore && (
                            <p className="text-[11px] text-slate-500">Objektif {r.objectiveScore}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                      {r.correctCount} / {r.wrongCount} / {r.unansweredCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                      {Math.floor(r.durationSeconds / 60)}m {r.durationSeconds % 60}s
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {waiting ? (
                        <span className="text-amber-800 font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Menunggu Penilaian Uraian
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {r.gradingStatus === 'finalized' ? 'Final (Uraian Dinilai)' : 'Final'}
                        </span>
                      )}
                    </td>
                    <td className="no-print py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void openManualGrading(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        {waiting ? 'Nilai Uraian' : 'Periksa'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Distribution, Item & Indicator Analysis */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">
              Distribusi Nilai Final &amp; Ketuntasan Materi
            </h3>
            <div className="space-y-2.5">
              {analysis.distribution.map((bin) => {
                const maxBin = Math.max(1, ...analysis.distribution.map((d) => d.count));
                return (
                  <div key={bin.label} className="flex items-center gap-3 text-xs">
                    <span className="w-16 font-mono-tabular font-semibold text-slate-700">
                      {bin.label}
                    </span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-600 rounded-full"
                        style={{ width: `${Math.round((bin.count / maxBin) * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono-tabular font-semibold text-slate-700">
                      {bin.count}
                    </span>
                  </div>
                );
              })}
            </div>

            {analysis.topicAnalysis.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-700">Penguasaan per Materi</p>
                {analysis.topicAnalysis.map((t) => (
                  <div key={t.topic} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{t.topic}</span>
                    <span className="font-mono-tabular font-bold text-teal-700">
                      {t.masteryPercent}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold text-base text-slate-900">
              Analisis Butir Soal &amp; Indikator
            </h3>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {analysis.questionStats.map((qs) => (
                <div key={qs.questionId} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Soal #{qs.number}</span>
                    <span className="font-mono-tabular text-slate-600">
                      Benar {qs.correctPercent}% · Salah {qs.wrongPercent}% · Kosong{' '}
                      {qs.unansweredPercent}%
                    </span>
                  </div>
                  <p className="text-slate-600 truncate">{qs.prompt}</p>
                  <p className="text-[11px] text-slate-500">Indikator: {qs.indicator}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Rubric Grading & Essay Review Modal */}
      {gradingTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Penilaian Uraian &amp; Pemeriksaan Jawaban — {gradingStudentName}
                </h3>
                <p className="text-xs text-slate-500">
                  Kelas {gradingGradeClass} · Berikan skor uraian (0 sampai bobot maksimal) dan catatan umpan balik
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradingTargetId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {gradingQuestions.map((q, idx) => {
                const ansVal = gradingAnswersMap[q.id] || '';
                const isEssay = q.type === 'essay';
                const maxWeight = typeof q.weight === 'number' && q.weight >= 0 ? q.weight : 10;

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      isEssay ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="font-bold text-slate-900">
                        Soal #{idx + 1} · {q.type === 'essay' ? 'Uraian (Wajib Koreksi Guru)' : q.type}
                      </span>
                      <span className="font-mono-tabular font-semibold">
                        Bobot Maks: {maxWeight}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-slate-900">{q.prompt}</p>

                    <div className="text-xs bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-800 whitespace-pre-wrap">
                      <span className="font-semibold text-slate-600 block mb-1">
                        Jawaban Siswa:
                      </span>
                      {ansVal.trim() ? ansVal : '(Tidak dijawab)'}
                    </div>

                    {(q.rubric || q.correctAnswer) && (
                      <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                        <span className="font-semibold block mb-0.5">Kunci / Rubrik Penilaian:</span>
                        {q.rubric || q.correctAnswer}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Skor Manual (0–{maxWeight})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={maxWeight}
                          step="0.5"
                          value={manualScoresDraft[q.id] ?? ''}
                          placeholder={isEssay ? 'Isi skor...' : 'Otomatis'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualScoresDraft((prev) => ({
                              ...prev,
                              [q.id]: val,
                            }));
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-tabular"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Catatan / Umpan Balik Guru (Opsional)
                        </label>
                        <input
                          type="text"
                          value={manualCommentsDraft[q.id] ?? ''}
                          placeholder="Contoh: Langkah penulisan sudah runtut..."
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualCommentsDraft((prev) => ({
                              ...prev,
                              [q.id]: val,
                            }));
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {gradingAuditTrail.length > 0 && (
                <div className="border-t border-slate-200 pt-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    Riwayat Penilaian &amp; Audit
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs text-slate-600">
                    {gradingAuditTrail.map((entry, idx) => (
                      <div
                        key={`${entry.at}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-lg"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">{entry.action}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span>{entry.detail}</span>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-slate-500">
                          {entry.actorName || entry.actorId} ·{' '}
                          {new Date(entry.at).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setGradingTargetId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={isSavingManualGrade}
                onClick={() => void handleSaveManualGrade()}
                className="px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {isSavingManualGrade ? 'Menghitung...' : 'Simpan Nilai & Hitung Ulang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

