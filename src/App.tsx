import { Suspense, lazy, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AdventureLoading } from './components/adventure';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentAdventureRunner } from './components/StudentAdventureRunner';
import { StudentIntroScreen } from './components/StudentIntroScreen';
import {
  EntryChoicePage,
  GuidePage,
  LandingPage,
  StudentDashboardPage,
  StudentLoginPage,
  type StudentEntrySubmitPayload,
} from './components/pages';

const TeacherDashboard = lazy(() =>
  import('./components/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard }))
);
import type { ResolvedWorldState } from './data/worldStatusConfig';
import { audioEngine } from './lib/audioEngine';
import { auth, db } from './lib/firebase';
import {
  ApiClientError,
  enterStudentExam,
  fetchStudentDashboardViaApi,
  fetchStudentExamSession,
  fetchStudentProfileViaApi,
  startStudentExam,
  type StudentExamIntroInfo,
  type StudentSessionPayloadResponse,
} from './services/apiClient';
import {
  clearLocalActiveSession,
  createStudentSession,
  getCompletedWorldsLocally,
  getLocalSessionSnapshot,
  getPublicQuestionsForAssessment,
  getSessionAnswersByIds,
  getSessionById,
  logoutStudentSessionWithBackend,
  saveLocalSessionSnapshot,
  subscribeClasses,
  subscribePublicAssessments,
  validateStudentAccessWithBackend,
} from './services/firestoreService';
import {
  DEFAULT_SCHOOL_ID,
  type AccessibilityPreferences,
  type AssessmentSession,
  type ClassRoom,
  type ExplorerCharacterId,
  type PublicAssessment,
  type PublicQuestion,
} from './types/psas';

type AppViewMode =
  | 'landing'
  | 'entry_choice'
  | 'student_login'
  | 'student_dashboard'
  | 'guide'
  | 'student_intro'
  | 'student_runner'
  | 'teacher_dashboard';

const STUDENT_TOKEN_STORAGE_KEY = 'psas_student_session_token';

function readStoredStudentToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(STUDENT_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredStudentToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.sessionStorage.setItem(STUDENT_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(STUDENT_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function App() {
  const [viewMode, setViewMode] = useState<AppViewMode>('landing');
  const [studentLoginBackTarget, setStudentLoginBackTarget] = useState<
    'landing' | 'entry_choice' | 'student_dashboard'
  >('entry_choice');
  const [teacherBackTarget, setTeacherBackTarget] = useState<'landing' | 'entry_choice'>('landing');
  const [selectedWorldContext, setSelectedWorldContext] = useState<{
    worldTitle?: string;
    subjectName?: string;
    identityMode?: string;
  } | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [publicAssessments, setPublicAssessments] = useState<PublicAssessment[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [completedWorlds, setCompletedWorlds] = useState(() => getCompletedWorldsLocally());
  const [recoverableSnapshot, setRecoverableSnapshot] = useState(() =>
    getLocalSessionSnapshot()
  );

  const [activeCharacterId, setActiveCharacterId] = useState<ExplorerCharacterId>('boy');
  // Signed HMAC student token held in memory + sessionStorage (never localStorage) for F5 resilience
  const [studentSessionToken, setStudentSessionToken] = useState<string | null>(() =>
    readStoredStudentToken()
  );

  const [prefs, setPrefs] = useState<AccessibilityPreferences>(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return {
      animationsEnabled: !prefersReduced,
      soundEffectsEnabled: true,
      musicEnabled: false,
      reducedMotion: Boolean(prefersReduced),
    };
  });

  // Active student adventure state
  const [activeAssessment, setActiveAssessment] = useState<PublicAssessment | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<PublicQuestion[]>([]);
  const [activeSession, setActiveSession] = useState<AssessmentSession | null>(null);
  const [activeAnswers, setActiveAnswers] = useState<Record<string, string>>({});
  const [examIntroInfo, setExamIntroInfo] = useState<StudentExamIntroInfo | null>(null);
  const [isStartingExam, setIsStartingExam] = useState(false);
  const [startExamError, setStartExamError] = useState('');
  const [examRunnerMeta, setExamRunnerMeta] = useState<{
    flaggedIds?: string[];
    serverNowAt?: string;
    examMeta?: StudentSessionPayloadResponse['exam'];
  }>({});
  const [pendingEntry, setPendingEntry] = useState<{
    sessionId: string;
    studentId: string;
    studentName: string;
    classId: string;
    gradeClass: string;
    participantNumber?: string;
    characterId: ExplorerCharacterId;
  } | null>(null);

  useEffect(() => {
    audioEngine.setPreferences(prefs.soundEffectsEnabled, prefs.musicEnabled);
  }, [prefs]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    const unsubAssessments = subscribePublicAssessments(setPublicAssessments);
    const unsubClasses = subscribeClasses(setClasses);
    return () => {
      unsubAuth();
      unsubAssessments();
      unsubClasses();
    };
  }, []);

  // Hydrate student session from sessionStorage across page refresh (F5)
  useEffect(() => {
    const storedToken = readStoredStudentToken();
    if (!storedToken) return;
    let cancelled = false;

    async function restoreStudentState(token: string) {
      try {
        const [profile, dashboard] = await Promise.all([
          fetchStudentProfileViaApi(token),
          fetchStudentDashboardViaApi(token),
        ]);
        if (cancelled) return;

        setStudentSessionToken(token);
        setActiveCharacterId(profile.characterId);
        setPendingEntry({
          sessionId: profile.sessionId,
          studentId: profile.studentId,
          studentName: profile.studentName,
          classId: profile.classId,
          gradeClass: profile.gradeClass,
          participantNumber: profile.participantNumber || undefined,
          characterId: profile.characterId,
        });

        const matchedAsm =
          dashboard.publicAssessments.find((a) => a.id === profile.assessmentId) || null;
        if (matchedAsm) {
          setActiveAssessment(matchedAsm);
        }

        if (dashboard.activeSession && dashboard.activeSession.status === 'in_progress') {
          try {
            const payload = await fetchStudentExamSession(token, dashboard.activeSession.id);
            if (cancelled) return;
            const localSnap = getLocalSessionSnapshot(payload.session.id);
            const mergedAnswers = {
              ...(payload.savedAnswers || {}),
              ...(localSnap?.answersMap || {}),
            };
            if (matchedAsm) {
              setActiveAssessment(matchedAsm);
            }
            setActiveQuestions(payload.questions);
            setActiveSession(payload.session);
            setActiveAnswers(mergedAnswers);
            setExamRunnerMeta({
              flaggedIds: payload.flaggedIds || [],
              serverNowAt: payload.serverNowAt,
              examMeta: payload.exam,
            });
            saveLocalSessionSnapshot(payload.session, mergedAnswers);
            setViewMode('student_runner');
            return;
          } catch {
            // Fall through to student dashboard
          }
        }

        setViewMode('student_dashboard');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          writeStoredStudentToken(null);
          setStudentSessionToken(null);
        }
      }
    }

    void restoreStudentState(storedToken);
    return () => {
      cancelled = true;
    };
  }, []);

  async function openExamIntro(assessment: PublicAssessment, tokenOverride?: string | null) {
    setActiveAssessment(assessment);
    setStartExamError('');
    setExamIntroInfo(null);
    setViewMode('student_intro');

    const token = tokenOverride !== undefined ? tokenOverride : studentSessionToken;
    if (!token) return;
    try {
      const res = await enterStudentExam(token, assessment.id);
      setExamIntroInfo(res.examInfo);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setStartExamError(err.message);
      }
    }
  }

  async function handleSubmitStudentEntry(payload: StudentEntrySubmitPayload) {
    const validated = await validateStudentAccessWithBackend({
      schoolId: DEFAULT_SCHOOL_ID,
      classId: payload.classId,
      gradeClass: payload.gradeClass,
      studentName: payload.studentName,
      examCode: payload.examCode,
      participantNumber: payload.participantNumber,
      characterId: payload.characterId,
    });

    const loadedQuestions = await getPublicQuestionsForAssessment(validated.assessment.id);
    if (loadedQuestions.length === 0 && !validated.token) {
      throw new Error('Dunia ini belum memiliki soal yang dipublikasikan oleh guru.');
    }

    writeStoredStudentToken(validated.token || null);
    setStudentSessionToken(validated.token || null);
    setActiveCharacterId(validated.characterId);
    setStartExamError('');
    setExamIntroInfo(null);
    setExamRunnerMeta({});
    setPendingEntry({
      sessionId: validated.sessionId,
      studentId: validated.studentId,
      studentName: validated.studentName,
      classId: validated.classId,
      gradeClass: validated.gradeClass,
      participantNumber: validated.participantNumber,
      characterId: validated.characterId,
    });

    if (validated.resumingSession && validated.resumingSession.status === 'in_progress') {
      if (validated.token) {
        try {
          const sessionPayload = await fetchStudentExamSession(
            validated.token,
            validated.resumingSession.id
          );
          const localSnap = getLocalSessionSnapshot(sessionPayload.session.id);
          const mergedAnswers = {
            ...(sessionPayload.savedAnswers || {}),
            ...(localSnap?.answersMap || {}),
          };
          setActiveAssessment(validated.assessment);
          setActiveQuestions(sessionPayload.questions);
          setActiveSession(sessionPayload.session);
          setActiveAnswers(mergedAnswers);
          setExamRunnerMeta({
            flaggedIds: sessionPayload.flaggedIds || [],
            serverNowAt: sessionPayload.serverNowAt,
            examMeta: sessionPayload.exam,
          });
          setViewMode('student_dashboard');
          return;
        } catch {
          // Fallback to Firestore answers if backend session fetch fails
        }
      }

      const remoteAnswers = await getSessionAnswersByIds(
        validated.resumingSession.id,
        loadedQuestions.map((q) => q.id)
      );
      const localSnap = getLocalSessionSnapshot(validated.resumingSession.id);
      const mergedAnswers = { ...remoteAnswers, ...(localSnap?.answersMap || {}) };

      setActiveAssessment(validated.assessment);
      setActiveQuestions(loadedQuestions);
      setActiveSession(validated.resumingSession);
      setActiveAnswers(mergedAnswers);
      setViewMode('student_dashboard');
      return;
    }

    const preparedQuestions = loadedQuestions.map((q) => {
      if (validated.assessment.shuffleOptions && q.options && q.options.length > 1) {
        return { ...q, options: shuffleArray(q.options) };
      }
      return q;
    });

    const finalOrder = validated.assessment.shuffleQuestions
      ? shuffleArray(preparedQuestions)
      : preparedQuestions;

    setActiveAssessment(validated.assessment);
    setActiveQuestions(finalOrder);
    setActiveSession(null);
    setActiveAnswers({});
    setViewMode('student_dashboard');
  }

  async function handleStartAdventureFromIntro() {
    if (!activeAssessment || !pendingEntry || isStartingExam) return;
    setStartExamError('');
    setIsStartingExam(true);

    try {
      if (studentSessionToken) {
        const started = await startStudentExam(studentSessionToken, activeAssessment.id);
        const localSnap = getLocalSessionSnapshot(started.session.id);
        const mergedAnswers = {
          ...(started.savedAnswers || {}),
          ...(localSnap?.answersMap || {}),
        };
        saveLocalSessionSnapshot(started.session, mergedAnswers);
        setActiveSession(started.session);
        setActiveQuestions(started.questions);
        setActiveAnswers(mergedAnswers);
        setExamRunnerMeta({
          flaggedIds: started.flaggedIds || [],
          serverNowAt: started.serverNowAt,
          examMeta: started.exam,
        });
        setRecoverableSnapshot(null);
        setViewMode('student_runner');
        return;
      }

      if (activeQuestions.length === 0) {
        throw new Error('Dunia ini belum memiliki soal yang dipublikasikan oleh guru.');
      }

      const questionOrder = activeQuestions.map((q) => q.id);

      const newSession: AssessmentSession = {
        id: pendingEntry.sessionId,
        schoolId: activeAssessment.schoolId || DEFAULT_SCHOOL_ID,
        assessmentId: activeAssessment.id,
        subjectId: activeAssessment.subjectId,
        classId: pendingEntry.classId,
        studentId: pendingEntry.studentId,
        mode: activeAssessment.mode,
        studentName: pendingEntry.studentName,
        gradeClass: pendingEntry.gradeClass,
        participantNumber: pendingEntry.participantNumber,
        characterId: pendingEntry.characterId,
        status: 'in_progress',
        currentIndex: 0,
        answeredIds: [],
        questionOrder,
        totalQuestions: activeQuestions.length,
        progressPercent: 0,
        checkpointsUnlocked: 0,
        artifactsEarned: [],
        starsEarned: 0,
        startedAt: new Date().toISOString(),
      };

      await createStudentSession(newSession);
      saveLocalSessionSnapshot(newSession, {});

      setActiveSession(newSession);
      setActiveAnswers({});
      setExamRunnerMeta({});
      setRecoverableSnapshot(null);
      setViewMode('student_runner');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal memulai sesi asesmen. Silakan coba lagi.';
      setStartExamError(msg);
    } finally {
      setIsStartingExam(false);
    }
  }

  async function handleResumeRecoverableSession() {
    if (!recoverableSnapshot) return;
    const { session, answersMap } = recoverableSnapshot;

    let matchingAsm = publicAssessments.find((a) => a.id === session.assessmentId);
    if (!matchingAsm) {
      const snap = await getDoc(doc(db, 'publicAssessments', session.assessmentId));
      if (snap.exists()) {
        matchingAsm = snap.data() as PublicAssessment;
      }
    }

    if (!matchingAsm) {
      clearLocalActiveSession(session.id);
      setRecoverableSnapshot(null);
      return;
    }

    if (studentSessionToken) {
      try {
        const payload = await fetchStudentExamSession(studentSessionToken, session.id);
        const mergedAnswers = { ...(payload.savedAnswers || {}), ...answersMap };
        setActiveAssessment(matchingAsm);
        setActiveQuestions(payload.questions);
        setActiveSession(payload.session);
        setActiveAnswers(mergedAnswers);
        setExamRunnerMeta({
          flaggedIds: payload.flaggedIds || [],
          serverNowAt: payload.serverNowAt,
          examMeta: payload.exam,
        });
        setViewMode('student_runner');
        return;
      } catch {
        // Fallback below
      }
    }

    const [questions, remoteSession] = await Promise.all([
      getPublicQuestionsForAssessment(matchingAsm.id),
      getSessionById(session.id),
    ]);

    const resolvedSession = remoteSession || session;
    if (resolvedSession.status !== 'in_progress') {
      clearLocalActiveSession(session.id);
      setRecoverableSnapshot(null);
      return;
    }

    const remoteAnswers = await getSessionAnswersByIds(
      resolvedSession.id,
      resolvedSession.answeredIds || []
    );

    const mergedAnswers = { ...remoteAnswers, ...answersMap };

    setActiveAssessment(matchingAsm);
    setActiveQuestions(questions);
    setActiveSession(resolvedSession);
    setActiveAnswers(mergedAnswers);
    setExamRunnerMeta({});
    setPendingEntry({
      sessionId: resolvedSession.id,
      studentId: resolvedSession.studentId || '',
      studentName: resolvedSession.studentName,
      classId: resolvedSession.classId || '',
      gradeClass: resolvedSession.gradeClass,
      participantNumber: resolvedSession.participantNumber,
      characterId: resolvedSession.characterId || activeCharacterId,
    });
    if (resolvedSession.characterId) {
      setActiveCharacterId(resolvedSession.characterId);
    }
    setViewMode('student_runner');
  }

  function handleContinueStudentAdventure() {
    if (activeSession && activeSession.status === 'in_progress' && activeAssessment) {
      setViewMode('student_runner');
      return;
    }
    if (activeAssessment && pendingEntry) {
      void openExamIntro(activeAssessment);
    }
  }

  function handleEnterWorldFromStudentDashboard(item: ResolvedWorldState) {
    if (activeAssessment && item.assessment?.id === activeAssessment.id) {
      handleContinueStudentAdventure();
      return;
    }
    if (
      recoverableSnapshot &&
      recoverableSnapshot.session.subjectId === item.world.id &&
      recoverableSnapshot.session.status === 'in_progress'
    ) {
      void handleResumeRecoverableSession();
      return;
    }
    setSelectedWorldContext({
      worldTitle: item.world.worldName,
      subjectName: item.world.subjectName,
      identityMode: item.assessment?.identityMode,
    });
    setStudentLoginBackTarget('student_dashboard');
    setViewMode('student_login');
  }

  function handleLogoutStudent() {
    audioEngine.stopSpeech();
    void logoutStudentSessionWithBackend(studentSessionToken);
    writeStoredStudentToken(null);
    setStudentSessionToken(null);
    setPendingEntry(null);
    setActiveAssessment(null);
    setActiveQuestions([]);
    setActiveSession(null);
    setActiveAnswers({});
    setExamIntroInfo(null);
    setExamRunnerMeta({});
    setStartExamError('');
    setViewMode('landing');
  }

  function handleExitRunnerToMap() {
    audioEngine.stopSpeech();
    setCompletedWorlds(getCompletedWorldsLocally());
    setRecoverableSnapshot(getLocalSessionSnapshot());
    setActiveSession(null);
    setActiveAssessment(null);
    setActiveQuestions([]);
    setExamIntroInfo(null);
    setExamRunnerMeta({});
    setViewMode(pendingEntry ? 'student_dashboard' : 'landing');
  }

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion={prefs.reducedMotion ? 'always' : 'user'}>
        {viewMode === 'teacher_dashboard' ? (
          <Suspense
            fallback={
              <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <AdventureLoading
                  label="Memuat Portal Guru & Admin..."
                  sublabel="Menyiapkan instrumen pengelolaan soal dan analisis hasil."
                />
              </div>
            }
          >
            <TeacherDashboard
              currentUser={currentUser}
              prefs={prefs}
              onUpdatePrefs={setPrefs}
              onOpenGuide={() => setViewMode('guide')}
              onBackFromLogin={() => setViewMode(teacherBackTarget)}
              onExitToStudent={() => setViewMode('landing')}
            />
          </Suspense>
        ) : viewMode === 'entry_choice' ? (
          <EntryChoicePage
            activeCharacterId={activeCharacterId}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            onChooseStudent={() => {
              setSelectedWorldContext(null);
              setStudentLoginBackTarget('entry_choice');
              setViewMode('student_login');
            }}
            onChooseTeacher={() => {
              setTeacherBackTarget('entry_choice');
              setViewMode('teacher_dashboard');
            }}
            onOpenGuide={() => setViewMode('guide')}
            onBackHome={() => setViewMode('landing')}
          />
        ) : viewMode === 'student_login' ? (
          <StudentLoginPage
            classes={classes}
            activeCharacterId={activeCharacterId}
            initialWorldContext={selectedWorldContext}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            onChangeCharacter={setActiveCharacterId}
            onSubmitStudentEntry={handleSubmitStudentEntry}
            onBack={() => setViewMode(studentLoginBackTarget)}
            onBackHome={() => setViewMode('landing')}
            onOpenGuide={() => setViewMode('guide')}
            onOpenTeacherPortal={() => {
              setTeacherBackTarget('landing');
              setViewMode('teacher_dashboard');
            }}
          />
        ) : viewMode === 'student_dashboard' && pendingEntry ? (
          <StudentDashboardPage
            student={{
              studentId: pendingEntry.studentId,
              studentName: pendingEntry.studentName,
              classId: pendingEntry.classId,
              gradeClass: pendingEntry.gradeClass,
              participantNumber: pendingEntry.participantNumber,
              characterId: pendingEntry.characterId,
            }}
            studentToken={studentSessionToken}
            publicAssessments={publicAssessments}
            completedWorlds={completedWorlds}
            activeAssessment={activeAssessment}
            activeSession={activeSession}
            recoverableSession={recoverableSnapshot?.session || null}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            onUpdateCharacter={(nextId) => {
              setActiveCharacterId(nextId);
              setPendingEntry((prev) => (prev ? { ...prev, characterId: nextId } : prev));
            }}
            onContinueActiveAdventure={handleContinueStudentAdventure}
            onEnterWorldFromMap={handleEnterWorldFromStudentDashboard}
            onOpenGuide={() => setViewMode('guide')}
            onBackHome={() => setViewMode('landing')}
            onLogoutStudent={handleLogoutStudent}
          />
        ) : viewMode === 'guide' ? (
          <GuidePage
            activeCharacterId={activeCharacterId}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            onStartAdventure={() =>
              setViewMode(pendingEntry ? 'student_dashboard' : 'entry_choice')
            }
            onOpenTeacherPortal={() => {
              setTeacherBackTarget('landing');
              setViewMode('teacher_dashboard');
            }}
            onBackHome={() => setViewMode(pendingEntry ? 'student_dashboard' : 'landing')}
          />
        ) : viewMode === 'student_intro' && activeAssessment && pendingEntry ? (
          <StudentIntroScreen
            assessment={activeAssessment}
            examInfo={examIntroInfo}
            studentName={pendingEntry.studentName}
            gradeClass={pendingEntry.gradeClass}
            characterId={pendingEntry.characterId}
            isStarting={isStartingExam}
            startError={startExamError}
            onStartAdventure={() => void handleStartAdventureFromIntro()}
            onBack={() => setViewMode('student_dashboard')}
          />
        ) : viewMode === 'student_runner' && activeAssessment && activeSession ? (
          <StudentAdventureRunner
            assessment={activeAssessment}
            questions={activeQuestions}
            initialSession={activeSession}
            initialAnswers={activeAnswers}
            initialFlaggedIds={examRunnerMeta.flaggedIds}
            serverNowAt={examRunnerMeta.serverNowAt}
            examMeta={examRunnerMeta.examMeta}
            studentToken={studentSessionToken}
            prefs={prefs}
            onSessionCompleted={() => {
              setCompletedWorlds(getCompletedWorldsLocally());
            }}
            onExitToMap={handleExitRunnerToMap}
          />
        ) : (
          <LandingPage
            publicAssessments={publicAssessments}
            completedWorlds={completedWorlds}
            recoverableSession={
              recoverableSnapshot
                ? { session: recoverableSnapshot.session, savedAt: recoverableSnapshot.savedAt }
                : null
            }
            activeCharacterId={activeCharacterId}
            activeStudentLabel={
              pendingEntry
                ? { studentName: pendingEntry.studentName, gradeClass: pendingEntry.gradeClass }
                : null
            }
            isStudentLoggedIn={Boolean(pendingEntry)}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            onChangeCharacter={setActiveCharacterId}
            onStartAdventureChoice={() => setViewMode('entry_choice')}
            onOpenStudentDashboard={() => setViewMode('student_dashboard')}
            onEnterWorldDirectly={(item) => {
              if (pendingEntry) {
                handleEnterWorldFromStudentDashboard(item);
                return;
              }
              setSelectedWorldContext({
                worldTitle: item.world.worldName,
                subjectName: item.world.subjectName,
                identityMode: item.assessment?.identityMode,
              });
              setStudentLoginBackTarget('landing');
              setViewMode('student_login');
            }}
            onOpenGuide={() => setViewMode('guide')}
            onOpenTeacherPortal={() => {
              setTeacherBackTarget('landing');
              setViewMode('teacher_dashboard');
            }}
            onResumeSession={() => void handleResumeRecoverableSession()}
            onDiscardRecoverable={() => {
              if (recoverableSnapshot) clearLocalActiveSession(recoverableSnapshot.session.id);
              setRecoverableSnapshot(null);
            }}
          />
        )}
      </MotionConfig>
    </ErrorBoundary>
  );
}
