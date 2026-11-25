import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  FIREBASE_DATABASE_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  isBootstrapAdminEmail,
  isFirebaseServerConfigured,
  verifyFirebaseIdToken,
  type VerifiedFirebaseUser,
} from './server/firebaseAdmin.js';
import {
  FirestoreRestError,
  fsCheckConnectivity,
  fsCommitWrites,
  fsGetDoc,
  fsListCollection,
  fsRunEqualityQuery,
  fsRunInQuery,
} from './server/firestoreRest.js';
import {
  checkRateLimit,
  clearFailedAttempts,
  getClientIpKey,
  peekFailedAttempts,
  recordFailedAttempt,
} from './server/rateLimiter.js';
import {
  buildStudentBaseCampPayload,
  completeCheckpointForStudent,
  deactivateCheckpointByTeacher,
  ensureStudentProfileOnLogin,
  getAdminGamificationConfigEngine,
  getStudentAdventureCharacter,
  getStudentBadgesView,
  getStudentXpAndHistory,
  getTeacherAdventureOverview,
  getTeacherAdventureProgressReport,
  getWorldDetailForStudent,
  openWorldForStudent,
  recordExamCompletedHook,
  saveStudentAdventureCharacter,
  startCheckpointForStudent,
  syncDefaultAdventureCatalogToFirestore,
  updateAdminGamificationConfigEngine,
  updateWorldConfigByTeacher,
  upsertCheckpointByTeacher,
  type StudentActorContext,
} from './server/adventureEngine.js';
import { getAdventureStateSnapshot } from './server/adventureStore.js';
import {
  buildEnhancedItemAnalysis,
  buildStage5Report,
  type ClientAssessmentInput,
  type ClientClassRoom,
  type ClientQuestionInput,
  type ClientResultInput,
  type ClientRosterStudent,
  type ClientSessionAnswerInput,
  type ReportingFilters,
} from './server/reportingEngine.js';
import {
  getAssessmentStateSnapshot,
  type ExamQuestionRecord,
  type ExamRecord,
} from './server/assessmentStore.js';
import {
  addOrAttachQuestionsToExamEngine,
  defaultScoringPolicy,
  deleteOrArchiveQuestionBankItemEngine,
  duplicateQuestionBankItemEngine,
  enterExamForStudentEngine,
  evaluateSingleQuestionStage3,
  getExamDetailForTeacherEngine,
  getQuestionBankItemEngine,
  getStudentResultsHistoryEngine,
  getStudentSessionPayloadEngine,
  getStudentSessionStatusEngine,
  getSubmissionDetailForTeacherEngine,
  getTeacherExamResultsEngine,
  gradeEssaySubmissionEngine,
  listExamsForTeacherEngine,
  listQuestionBankItemsEngine,
  removeExamQuestionEngine,
  saveStudentAnswerEngine,
  startExamForStudentEngine,
  submitStudentExamEngine,
  syncExamFromTeacherClient,
  toggleStudentQuestionFlagEngine,
  transitionExamStatusEngine,
  upsertExamEngine,
  upsertQuestionBankItemEngine,
} from './server/assessmentEngine.js';
import {
  cancelImportBatchEngine,
  createImportBatchEngine,
  extractImportBatchEngine,
  getImportBatchEngine,
  getTempAssetBufferEngine,
  isGeminiImportConfigured,
  listImportBatchesEngine,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_FILES_PER_BATCH,
  saveImportBatchToBankEngine,
  updateImportCandidatesEngine,
  uploadFilesToImportBatchEngine,
} from './server/aiImportEngine.js';
import { pruneExpiredImportTempFiles } from './server/importStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SCHOOL_ID = 'sdn_pekiringan';
const DEFAULT_SCHOOL_NAME = 'SDN Pekiringan';

const STUDENT_SESSION_SECRET =
  process.env.STUDENT_SESSION_SECRET && process.env.STUDENT_SESSION_SECRET.trim().length >= 16
    ? process.env.STUDENT_SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

interface ScoringQuestionInput {
  id: string;
  type: string;
  weight: number;
  topic?: string;
  indicator?: string;
  prompt?: string;
}

interface ScoringKeyInput {
  questionId: string;
  type: string;
  correctAnswer: string;
  acceptedVariations?: string[];
  weight: number;
}

interface ScoringAnswerInput {
  questionId: string;
  answerValue: string;
  isAnswered: boolean;
}

interface QuestionOutcome {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  status: 'correct' | 'partial' | 'wrong' | 'unanswered' | 'manual_pending';
}

interface StudentTokenPayload {
  jti: string;
  sessionId: string;
  schoolId: string;
  assessmentId: string;
  subjectId: string;
  classId: string;
  gradeClass: string;
  studentId: string;
  studentName: string;
  participantNumber?: string;
  characterId: 'boy' | 'girl';
  iat: number;
  exp: number;
}

interface StaffAuthContext {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'teacher';
  schoolId: string;
  isActive: boolean;
  idToken: string;
}

interface AuthenticatedRequest extends Request {
  staffAuth?: StaffAuthContext;
  studentAuth?: StudentActorContext;
  studentTokenPayload?: StudentTokenPayload;
}

// In-memory revocation list for logged-out student HMAC session tokens (jti -> exp timestamp)
const revokedStudentTokenJtis = new Map<string, number>();

function pruneRevokedTokens() {
  const now = Date.now();
  for (const [jti, exp] of revokedStudentTokenJtis.entries()) {
    if (now > exp) revokedStudentTokenJtis.delete(jti);
  }
}

function revokeStudentToken(payload: StudentTokenPayload) {
  pruneRevokedTokens();
  if (payload.jti) {
    revokedStudentTokenJtis.set(payload.jti, payload.exp);
  }
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
  return cleaned || `id_${Date.now()}`;
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sha256Prefix(input: string, len = 40): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

function hashExamCode(schoolId: string, code: string): string {
  return `code_${sha256Prefix(`${schoolId.trim().toLowerCase()}:${code.trim().toUpperCase()}`, 40)}`;
}

function hashStudentLookup(
  schoolId: string,
  classId: string,
  studentName: string,
  participantNumber?: string
): string {
  const cleanSchool = schoolId.trim().toLowerCase();
  const cleanClass = classId.trim().toLowerCase();
  const cleanName = normalizeText(studentName);
  const cleanPart = participantNumber ? normalizeText(participantNumber) : '';
  const payload = cleanPart
    ? `${cleanSchool}:${cleanClass}:${cleanName}:${cleanPart}`
    : `${cleanSchool}:${cleanClass}:${cleanName}`;
  return `stu_${sha256Prefix(payload, 40)}`;
}

function signStudentToken(payload: StudentTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', STUDENT_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `psas_tok_v1.${encoded}.${sig}`;
}

function verifyStudentToken(token: string): StudentTokenPayload | null {
  if (typeof token !== 'string' || !token.startsWith('psas_tok_v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', STUDENT_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StudentTokenPayload;
    if (!decoded || typeof decoded.exp !== 'number' || Date.now() > decoded.exp) {
      return null;
    }
    if (decoded.jti && revokedStudentTokenJtis.has(decoded.jti)) {
      return null;
    }
    if (!decoded.studentId || !decoded.sessionId || !decoded.assessmentId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

async function resolveStaffContext(
  verified: VerifiedFirebaseUser,
  idToken: string
): Promise<{ ok: true; staff: StaffAuthContext } | { ok: false; status: number; code: string; message: string }> {
  try {
    const [adminDoc, teacherDoc, userDoc] = await Promise.all([
      fsGetDoc<{ uid?: string; schoolId?: string; displayName?: string }>(`admins/${verified.uid}`, idToken),
      fsGetDoc<{ uid?: string; schoolId?: string; displayName?: string; role?: string; isActive?: boolean }>(
        `teachers/${verified.uid}`,
        idToken
      ),
      fsGetDoc<{ uid?: string; schoolId?: string; displayName?: string; role?: string; isActive?: boolean }>(
        `users/${verified.uid}`,
        idToken
      ),
    ]);

    if (adminDoc.exists) {
      return {
        ok: true,
        staff: {
          uid: verified.uid,
          email: verified.email,
          displayName: adminDoc.data?.displayName || verified.displayName,
          role: 'admin',
          schoolId: adminDoc.data?.schoolId || DEFAULT_SCHOOL_ID,
          isActive: true,
          idToken,
        },
      };
    }

    if (teacherDoc.exists) {
      if (teacherDoc.data?.isActive === false) {
        return {
          ok: false,
          status: 403,
          code: 'ACCOUNT_INACTIVE',
          message: 'Akun guru ini sedang dinonaktifkan oleh administrator sekolah.',
        };
      }
      const role: 'admin' | 'teacher' =
        teacherDoc.data?.role === 'admin' || isBootstrapAdminEmail(verified.email) ? 'admin' : 'teacher';
      return {
        ok: true,
        staff: {
          uid: verified.uid,
          email: verified.email,
          displayName: teacherDoc.data?.displayName || verified.displayName,
          role,
          schoolId: teacherDoc.data?.schoolId || DEFAULT_SCHOOL_ID,
          isActive: true,
          idToken,
        },
      };
    }

    if (userDoc.exists) {
      if (userDoc.data?.isActive === false) {
        return {
          ok: false,
          status: 403,
          code: 'ACCOUNT_INACTIVE',
          message: 'Akun pengguna ini sedang dinonaktifkan.',
        };
      }
      const role: 'admin' | 'teacher' =
        userDoc.data?.role === 'admin' || isBootstrapAdminEmail(verified.email) ? 'admin' : 'teacher';
      return {
        ok: true,
        staff: {
          uid: verified.uid,
          email: verified.email,
          displayName: userDoc.data?.displayName || verified.displayName,
          role,
          schoolId: userDoc.data?.schoolId || DEFAULT_SCHOOL_ID,
          isActive: true,
          idToken,
        },
      };
    }

    if (isBootstrapAdminEmail(verified.email)) {
      return {
        ok: true,
        staff: {
          uid: verified.uid,
          email: verified.email,
          displayName: verified.displayName || 'Administrator SDN Pekiringan',
          role: 'admin',
          schoolId: DEFAULT_SCHOOL_ID,
          isActive: true,
          idToken,
        },
      };
    }

    return {
      ok: false,
      status: 403,
      code: 'STAFF_NOT_REGISTERED',
      message: `Akun ${verified.email} belum terdaftar sebagai Guru atau Admin SDN Pekiringan.`,
    };
  } catch (err) {
    if (err instanceof FirestoreRestError) {
      return {
        ok: false,
        status: err.status === 401 || err.status === 403 ? 403 : 503,
        code: err.code,
        message: 'Gagal memverifikasi peran akun di Cloud Firestore.',
      };
    }
    return {
      ok: false,
      status: 503,
      code: 'FIRESTORE_UNREACHABLE',
      message: 'Cloud Firestore tidak dapat dihubungi saat memverifikasi akun.',
    };
  }
}

async function authenticateStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: 'Autentikasi diperlukan. Sertakan Firebase ID Token pada header Authorization.',
      code: 'UNAUTHENTICATED',
    });
    return;
  }

  const verification = await verifyFirebaseIdToken(token);
  if (verification.ok === false) {
    res.status(401).json({
      error: verification.reason,
      code: 'INVALID_FIREBASE_TOKEN',
    });
    return;
  }

  const resolved = await resolveStaffContext(verification.user, token);
  if (resolved.ok === false) {
    res.status(resolved.status).json({
      error: resolved.message,
      code: resolved.code,
    });
    return;
  }

  req.staffAuth = resolved.staff;
  next();
}

function authenticateStudent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const bearer = extractBearerToken(req);
  const payload = verifyStudentToken(bearer);
  if (!payload) {
    res.status(401).json({
      error: 'Sesi petualangan siswa belum terautentikasi atau telah kedaluwarsa.',
      code: 'STUDENT_UNAUTHENTICATED',
    });
    return;
  }
  req.studentTokenPayload = payload;
  req.studentAuth = {
    schoolId: payload.schoolId || DEFAULT_SCHOOL_ID,
    studentId: payload.studentId,
    studentName: payload.studentName,
    classId: payload.classId,
    gradeClass: payload.gradeClass,
    characterId: payload.characterId,
    subjectId: payload.subjectId,
  };
  next();
}

function requireRole(allowedRoles: Array<'admin' | 'teacher'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.staffAuth) {
      res.status(401).json({ error: 'Autentikasi diperlukan.', code: 'UNAUTHENTICATED' });
      return;
    }
    if (!allowedRoles.includes(req.staffAuth.role)) {
      res.status(403).json({
        error: 'Akses ditolak. Fitur ini khusus untuk Administrator sekolah.',
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }
    next();
  };
}

function handleFirestoreRouteError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof FirestoreRestError) {
    const status = err.status === 403 ? 403 : err.status === 404 ? 404 : 503;
    res.status(status).json({
      error: err.status === 403 ? 'Izin akses Firestore ditolak untuk akun ini.' : fallbackMessage,
      code: err.code,
    });
    return;
  }
  res.status(503).json({ error: fallbackMessage, code: 'BACKEND_SERVICE_ERROR' });
}

function evaluateSingleQuestion(
  q: ScoringQuestionInput,
  key: ScoringKeyInput | undefined,
  ans: ScoringAnswerInput | undefined,
  manualScoreOverride: number | undefined
): QuestionOutcome {
  const maxPoints = typeof q.weight === 'number' && q.weight >= 0 ? q.weight : 10;

  if (!ans || !ans.isAnswered || !ans.answerValue || ans.answerValue.trim() === '') {
    return {
      questionId: q.id,
      earnedPoints: 0,
      maxPoints,
      status: 'unanswered',
    };
  }

  if (typeof manualScoreOverride === 'number' && Number.isFinite(manualScoreOverride)) {
    const clamped = Math.max(0, Math.min(maxPoints, manualScoreOverride));
    return {
      questionId: q.id,
      earnedPoints: clamped,
      maxPoints,
      status: clamped >= maxPoints ? 'correct' : clamped > 0 ? 'partial' : 'wrong',
    };
  }

  if (q.type === 'essay') {
    return {
      questionId: q.id,
      earnedPoints: 0,
      maxPoints,
      status: 'manual_pending',
    };
  }

  if (!key) {
    return {
      questionId: q.id,
      earnedPoints: 0,
      maxPoints,
      status: 'wrong',
    };
  }

  const studentRaw = ans.answerValue;
  const correctRaw = key.correctAnswer || '';

  if (
    q.type === 'multiple_choice' ||
    q.type === 'true_false' ||
    q.type === 'image_choice' ||
    q.type === 'audio' ||
    q.type === 'illustrated'
  ) {
    const isCorrect = normalizeText(studentRaw) === normalizeText(correctRaw);
    return {
      questionId: q.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      status: isCorrect ? 'correct' : 'wrong',
    };
  }

  if (q.type === 'short_answer') {
    const normStudent = normalizeText(studentRaw);
    const candidates = [correctRaw, ...(Array.isArray(key.acceptedVariations) ? key.acceptedVariations : [])]
      .map(normalizeText)
      .filter(Boolean);
    const isCorrect = candidates.includes(normStudent);
    return {
      questionId: q.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      status: isCorrect ? 'correct' : 'wrong',
    };
  }

  if (q.type === 'multiple_select') {
    const studentArr = safeParseJson<string[]>(studentRaw, []).map(normalizeText).filter(Boolean).sort();
    const correctArr = safeParseJson<string[]>(correctRaw, []).map(normalizeText).filter(Boolean).sort();
    if (correctArr.length === 0) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    const exact = studentArr.length === correctArr.length && studentArr.every((v, idx) => v === correctArr[idx]);
    return {
      questionId: q.id,
      earnedPoints: exact ? maxPoints : 0,
      maxPoints,
      status: exact ? 'correct' : 'wrong',
    };
  }

  if (q.type === 'ordering') {
    const studentArr = safeParseJson<string[]>(studentRaw, []).map(normalizeText);
    const correctArr = safeParseJson<string[]>(correctRaw, []).map(normalizeText);
    if (correctArr.length === 0 || studentArr.length !== correctArr.length) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    let matchCount = 0;
    for (let i = 0; i < correctArr.length; i++) {
      if (studentArr[i] === correctArr[i]) matchCount++;
    }
    if (matchCount === correctArr.length) {
      return { questionId: q.id, earnedPoints: maxPoints, maxPoints, status: 'correct' };
    }
    const partial = Math.round((matchCount / correctArr.length) * maxPoints * 100) / 100;
    return {
      questionId: q.id,
      earnedPoints: partial,
      maxPoints,
      status: partial > 0 ? 'partial' : 'wrong',
    };
  }

  if (q.type === 'matching' || q.type === 'drag_drop') {
    const studentMap = safeParseJson<Record<string, string>>(studentRaw, {});
    const correctMap = safeParseJson<Record<string, string>>(correctRaw, {});
    const keys = Object.keys(correctMap);
    if (keys.length === 0) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    let matched = 0;
    for (const k of keys) {
      if (normalizeText(studentMap[k]) === normalizeText(correctMap[k])) {
        matched++;
      }
    }
    if (matched === keys.length) {
      return { questionId: q.id, earnedPoints: maxPoints, maxPoints, status: 'correct' };
    }
    const partial = Math.round((matched / keys.length) * maxPoints * 100) / 100;
    return {
      questionId: q.id,
      earnedPoints: partial,
      maxPoints,
      status: partial > 0 ? 'partial' : 'wrong',
    };
  }

  return {
    questionId: q.id,
    earnedPoints: 0,
    maxPoints,
    status: 'wrong',
  };
}

interface AccessLookupDoc {
  codeHash?: string;
  schoolId?: string;
  assessmentId?: string;
  subjectId?: string;
  classIds?: string[];
  status?: string;
  isLocked?: boolean;
  startsAt?: string;
  endsAt?: string;
  maxAttempts?: number;
  allowMultipleSessions?: boolean;
  identityMode?: string;
}

interface StudentLookupDoc {
  lookupId?: string;
  schoolId?: string;
  classId?: string;
  requiresParticipantNumber?: boolean;
  studentId?: string;
  displayName?: string;
  isActive?: boolean;
}

function validateAccessWindowAndClass(
  accessRecord: AccessLookupDoc,
  classId: string,
  gradeClass: string
): { ok: true } | { ok: false; code: string; message: string } {
  if (accessRecord.status !== 'active' || accessRecord.isLocked) {
    return {
      ok: false,
      code: 'ASSESSMENT_LOCKED',
      message: 'Portal ujian ini sedang ditutup atau dikunci sementara oleh guru.',
    };
  }

  const nowMs = Date.now();
  if (accessRecord.startsAt) {
    const startMs = Date.parse(accessRecord.startsAt);
    if (Number.isFinite(startMs) && nowMs < startMs) {
      return {
        ok: false,
        code: 'NOT_STARTED',
        message: 'Waktu petualangan untuk kode ujian ini belum dimulai.',
      };
    }
  }
  if (accessRecord.endsAt) {
    const endMs = Date.parse(accessRecord.endsAt);
    if (Number.isFinite(endMs) && nowMs > endMs) {
      return {
        ok: false,
        code: 'EXPIRED',
        message: 'Batas waktu pengerjaan untuk kode ujian ini sudah berakhir.',
      };
    }
  }

  if (Array.isArray(accessRecord.classIds) && accessRecord.classIds.length > 0) {
    const allowed = accessRecord.classIds.some(
      (c) => c.toLowerCase() === classId.toLowerCase() || c.toLowerCase() === gradeClass.toLowerCase()
    );
    if (!allowed) {
      return {
        ok: false,
        code: 'CLASS_NOT_ALLOWED',
        message: `Kode ujian ini tidak ditujukan untuk kelas ${gradeClass}.`,
      };
    }
  }

  return { ok: true };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'Format JSON pada permintaan tidak valid.',
        code: 'INVALID_JSON',
      });
      return;
    }
    next(err);
  });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Structured request logger for Cloud Run / server observability (never logs tokens or exam codes)
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      console.log(
        JSON.stringify({
          severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs,
          timestamp: new Date().toISOString(),
        })
      );
    });
    next();
  });

  // --- HEALTH ---
  app.get('/api/health', async (req, res) => {
    const includeDbCheck = req.query.checkDb !== 'false';
    const firestoreHealth = includeDbCheck
      ? await fsCheckConnectivity()
      : { online: isFirebaseServerConfigured };

    res.json({
      status: 'ok',
      service: 'psas-adventure-backend',
      schoolId: DEFAULT_SCHOOL_ID,
      schoolName: DEFAULT_SCHOOL_NAME,
      environment: process.env.NODE_ENV || 'development',
      firebaseConfigured: isFirebaseServerConfigured,
      firebaseProjectId: isFirebaseServerConfigured ? FIREBASE_PROJECT_ID : null,
      firestoreDatabaseId: isFirebaseServerConfigured ? FIREBASE_DATABASE_ID : null,
      firestoreConnected: firestoreHealth.online,
      firestoreDetail: firestoreHealth.detail || null,
      projectTier: 'starter_tier',
      adminSdkTokenVerifierReady: isFirebaseServerConfigured,
      bootstrapAdminEmail: BOOTSTRAP_ADMIN_EMAIL,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      timestamp: new Date().toISOString(),
    });
  });

  // --- STAFF / ADMIN / TEACHER IDENTITY ---
  app.get('/api/me', authenticateStaff, (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    res.json({
      uid: staff.uid,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role,
      schoolId: staff.schoolId,
      schoolName: DEFAULT_SCHOOL_NAME,
      isActive: staff.isActive,
    });
  });

  // --- PUBLIC SCHOOL CATALOG (No fake fallback data) ---
  app.get('/api/classes', async (req, res) => {
    const schoolId =
      typeof req.query.schoolId === 'string' && req.query.schoolId.trim()
        ? sanitizeId(req.query.schoolId.trim())
        : DEFAULT_SCHOOL_ID;
    try {
      const docs = await fsRunEqualityQuery<{
        id: string;
        schoolId: string;
        name: string;
        grade: string;
        academicYear?: string;
        homeroomTeacher?: string;
        isActive: boolean;
      }>('classes', [{ field: 'isActive', value: true }]);
      const items = docs
        .filter((c) => !c.schoolId || c.schoolId === schoolId)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      res.json({ schoolId, items });
    } catch (err) {
      handleFirestoreRouteError(res, err, 'Gagal memuat daftar kelas dari Cloud Firestore.');
    }
  });

  app.get('/api/subjects', async (req, res) => {
    const schoolId =
      typeof req.query.schoolId === 'string' && req.query.schoolId.trim()
        ? sanitizeId(req.query.schoolId.trim())
        : DEFAULT_SCHOOL_ID;
    try {
      const docs = await fsRunEqualityQuery<{
        id: string;
        schoolId: string;
        number: number;
        name: string;
        worldName: string;
        worldCode?: string;
        worldIcon?: string;
        worldColor?: string;
        description?: string;
        portalName?: string;
        isActive: boolean;
      }>('subjects', [{ field: 'isActive', value: true }]);
      const items = docs
        .filter((s) => !s.schoolId || s.schoolId === schoolId)
        .sort((a, b) => (a.number || 99) - (b.number || 99));
      res.json({ schoolId, items });
    } catch (err) {
      handleFirestoreRouteError(res, err, 'Gagal memuat daftar 10 dunia mata pelajaran dari Firestore.');
    }
  });

  // --- STAGE 1C AUTHORITATIVE STUDENT LOGIN (Server-side Firestore lookup + Rate Limit + HMAC Token) ---
  async function handleAuthoritativeStudentLogin(req: Request, res: Response) {
    const ipKey = getClientIpKey(req.headers, req.ip);
    // Allow 120 requests per 5 minutes per IP so an entire 35-student classroom on shared school Wi-Fi is never falsely blocked
    const generalLimit = checkRateLimit(`student_login_ip:${ipKey}`, 120, 5 * 60 * 1000);
    if (!generalLimit.allowed) {
      res.setHeader('Retry-After', String(generalLimit.retryAfterSeconds));
      res.status(429).json({
        valid: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds: generalLimit.retryAfterSeconds,
        message: `Terlalu banyak percobaan masuk. Tunggu sekitar ${generalLimit.retryAfterSeconds} detik sebelum mencoba lagi ya.`,
      });
      return;
    }

    const body = req.body as {
      schoolId?: unknown;
      classId?: unknown;
      gradeClass?: unknown;
      studentName?: unknown;
      examCode?: unknown;
      participantNumber?: unknown;
      characterId?: unknown;
    };

    const schoolId =
      typeof body?.schoolId === 'string' && body.schoolId.trim()
        ? sanitizeId(body.schoolId.trim())
        : DEFAULT_SCHOOL_ID;
    const classId = typeof body?.classId === 'string' ? body.classId.trim() : '';
    const gradeClass = typeof body?.gradeClass === 'string' ? body.gradeClass.trim() : '';
    const studentName = typeof body?.studentName === 'string' ? body.studentName.trim() : '';
    const examCode = typeof body?.examCode === 'string' ? body.examCode.trim().toUpperCase() : '';
    const participantNumber =
      typeof body?.participantNumber === 'string' ? body.participantNumber.trim() : '';
    const characterId: 'boy' | 'girl' = body?.characterId === 'girl' ? 'girl' : 'boy';

    if (!classId || !gradeClass) {
      res.status(400).json({ valid: false, code: 'MISSING_CLASS', message: 'Pilih kelasmu terlebih dahulu ya!' });
      return;
    }
    if (studentName.length < 2 || studentName.length > 120) {
      res.status(400).json({ valid: false, code: 'INVALID_NAME', message: 'Tuliskan nama lengkapmu minimal 2 huruf ya!' });
      return;
    }
    if (examCode.length < 2 || examCode.length > 32) {
      res.status(400).json({ valid: false, code: 'INVALID_CODE', message: 'Masukkan kode ujian dari gurumu dengan benar.' });
      return;
    }

    const failBucketKey = `student_fail:${ipKey}:${classId.toLowerCase()}`;
    const bruteGuard = peekFailedAttempts(failBucketKey, 6);
    if (!bruteGuard.allowed) {
      res.setHeader('Retry-After', String(bruteGuard.retryAfterSeconds));
      res.status(429).json({
        valid: false,
        code: 'TOO_MANY_FAILED_ATTEMPTS',
        retryAfterSeconds: bruteGuard.retryAfterSeconds,
        message: `Terlalu banyak percobaan kode ujian yang belum cocok. Tunggu ${bruteGuard.retryAfterSeconds} detik atau minta bantuan Bapak/Ibu Guru.`,
      });
      return;
    }

    try {
      const codeHash = hashExamCode(schoolId, examCode);
      const accessRes = await fsGetDoc<AccessLookupDoc>(`assessmentAccess/${codeHash}`);
      let accessRecord: AccessLookupDoc | undefined =
        accessRes.exists && accessRes.data ? accessRes.data : undefined;
      let pubAssessmentData: Record<string, unknown> | undefined;

      if (accessRecord?.assessmentId) {
        const pubRes = await fsGetDoc<Record<string, unknown>>(
          `publicAssessments/${sanitizeId(accessRecord.assessmentId)}`
        );
        if (pubRes.exists && pubRes.data) {
          pubAssessmentData = pubRes.data;
        }
      }

      // Stage 3 fallback: check local server assessmentStore if not yet mirrored to Firestore
      if (!accessRecord || !accessRecord.assessmentId || !pubAssessmentData) {
        const storeExam = Object.values(getAssessmentStateSnapshot().exams).find(
          (e) => e.schoolId === schoolId && e.codeHash === codeHash
        );
        if (storeExam) {
          accessRecord = {
            codeHash: storeExam.codeHash,
            schoolId: storeExam.schoolId,
            assessmentId: storeExam.id,
            subjectId: storeExam.subjectId,
            classIds: storeExam.classIds,
            status: storeExam.status,
            isLocked: storeExam.isLocked,
            startsAt: storeExam.startsAt,
            endsAt: storeExam.endsAt,
            maxAttempts: storeExam.maxAttempts,
            allowMultipleSessions: storeExam.allowMultipleSessions,
            identityMode: storeExam.identityMode,
          };
          pubAssessmentData = {
            id: storeExam.id,
            schoolId: storeExam.schoolId,
            classIds: storeExam.classIds,
            title: storeExam.title,
            description: storeExam.description,
            academicYear: storeExam.academicYear,
            subjectId: storeExam.subjectId,
            worldThemeId: storeExam.worldThemeId,
            grade: storeExam.grade,
            semester: storeExam.semester,
            startsAt: storeExam.startsAt,
            endsAt: storeExam.endsAt,
            durationMinutes: storeExam.durationMinutes,
            maxAttempts: storeExam.maxAttempts,
            allowMultipleSessions: storeExam.allowMultipleSessions,
            mode: storeExam.mode,
            examType: storeExam.examType,
            status: storeExam.status,
            isLocked: storeExam.isLocked,
            isVisibleOnMap: storeExam.isVisibleOnMap,
            showScoreToStudent: storeExam.showScoreToStudent,
            introStory: storeExam.introStory,
            totalQuestions: storeExam.totalQuestions,
            checkpointInterval: storeExam.checkpointInterval,
            navigationMode: storeExam.navigationMode,
            allowBack: storeExam.allowBack,
            allowEditAfterAnswer: storeExam.allowEditAfterAnswer,
            requireAnswerBeforeNext: storeExam.requireAnswerBeforeNext,
            shuffleQuestions: storeExam.shuffleQuestions,
            shuffleOptions: storeExam.shuffleOptions,
            identityMode: storeExam.identityMode,
            audioEnabled: storeExam.audioEnabled,
            scoringPolicy: storeExam.scoringPolicy,
            resultPolicy: storeExam.resultPolicy,
            ownerId: storeExam.ownerId,
          };
        }
      }

      if (!accessRecord || !accessRecord.assessmentId) {
        const failRes = recordFailedAttempt(failBucketKey, 6, 5 * 60 * 1000);
        if (!failRes.allowed) {
          res.setHeader('Retry-After', String(failRes.retryAfterSeconds));
          res.status(429).json({
            valid: false,
            code: 'TOO_MANY_FAILED_ATTEMPTS',
            retryAfterSeconds: failRes.retryAfterSeconds,
            message: `Terlalu banyak percobaan kode ujian yang salah. Coba lagi dalam ${failRes.retryAfterSeconds} detik.`,
          });
          return;
        }
        res.status(403).json({
          valid: false,
          code: 'CODE_NOT_FOUND',
          message: 'Kode ujian belum cocok atau belum dibuka oleh guru SDN Pekiringan.',
        });
        return;
      }

      const windowCheck = validateAccessWindowAndClass(accessRecord, classId, gradeClass);
      if (windowCheck.ok === false) {
        res.status(403).json({
          valid: false,
          code: windowCheck.code,
          message: windowCheck.message,
        });
        return;
      }

      if (!pubAssessmentData) {
        res.status(404).json({
          valid: false,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Data dunia asesmen tidak ditemukan di server.',
        });
        return;
      }
      const pubRes = { exists: true, data: pubAssessmentData };

      const identityMode = accessRecord.identityMode || 'roster_verify';
      let resolvedStudentLookup: StudentLookupDoc | null = null;

      if (identityMode === 'roster_verify') {
        const nameHash = hashStudentLookup(schoolId, classId, studentName);
        const nameKeyRes = await fsGetDoc<StudentLookupDoc>(`studentAccessKeys/${nameHash}`);
        const nameKey = nameKeyRes.data;

        if (!nameKeyRes.exists || !nameKey || nameKey.isActive === false) {
          const failRes = recordFailedAttempt(failBucketKey, 6, 5 * 60 * 1000);
          if (!failRes.allowed) {
            res.setHeader('Retry-After', String(failRes.retryAfterSeconds));
            res.status(429).json({
              valid: false,
              code: 'TOO_MANY_FAILED_ATTEMPTS',
              retryAfterSeconds: failRes.retryAfterSeconds,
              message: `Terlalu banyak percobaan masuk yang gagal. Tunggu ${failRes.retryAfterSeconds} detik ya.`,
            });
            return;
          }
          res.status(403).json({
            valid: false,
            code: 'STUDENT_NOT_FOUND',
            message: `Namamu (${studentName}) belum ditemukan di daftar peserta kelas ${gradeClass}. Periksa ejaan atau tanyakan ke guru ya.`,
          });
          return;
        }

        if (nameKey.requiresParticipantNumber && !participantNumber) {
          res.status(409).json({
            valid: false,
            code: 'DUPLICATE_NAME_NEEDS_PARTICIPANT_NUMBER',
            requiresParticipantNumber: true,
            message: `Ada lebih dari satu siswa bernama "${studentName}" di kelas ${gradeClass}. Masukkan Nomor Peserta kamu sebagai pembeda ya!`,
          });
          return;
        }

        if (participantNumber) {
          const fullHash = hashStudentLookup(schoolId, classId, studentName, participantNumber);
          const fullKeyRes = await fsGetDoc<StudentLookupDoc>(`studentAccessKeys/${fullHash}`);
          if (!fullKeyRes.exists || !fullKeyRes.data || fullKeyRes.data.isActive === false || !fullKeyRes.data.studentId) {
            const failRes = recordFailedAttempt(failBucketKey, 6, 5 * 60 * 1000);
            if (!failRes.allowed) {
              res.setHeader('Retry-After', String(failRes.retryAfterSeconds));
              res.status(429).json({
                valid: false,
                code: 'TOO_MANY_FAILED_ATTEMPTS',
                retryAfterSeconds: failRes.retryAfterSeconds,
                message: `Terlalu banyak percobaan nomor peserta yang belum cocok. Tunggu ${failRes.retryAfterSeconds} detik ya.`,
              });
              return;
            }
            res.status(403).json({
              valid: false,
              code: 'PARTICIPANT_MISMATCH',
              message: 'Nama atau Nomor Peserta belum cocok dengan data peserta kelas ini.',
            });
            return;
          }
          resolvedStudentLookup = fullKeyRes.data;
        } else {
          if (!nameKey.studentId) {
            res.status(403).json({
              valid: false,
              code: 'PARTICIPANT_MISMATCH',
              message: 'Data identitas siswa belum lengkap. Masukkan Nomor Peserta kamu ya.',
            });
            return;
          }
          resolvedStudentLookup = nameKey;
        }
      }

      const resolvedStudentId =
        resolvedStudentLookup?.studentId ||
        hashStudentLookup(schoolId, classId, studentName, participantNumber || undefined);
      const resolvedName = resolvedStudentLookup?.displayName || studentName;

      const deterministicId = `ses_${sha256Prefix(`${accessRecord.assessmentId}:${resolvedStudentId}`, 28)}`;
      let resumingSession: Record<string, unknown> | null = null;
      if (!accessRecord.allowMultipleSessions) {
        const existingSesRes = await fsGetDoc<Record<string, unknown>>(
          `assessmentSessions/${deterministicId}`
        );
        if (existingSesRes.exists && existingSesRes.data) {
          if (existingSesRes.data.status === 'submitted' || existingSesRes.data.status === 'graded') {
            res.status(409).json({
              valid: false,
              code: 'ALREADY_COMPLETED',
              message: 'Kamu sudah menyelesaikan misi ujian ini. Hubungi guru jika membutuhkan izin mengulang.',
            });
            return;
          }
          if (existingSesRes.data.status === 'in_progress') {
            resumingSession = existingSesRes.data;
          }
        }
      }

      clearFailedAttempts(failBucketKey);

      const sessionId =
        resumingSession && typeof resumingSession.id === 'string'
          ? resumingSession.id
          : !accessRecord.allowMultipleSessions
            ? deterministicId
            : `ses_${sha256Prefix(`${accessRecord.assessmentId}:${resolvedStudentId}:${Date.now()}`, 28)}`;

      const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
      const token = signStudentToken({
        jti: crypto.randomUUID(),
        sessionId,
        schoolId,
        assessmentId: accessRecord.assessmentId,
        subjectId: accessRecord.subjectId || String(pubRes.data.subjectId || 'pai'),
        classId,
        gradeClass,
        studentId: resolvedStudentId,
        studentName: resolvedName,
        participantNumber: participantNumber || undefined,
        characterId,
        iat: Date.now(),
        exp: expiresAt,
      });

      // Best-effort sanitized audit log (never logs plaintext exam code)
      const logId = sanitizeId(`log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);
      void fsCommitWrites([
        {
          docPath: `auditLogs/${logId}`,
          mode: 'create',
          data: {
            id: logId,
            schoolId,
            actorType: 'student',
            actorId: resolvedStudentId,
            actorName: resolvedName.slice(0, 120),
            action: resumingSession ? 'STUDENT_SESSION_RESUMED' : 'STUDENT_LOGIN_VERIFIED',
            targetCollection: 'assessmentSessions',
            targetId: sessionId,
            status: 'success',
            detail: `Kelas ${gradeClass} masuk ke asesmen ${accessRecord.assessmentId}`,
          },
          serverTimestampFields: ['createdAt'],
        },
      ]).catch(() => {
        // Non-blocking audit log
      });

      const adventureProfile = await ensureStudentProfileOnLogin({
        schoolId,
        studentId: resolvedStudentId,
        studentName: resolvedName,
        classId,
        gradeClass,
        characterId,
        subjectId: accessRecord.subjectId || String(pubRes.data.subjectId || 'pai'),
      });

      res.json({
        valid: true,
        sessionId,
        studentId: resolvedStudentId,
        studentName: resolvedName,
        classId,
        gradeClass,
        participantNumber: participantNumber || undefined,
        characterId: adventureProfile.characterSelected ? adventureProfile.characterId : characterId,
        characterSelected: adventureProfile.characterSelected,
        assessmentId: accessRecord.assessmentId,
        assessment: pubRes.data,
        resumingSession,
        resumingExisting: Boolean(resumingSession),
        token,
        tokenExpiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (err) {
      handleFirestoreRouteError(res, err, 'Layanan validasi portal siswa di Firestore belum terjangkau.');
    }
  }

  app.post('/api/student/login', handleAuthoritativeStudentLogin);

  // Backward-compatible alias that enforces identical server-side Firestore verification
  app.post('/api/student/validate-entry', handleAuthoritativeStudentLogin);

  app.post('/api/student/verify-token', (req, res) => {
    const bearer = extractBearerToken(req);
    const bodyToken = typeof (req.body as { token?: unknown })?.token === 'string' ? (req.body as { token: string }).token : '';
    const payload = verifyStudentToken(bearer || bodyToken);
    if (!payload) {
      res.status(401).json({ valid: false, error: 'Token sesi siswa tidak valid atau kedaluwarsa.' });
      return;
    }
    res.json({ valid: true, session: payload });
  });

  app.post('/api/student/logout', (req, res) => {
    const bearer = extractBearerToken(req);
    const bodyToken =
      typeof (req.body as { token?: unknown })?.token === 'string'
        ? (req.body as { token: string }).token
        : '';
    const payload = verifyStudentToken(bearer || bodyToken);
    if (payload) {
      revokeStudentToken(payload);
    }
    res.json({
      ok: true,
      revoked: Boolean(payload),
    });
  });

  app.get('/api/student/profile', (req, res) => {
    const bearer = extractBearerToken(req);
    const payload = verifyStudentToken(bearer);
    if (!payload) {
      res.status(401).json({
        error: 'Sesi siswa belum terautentikasi atau telah kedaluwarsa.',
        code: 'STUDENT_UNAUTHENTICATED',
      });
      return;
    }

    res.json({
      studentId: payload.studentId,
      studentName: payload.studentName,
      classId: payload.classId,
      gradeClass: payload.gradeClass,
      participantNumber: payload.participantNumber || null,
      characterId: payload.characterId,
      schoolId: payload.schoolId,
      schoolName: DEFAULT_SCHOOL_NAME,
      sessionId: payload.sessionId,
      assessmentId: payload.assessmentId,
      subjectId: payload.subjectId,
      tokenExpiresAt: new Date(payload.exp).toISOString(),
    });
  });

  app.get('/api/student/dashboard', async (req, res) => {
    const bearer = extractBearerToken(req);
    const payload = verifyStudentToken(bearer);
    if (!payload) {
      res.status(401).json({
        error: 'Sesi siswa belum terautentikasi atau telah keluar.',
        code: 'STUDENT_UNAUTHENTICATED',
      });
      return;
    }

    try {
      const [subjects, publicAssessments, ownSession] = await Promise.all([
        fsRunEqualityQuery<Record<string, unknown>>('subjects', [{ field: 'isActive', value: true }]).catch(() => []),
        fsRunInQuery<Record<string, unknown>>('publicAssessments', 'status', ['active', 'closed']),
        fsGetDoc<Record<string, unknown>>(`assessmentSessions/${sanitizeId(payload.sessionId)}`),
      ]);

      // Strict own-student isolation guard
      if (
        ownSession.exists &&
        ownSession.data &&
        typeof ownSession.data.studentId === 'string' &&
        ownSession.data.studentId !== payload.studentId
      ) {
        res.status(403).json({
          error: 'Sesi asesmen bukan milik siswa yang sedang masuk.',
          code: 'CROSS_STUDENT_DENIED',
        });
        return;
      }

      const activeWorldAssessments = publicAssessments.filter(
        (a) =>
          (a.status === 'active' || a.status === 'closed') &&
          (!a.schoolId || a.schoolId === payload.schoolId)
      );

      res.json({
        schoolId: payload.schoolId,
        schoolName: DEFAULT_SCHOOL_NAME,
        student: {
          studentId: payload.studentId,
          studentName: payload.studentName,
          classId: payload.classId,
          gradeClass: payload.gradeClass,
          participantNumber: payload.participantNumber || null,
          characterId: payload.characterId,
        },
        subjects: subjects.filter((s) => s.isActive !== false),
        publicAssessments: activeWorldAssessments,
        activeSession: ownSession.exists ? ownSession.data : null,
      });
    } catch (err) {
      handleFirestoreRouteError(res, err, 'Gagal memuat dashboard siswa dari Firestore.');
    }
  });

  // --- TEACHER DASHBOARD (Authenticated Teacher or Admin) ---
  app.get(
    '/api/teacher/dashboard',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      try {
        const [
          assessments,
          classes,
          students,
          sessions,
          results,
          bankItems,
          settingsDoc,
          schoolDoc,
        ] = await Promise.all([
          fsListCollection<Record<string, unknown>>('assessments', { idToken: staff.idToken }),
          fsListCollection<Record<string, unknown>>('classes', { idToken: staff.idToken }),
          fsListCollection<Record<string, unknown>>('students', { idToken: staff.idToken }),
          fsListCollection<Record<string, unknown>>('assessmentSessions', { idToken: staff.idToken }),
          fsListCollection<Record<string, unknown>>('results', { idToken: staff.idToken }),
          fsListCollection<Record<string, unknown>>('questionBanks', { idToken: staff.idToken }),
          fsGetDoc<Record<string, unknown>>('settings/app_config', staff.idToken),
          fsGetDoc<Record<string, unknown>>(`schools/${staff.schoolId}`, staff.idToken),
        ]);

        const activeStudents = students.filter((s) => s.isActive !== false);
        const activeClasses = classes.filter((c) => c.isActive !== false);
        const activeAssessmentsCount = assessments.filter((a) => a.status === 'active').length;
        const closedAssessmentsCount = assessments.filter((a) => a.status === 'closed').length;
        const completedSessionsCount = sessions.filter((s) => s.status !== 'in_progress').length;
        const inProgressSessionsCount = sessions.filter((s) => s.status === 'in_progress').length;

        const numericScores = results
          .map((r) => (typeof r.finalScore === 'number' ? r.finalScore : null))
          .filter((v): v is number => v !== null);
        const averageScore =
          numericScores.length > 0
            ? Math.round((numericScores.reduce((a, b) => a + b, 0) / numericScores.length) * 10) / 10
            : null;

        res.json({
          teacher: {
            uid: staff.uid,
            email: staff.email,
            displayName: staff.displayName,
            role: staff.role,
            schoolId: staff.schoolId,
          },
          school: schoolDoc.exists ? schoolDoc.data : null,
          settings: settingsDoc.exists ? settingsDoc.data : null,
          summary: {
            studentCount: activeStudents.length,
            classCount: activeClasses.length,
            totalAssessments: assessments.length,
            activeAssessmentCount: activeAssessmentsCount,
            closedAssessmentCount: closedAssessmentsCount,
            completedSessionCount: completedSessionsCount,
            inProgressSessionCount: inProgressSessionsCount,
            gradedResultCount: results.length,
            questionBankCount: bankItems.length,
            averageScore,
          },
        });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal memuat ringkasan dashboard guru dari Firestore.');
      }
    }
  );

  // --- ADMIN DASHBOARD & CRUD (Admin Role Only) ---
  app.get(
    '/api/admin/dashboard',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      try {
        const [schoolDoc, classes, subjects, students, assessments, teachers, auditLogs] =
          await Promise.all([
            fsGetDoc<Record<string, unknown>>(`schools/${staff.schoolId}`, staff.idToken),
            fsListCollection<Record<string, unknown>>('classes', { idToken: staff.idToken }),
            fsListCollection<Record<string, unknown>>('subjects', { idToken: staff.idToken }),
            fsListCollection<Record<string, unknown>>('students', { idToken: staff.idToken }),
            fsListCollection<Record<string, unknown>>('assessments', { idToken: staff.idToken }),
            fsListCollection<Record<string, unknown>>('teachers', { idToken: staff.idToken }),
            fsListCollection<Record<string, unknown>>('auditLogs', { idToken: staff.idToken, pageSize: 30 }),
          ]);

        const assessmentSnap = getAssessmentStateSnapshot();
        const adventureSnap = getAdventureStateSnapshot();
        const schoolSessions = Object.values(assessmentSnap.sessions).filter(
          (s) => s.schoolId === staff.schoolId
        );
        const schoolSubmissions = Object.values(assessmentSnap.submissions).filter(
          (s) => s.schoolId === staff.schoolId
        );
        const schoolBank = Object.values(assessmentSnap.questionBank).filter(
          (q) => q.schoolId === staff.schoolId && q.isActive && !q.archivedAt
        );
        const schoolProfiles = Object.values(adventureSnap.profiles).filter(
          (p) => p.schoolId === staff.schoolId
        );
        const schoolBadges = Object.values(adventureSnap.studentBadges).filter(
          (b) => b.schoolId === staff.schoolId
        );
        const schoolTxs = Object.values(adventureSnap.xpTransactions).filter(
          (t) => t.schoolId === staff.schoolId
        );
        const schoolImportBatches = listImportBatchesEngine(staff.schoolId);

        res.json({
          admin: {
            uid: staff.uid,
            email: staff.email,
            displayName: staff.displayName,
            role: staff.role,
            schoolId: staff.schoolId,
          },
          school: schoolDoc.exists ? schoolDoc.data : null,
          counts: {
            classes: classes.filter((c) => c.isActive !== false).length,
            subjects: subjects.filter((s) => s.isActive !== false).length,
            students: students.filter((s) => s.isActive !== false).length,
            assessments: assessments.length,
            teachers: teachers.length,
          },
          usageSummary: {
            activeSessions: schoolSessions.filter((s) => s.status === 'in_progress').length,
            submittedSessions: schoolSessions.filter(
              (s) => s.status === 'submitted' || s.status === 'graded'
            ).length,
            officialSubmissions: schoolSubmissions.filter((s) => s.isOfficialScore).length,
            practiceSubmissions: schoolSubmissions.filter((s) => !s.isOfficialScore).length,
            questionBankCount: schoolBank.length,
            importBatchesCount: schoolImportBatches.length,
            adventureExplorersCount: schoolProfiles.length,
            totalXpGranted: schoolTxs.reduce((sum, t) => sum + t.amount, 0),
            totalBadgesEarned: schoolBadges.length,
          },
          recentAuditLogs: auditLogs.slice(0, 15),
        });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal memuat ringkasan administrator dari Firestore.');
      }
    }
  );

  app.post(
    '/api/admin/classes',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = req.body as {
        id?: unknown;
        name?: unknown;
        grade?: unknown;
        academicYear?: unknown;
        homeroomTeacher?: unknown;
        isActive?: unknown;
      };

      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const grade = typeof body?.grade === 'string' ? body.grade.trim() : '3';
      if (!name || name.length > 24) {
        res.status(400).json({ error: 'Nama kelas wajib diisi (maksimal 24 karakter).', code: 'INVALID_CLASS_NAME' });
        return;
      }

      const id =
        typeof body?.id === 'string' && body.id.trim()
          ? sanitizeId(body.id.trim())
          : sanitizeId(`kelas_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`);

      const payload: Record<string, unknown> = {
        id,
        schoolId: staff.schoolId,
        name,
        grade: grade.slice(0, 16),
        isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
        ownerId: staff.uid,
      };
      if (typeof body?.academicYear === 'string' && body.academicYear.trim()) {
        payload.academicYear = body.academicYear.trim().slice(0, 32);
      }
      if (typeof body?.homeroomTeacher === 'string' && body.homeroomTeacher.trim()) {
        payload.homeroomTeacher = body.homeroomTeacher.trim().slice(0, 120);
      }

      const logId = sanitizeId(`log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);

      try {
        await fsCommitWrites(
          [
            {
              docPath: `classes/${id}`,
              mode: 'set',
              data: payload,
              serverTimestampFields: ['createdAt', 'updatedAt'],
            },
            {
              docPath: `auditLogs/${logId}`,
              mode: 'create',
              data: {
                id: logId,
                schoolId: staff.schoolId,
                actorType: 'admin',
                actorId: staff.uid,
                actorName: staff.displayName,
                action: 'ADMIN_CLASS_SAVED',
                targetCollection: 'classes',
                targetId: id,
                status: 'success',
                detail: `Kelas ${name} (Tingkat ${grade})`,
              },
              serverTimestampFields: ['createdAt'],
            },
          ],
          staff.idToken
        );

        res.status(201).json({ ok: true, id, classRoom: payload });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal menyimpan data kelas ke Firestore.');
      }
    }
  );

  app.post(
    '/api/admin/students',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = req.body as {
        id?: unknown;
        classId?: unknown;
        gradeClass?: unknown;
        name?: unknown;
        participantNumber?: unknown;
        studentNumber?: unknown;
        isActive?: unknown;
      };

      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const gradeClass = typeof body?.gradeClass === 'string' ? body.gradeClass.trim() : '';
      const classId =
        typeof body?.classId === 'string' && body.classId.trim()
          ? sanitizeId(body.classId.trim())
          : sanitizeId(`kelas_${gradeClass.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`);
      const participantNumber =
        typeof body?.participantNumber === 'string' ? body.participantNumber.trim().slice(0, 40) : '';
      const studentNumber =
        typeof body?.studentNumber === 'string' ? body.studentNumber.trim().slice(0, 40) : '';

      if (name.length < 2 || name.length > 120) {
        res.status(400).json({ error: 'Nama siswa wajib diisi (2–120 karakter).', code: 'INVALID_STUDENT_NAME' });
        return;
      }
      if (!gradeClass || gradeClass.length > 24) {
        res.status(400).json({ error: 'Nama kelas siswa wajib diisi.', code: 'INVALID_GRADE_CLASS' });
        return;
      }

      const id =
        typeof body?.id === 'string' && body.id.trim()
          ? sanitizeId(body.id.trim())
          : sanitizeId(`stu_${classId}_${crypto.randomBytes(4).toString('hex')}`);

      const studentPayload: Record<string, unknown> = {
        id,
        schoolId: staff.schoolId,
        classId,
        name,
        gradeClass,
        isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
        ownerId: staff.uid,
      };
      if (participantNumber) studentPayload.participantNumber = participantNumber;
      if (studentNumber) studentPayload.studentNumber = studentNumber;

      try {
        const classmates = await fsRunEqualityQuery<{
          id: string;
          name: string;
          participantNumber?: string;
          isActive?: boolean;
        }>('students', [{ field: 'classId', value: classId }], { idToken: staff.idToken });

        const normTarget = normalizeText(name);
        const sameNamePeers = classmates.filter(
          (s) => s.id !== id && s.isActive !== false && normalizeText(s.name) === normTarget
        );

        const nameLookupId = hashStudentLookup(staff.schoolId, classId, name);
        const writes: Parameters<typeof fsCommitWrites>[0] = [
          {
            docPath: `students/${id}`,
            mode: 'create',
            data: studentPayload,
            serverTimestampFields: ['createdAt', 'updatedAt'],
          },
        ];

        if (sameNamePeers.length === 0) {
          writes.push({
            docPath: `studentAccessKeys/${nameLookupId}`,
            mode: 'set',
            data: {
              lookupId: nameLookupId,
              schoolId: staff.schoolId,
              classId,
              requiresParticipantNumber: false,
              studentId: id,
              displayName: name,
              isActive: Boolean(studentPayload.isActive),
              ownerId: staff.uid,
            },
            serverTimestampFields: ['updatedAt'],
          });
        } else {
          writes.push({
            docPath: `studentAccessKeys/${nameLookupId}`,
            mode: 'set',
            data: {
              lookupId: nameLookupId,
              schoolId: staff.schoolId,
              classId,
              requiresParticipantNumber: true,
              isActive: true,
              ownerId: staff.uid,
            },
            serverTimestampFields: ['updatedAt'],
          });
        }

        if (participantNumber) {
          const fullLookupId = hashStudentLookup(staff.schoolId, classId, name, participantNumber);
          writes.push({
            docPath: `studentAccessKeys/${fullLookupId}`,
            mode: 'set',
            data: {
              lookupId: fullLookupId,
              schoolId: staff.schoolId,
              classId,
              requiresParticipantNumber: false,
              studentId: id,
              displayName: name,
              isActive: Boolean(studentPayload.isActive),
              ownerId: staff.uid,
            },
            serverTimestampFields: ['updatedAt'],
          });
        }

        const logId = sanitizeId(`log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);
        writes.push({
          docPath: `auditLogs/${logId}`,
          mode: 'create',
          data: {
            id: logId,
            schoolId: staff.schoolId,
            actorType: 'admin',
            actorId: staff.uid,
            actorName: staff.displayName,
            action: 'ADMIN_STUDENT_CREATED',
            targetCollection: 'students',
            targetId: id,
            status: 'success',
            detail: `Siswa ${name} (${gradeClass})`,
          },
          serverTimestampFields: ['createdAt'],
        });

        await fsCommitWrites(writes, staff.idToken);
        res.status(201).json({ ok: true, id, student: studentPayload });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal menambahkan data siswa ke Firestore.');
      }
    }
  );

  app.put(
    '/api/admin/students/:studentId',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const studentId = sanitizeId(String(req.params.studentId || ''));
      const body = req.body as {
        name?: unknown;
        classId?: unknown;
        gradeClass?: unknown;
        participantNumber?: unknown;
        studentNumber?: unknown;
        isActive?: unknown;
      };

      try {
        const existing = await fsGetDoc<Record<string, unknown>>(`students/${studentId}`, staff.idToken);
        if (!existing.exists || !existing.data) {
          res.status(404).json({ error: 'Data siswa tidak ditemukan.', code: 'STUDENT_NOT_FOUND' });
          return;
        }

        const prev = existing.data;
        const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : String(prev.name || '');
        const gradeClass =
          typeof body?.gradeClass === 'string' && body.gradeClass.trim()
            ? body.gradeClass.trim().slice(0, 24)
            : String(prev.gradeClass || '');
        const classId =
          typeof body?.classId === 'string' && body.classId.trim()
            ? sanitizeId(body.classId.trim())
            : String(prev.classId || '');
        const isActive = body?.isActive === undefined ? Boolean(prev.isActive) : Boolean(body.isActive);

        const updated: Record<string, unknown> = {
          id: studentId,
          schoolId: String(prev.schoolId || staff.schoolId),
          classId,
          name,
          gradeClass,
          isActive,
          ownerId: String(prev.ownerId || staff.uid),
        };
        const part =
          typeof body?.participantNumber === 'string'
            ? body.participantNumber.trim().slice(0, 40)
            : typeof prev.participantNumber === 'string'
              ? prev.participantNumber
              : '';
        if (part) updated.participantNumber = part;
        const stuNum =
          typeof body?.studentNumber === 'string'
            ? body.studentNumber.trim().slice(0, 40)
            : typeof prev.studentNumber === 'string'
              ? prev.studentNumber
              : '';
        if (stuNum) updated.studentNumber = stuNum;

        const nameLookupId = hashStudentLookup(String(updated.schoolId), classId, name);
        const writes: Parameters<typeof fsCommitWrites>[0] = [
          {
            docPath: `students/${studentId}`,
            mode: 'update',
            data: updated,
            updateMaskFields: Object.keys(updated),
            serverTimestampFields: ['updatedAt'],
          },
          {
            docPath: `studentAccessKeys/${nameLookupId}`,
            mode: 'set',
            data: {
              lookupId: nameLookupId,
              schoolId: String(updated.schoolId),
              classId,
              requiresParticipantNumber: false,
              studentId,
              displayName: name,
              isActive,
              ownerId: staff.uid,
            },
            serverTimestampFields: ['updatedAt'],
          },
        ];

        if (part) {
          const fullLookupId = hashStudentLookup(String(updated.schoolId), classId, name, part);
          writes.push({
            docPath: `studentAccessKeys/${fullLookupId}`,
            mode: 'set',
            data: {
              lookupId: fullLookupId,
              schoolId: String(updated.schoolId),
              classId,
              requiresParticipantNumber: false,
              studentId,
              displayName: name,
              isActive,
              ownerId: staff.uid,
            },
            serverTimestampFields: ['updatedAt'],
          });
        }

        await fsCommitWrites(writes, staff.idToken);
        res.json({ ok: true, id: studentId, student: updated });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal memperbarui data siswa.');
      }
    }
  );

  app.post(
    '/api/admin/exams',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = req.body as {
        id?: unknown;
        code?: unknown;
        title?: unknown;
        description?: unknown;
        subjectId?: unknown;
        grade?: unknown;
        semester?: unknown;
        academicYear?: unknown;
        durationMinutes?: unknown;
        mode?: unknown;
        status?: unknown;
        classIds?: unknown;
        kkm?: unknown;
        identityMode?: unknown;
        introStory?: unknown;
      };

      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const subjectId = typeof body?.subjectId === 'string' ? body.subjectId.trim() : '';
      const rawCode = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
      const code = rawCode.replace(/[^A-Z0-9_-]/g, '').slice(0, 32);

      if (!title || title.length > 160) {
        res.status(400).json({ error: 'Judul asesmen wajib diisi (1–160 karakter).', code: 'INVALID_TITLE' });
        return;
      }
      if (!subjectId || !/^[a-z0-9_]{1,40}$/.test(subjectId)) {
        res.status(400).json({ error: 'Mata pelajaran tidak valid.', code: 'INVALID_SUBJECT' });
        return;
      }
      if (code.length < 2) {
        res.status(400).json({ error: 'Kode ujian wajib minimal 2 karakter (huruf/angka).', code: 'INVALID_CODE' });
        return;
      }

      const id =
        typeof body?.id === 'string' && body.id.trim()
          ? sanitizeId(body.id.trim())
          : sanitizeId(`asm_${subjectId}_${Date.now().toString(36)}`);
      const codeHash = hashExamCode(staff.schoolId, code);
      const mode = body?.mode === 'latihan' ? 'latihan' : 'psas';
      const status =
        body?.status === 'active' || body?.status === 'closed' ? body.status : 'draft';
      const identityMode =
        body?.identityMode === 'code_free' || body?.identityMode === 'roster_select'
          ? body.identityMode
          : 'roster_verify';
      const classIds = Array.isArray(body?.classIds)
        ? body.classIds.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 20)
        : undefined;

      const assessmentPayload: Record<string, unknown> = {
        id,
        schoolId: staff.schoolId,
        code,
        codeHash,
        title,
        subjectId,
        worldThemeId: subjectId,
        grade: typeof body?.grade === 'string' && body.grade.trim() ? body.grade.trim().slice(0, 16) : '3',
        semester: body?.semester === 'Genap' ? 'Genap' : 'Ganjil',
        durationMinutes: Math.max(5, Math.min(240, Number(body?.durationMinutes) || 30)),
        mode,
        status,
        isLocked: status !== 'active',
        isVisibleOnMap: true,
        showScoreToStudent: mode === 'latihan',
        introStory:
          typeof body?.introStory === 'string' && body.introStory.trim()
            ? body.introStory.trim().slice(0, 2000)
            : 'Selamat datang di dunia petualangan SDN Pekiringan!',
        totalQuestions: 0,
        checkpointInterval: 3,
        kkm: Math.max(0, Math.min(100, Number(body?.kkm) || 75)),
        navigationMode: 'checkpoint',
        allowBack: true,
        allowEditAfterAnswer: true,
        requireAnswerBeforeNext: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        identityMode,
        audioEnabled: true,
        allowMultipleSessions: mode === 'latihan',
        ownerId: staff.uid,
      };

      if (typeof body?.description === 'string' && body.description.trim()) {
        assessmentPayload.description = body.description.trim().slice(0, 600);
      }
      if (typeof body?.academicYear === 'string' && body.academicYear.trim()) {
        assessmentPayload.academicYear = body.academicYear.trim().slice(0, 32);
      }
      if (classIds && classIds.length > 0) {
        assessmentPayload.classIds = classIds;
      }

      const publicPayload: Record<string, unknown> = {
        id,
        schoolId: staff.schoolId,
        title,
        subjectId,
        worldThemeId: subjectId,
        grade: assessmentPayload.grade,
        semester: assessmentPayload.semester,
        durationMinutes: assessmentPayload.durationMinutes,
        mode,
        status,
        isLocked: assessmentPayload.isLocked,
        isVisibleOnMap: true,
        showScoreToStudent: assessmentPayload.showScoreToStudent,
        introStory: assessmentPayload.introStory,
        totalQuestions: 0,
        checkpointInterval: 3,
        navigationMode: 'checkpoint',
        allowBack: true,
        allowEditAfterAnswer: true,
        requireAnswerBeforeNext: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        identityMode,
        audioEnabled: true,
        allowMultipleSessions: assessmentPayload.allowMultipleSessions,
        ownerId: staff.uid,
      };
      if (classIds && classIds.length > 0) publicPayload.classIds = classIds;

      const accessPayload: Record<string, unknown> = {
        codeHash,
        schoolId: staff.schoolId,
        assessmentId: id,
        subjectId,
        status,
        isLocked: assessmentPayload.isLocked,
        allowMultipleSessions: assessmentPayload.allowMultipleSessions,
        identityMode,
        ownerId: staff.uid,
      };
      if (classIds && classIds.length > 0) accessPayload.classIds = classIds;

      const logId = sanitizeId(`log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);

      try {
        await fsCommitWrites(
          [
            {
              docPath: `assessments/${id}`,
              mode: 'create',
              data: assessmentPayload,
              serverTimestampFields: ['createdAt', 'updatedAt'],
            },
            {
              docPath: `publicAssessments/${id}`,
              mode: 'set',
              data: publicPayload,
              serverTimestampFields: ['updatedAt'],
            },
            {
              docPath: `assessmentAccess/${codeHash}`,
              mode: 'set',
              data: accessPayload,
              serverTimestampFields: ['updatedAt'],
            },
            {
              docPath: `auditLogs/${logId}`,
              mode: 'create',
              data: {
                id: logId,
                schoolId: staff.schoolId,
                actorType: 'admin',
                actorId: staff.uid,
                actorName: staff.displayName,
                action: 'ADMIN_EXAM_CREATED',
                targetCollection: 'assessments',
                targetId: id,
                status: 'success',
                detail: `${title} · mapel=${subjectId} · status=${status}`,
              },
              serverTimestampFields: ['createdAt'],
            },
          ],
          staff.idToken
        );

        res.status(201).json({ ok: true, id, publicAssessment: publicPayload });
      } catch (err) {
        handleFirestoreRouteError(res, err, 'Gagal menyimpan paket asesmen ke Firestore.');
      }
    }
  );

  // --- SCORING ENGINE (Protected for verified teachers & admins) ---
  app.post('/api/scoring/evaluate', authenticateStaff, requireRole(['admin', 'teacher']), (req, res) => {
    const body = req.body as {
      questions?: Array<ScoringQuestionInput & { numericTolerance?: number; allowPartialScoring?: boolean }>;
      keys?: Array<ScoringKeyInput & { numericTolerance?: number }>;
      answers?: ScoringAnswerInput[];
      manualScores?: Record<string, number>;
      scoringPolicy?: {
        maxScore?: number;
        multipleSelectScoring?: 'exact' | 'partial_proportional';
        shortAnswerCaseSensitive?: boolean;
        shortAnswerNumericTolerance?: number;
      };
      startedAt?: string;
      submittedAt?: string;
    };

    if (!Array.isArray(body?.questions) || !Array.isArray(body?.keys) || !Array.isArray(body?.answers)) {
      res.status(400).json({ error: 'Invalid scoring payload: questions, keys, and answers arrays are required.' });
      return;
    }

    if (body.questions.length > 300 || body.keys.length > 300 || body.answers.length > 300) {
      res.status(400).json({ error: 'Scoring payload exceeds maximum allowed item limit (300).' });
      return;
    }

    const keyMap = new Map<string, ScoringKeyInput & { numericTolerance?: number }>();
    for (const k of body.keys) {
      if (k && typeof k.questionId === 'string') keyMap.set(k.questionId, k);
    }

    const answerMap = new Map<string, ScoringAnswerInput>();
    for (const a of body.answers) {
      if (a && typeof a.questionId === 'string') answerMap.set(a.questionId, a);
    }

    const manualScores = body.manualScores && typeof body.manualScores === 'object' ? body.manualScores : {};
    const policy = defaultScoringPolicy(body.scoringPolicy);

    let earnedPoints = 0;
    let maxPoints = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let needsManualReview = false;
    const questionOutcomes: Record<string, QuestionOutcome> = {};

    for (const q of body.questions) {
      const k = keyMap.get(q.id);
      const outcome = k || q.type === 'essay' || typeof manualScores[q.id] === 'number'
        ? evaluateSingleQuestionStage3(
            {
              id: q.id,
              type: q.type,
              weight: q.weight,
              correctAnswer: k?.correctAnswer || '',
              acceptedVariations: k?.acceptedVariations,
              numericTolerance: q.numericTolerance ?? k?.numericTolerance,
              allowPartialScoring: q.allowPartialScoring,
            },
            answerMap.get(q.id),
            manualScores[q.id],
            policy
          )
        : evaluateSingleQuestion(q, k, answerMap.get(q.id), manualScores[q.id]);

      questionOutcomes[q.id] = outcome;
      earnedPoints += outcome.earnedPoints;
      maxPoints += outcome.maxPoints;

      if (outcome.status === 'correct') correctCount++;
      else if (outcome.status === 'partial') correctCount++;
      else if (outcome.status === 'unanswered') unansweredCount++;
      else if (outcome.status === 'manual_pending') {
        needsManualReview = true;
      } else {
        wrongCount++;
      }
    }

    const finalScore = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * policy.maxScore) : 0;

    let durationSeconds = 0;
    if (body.startedAt && body.submittedAt) {
      const s = Date.parse(body.startedAt);
      const e = Date.parse(body.submittedAt);
      if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
        durationSeconds = Math.round((e - s) / 1000);
      }
    }

    res.json({
      finalScore: Math.max(0, Math.min(policy.maxScore, finalScore)),
      earnedPoints: Math.round(earnedPoints * 100) / 100,
      maxPoints: Math.round(maxPoints * 100) / 100,
      correctCount,
      wrongCount,
      unansweredCount,
      needsManualReview,
      durationSeconds,
      questionOutcomes,
    });
  });

  app.post('/api/scoring/analyze', authenticateStaff, requireRole(['admin', 'teacher']), (req, res) => {
    const body = req.body as {
      assessmentId?: string;
      assessmentTitle?: string;
      subjectName?: string;
      questions?: Array<ScoringQuestionInput & { options?: string[]; correctAnswer?: string }>;
      results?: Array<{
        finalScore: number;
        questionOutcomes?: Record<string, QuestionOutcome>;
        answers?: Array<{ questionId: string; answerValue: string }>;
      }>;
      kkm?: number;
    };

    if (!Array.isArray(body?.questions) || !Array.isArray(body?.results)) {
      res.status(400).json({ error: 'Invalid analysis payload.' });
      return;
    }

    if (body.questions.length > 300 || body.results.length > 2000) {
      res.status(400).json({ error: 'Analysis payload exceeds maximum allowed bounds.' });
      return;
    }

    const kkm = typeof body.kkm === 'number' ? body.kkm : 70;
    const results = body.results;
    const scores = results.map((r) => (typeof r.finalScore === 'number' ? r.finalScore : 0));

    const averageScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const passedCount = scores.filter((s) => s >= kkm).length;
    const passRate = scores.length > 0 ? Math.round((passedCount / scores.length) * 100) : 0;

    const distribution = [
      { label: '0-49', count: scores.filter((s) => s < 50).length },
      { label: '50-69', count: scores.filter((s) => s >= 50 && s < 70).length },
      { label: '70-84', count: scores.filter((s) => s >= 70 && s < 85).length },
      { label: '85-100', count: scores.filter((s) => s >= 85).length },
    ];

    const enhanced = buildEnhancedItemAnalysis({
      assessmentId: typeof body.assessmentId === 'string' ? body.assessmentId : null,
      assessmentTitle: typeof body.assessmentTitle === 'string' ? body.assessmentTitle : null,
      subjectName: typeof body.subjectName === 'string' ? body.subjectName : null,
      questions: body.questions.map((q, idx) => ({
        id: q.id,
        order: idx + 1,
        type: q.type,
        prompt: typeof q.prompt === 'string' && q.prompt.trim() ? q.prompt : `Soal #${idx + 1}`,
        options: q.options,
        correctAnswer: q.correctAnswer,
        weight: q.weight,
        topic: q.topic,
        indicator: q.indicator,
      })),
      submissions: results.map((r) => {
        const answersMap: Record<string, string> = {};
        if (Array.isArray(r.answers)) {
          for (const a of r.answers) {
            if (a && typeof a.questionId === 'string' && typeof a.answerValue === 'string') {
              answersMap[a.questionId] = a.answerValue;
            }
          }
        }
        return {
          finalScore: r.finalScore,
          questionOutcomes: r.questionOutcomes,
          answersMap,
        };
      }),
    });

    res.json({
      averageScore,
      highestScore,
      lowestScore,
      passedCount,
      totalStudents: scores.length,
      passRate,
      distribution,
      lowSampleWarning: enhanced.lowSampleWarning,
      questionStats: enhanced.questionStats,
      mostDifficultQuestions: enhanced.mostDifficultQuestions,
      reviewNeededQuestions: enhanced.reviewNeededQuestions,
      topicAnalysis: enhanced.topicMastery.map((t) => ({
        topic: t.topic,
        masteryPercent: t.masteryPercent,
      })),
      indicatorAnalysis: enhanced.indicatorMastery.map((ind) => ({
        indicator: ind.indicator,
        masteryPercent: ind.masteryPercent,
      })),
    });
  });

  // --- STAGE 5: REPORTING, ANALYTICS & ADMIN GAMIFICATION CONFIG ROUTES ---

  app.post(
    '/api/teacher/reports/summary',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = (req.body || {}) as {
        filters?: ReportingFilters;
        clientAssessments?: ClientAssessmentInput[];
        clientQuestions?: ClientQuestionInput[];
        clientResults?: ClientResultInput[];
        clientSessions?: ClientSessionAnswerInput[];
        clientRoster?: ClientRosterStudent[];
        clientClasses?: ClientClassRoom[];
      };

      try {
        const report = buildStage5Report({
          schoolId: staff.schoolId,
          filters: body.filters,
          clientAssessments: Array.isArray(body.clientAssessments) ? body.clientAssessments.slice(0, 500) : undefined,
          clientQuestions: Array.isArray(body.clientQuestions) ? body.clientQuestions.slice(0, 2000) : undefined,
          clientResults: Array.isArray(body.clientResults) ? body.clientResults.slice(0, 3000) : undefined,
          clientSessions: Array.isArray(body.clientSessions) ? body.clientSessions.slice(0, 3000) : undefined,
          clientRoster: Array.isArray(body.clientRoster) ? body.clientRoster.slice(0, 2000) : undefined,
          clientClasses: Array.isArray(body.clientClasses) ? body.clientClasses.slice(0, 100) : undefined,
        });
        res.json({ ok: true, report });
      } catch {
        res.status(500).json({
          error: 'Gagal menyusun laporan dan analisis hasil asesmen.',
          code: 'TEACHER_REPORT_SUMMARY_ERROR',
        });
      }
    }
  );

  app.get(
    '/api/teacher/reports/adventure-progress',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const levelRaw = typeof req.query.level === 'string' ? Number(req.query.level) : undefined;
      const report = getTeacherAdventureProgressReport(staff.schoolId, {
        classFilter: typeof req.query.classFilter === 'string' ? req.query.classFilter : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        levelFilter: typeof levelRaw === 'number' && Number.isFinite(levelRaw) ? levelRaw : undefined,
      });
      res.json({ ok: true, ...report });
    }
  );

  app.get(
    '/api/admin/gamification/config',
    authenticateStaff,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const data = getAdminGamificationConfigEngine(staff.schoolId);
      res.json({ ok: true, ...data });
    }
  );

  app.put(
    '/api/admin/gamification/config',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      try {
        const result = await updateAdminGamificationConfigEngine({
          schoolId: staff.schoolId,
          staffUid: staff.uid,
          staffDisplayName: staff.displayName,
          staffIdToken: staff.idToken,
          input: (req.body || {}) as Record<string, unknown>,
        });
        res.json(result);
      } catch {
        res.status(500).json({
          error: 'Gagal menyimpan konfigurasi gamifikasi admin.',
          code: 'ADMIN_GAMIFICATION_SAVE_ERROR',
        });
      }
    }
  );

  // --- STAGE 2: ADVENTURE ENGINE API (SERVER-AUTHORITATIVE) ---

  app.get('/api/student/adventure/character', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    try {
      const profile = await getStudentAdventureCharacter(req.studentAuth!);
      res.json({ ok: true, profile });
    } catch {
      res.status(500).json({ error: 'Gagal memuat data karakter petualang.', code: 'ADVENTURE_PROFILE_ERROR' });
    }
  });

  app.post('/api/student/adventure/character', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      const result = await saveStudentAdventureCharacter(req.studentAuth!, {
        characterId: body.characterId,
        outfitTheme: body.outfitTheme,
        bagStyle: body.bagStyle,
        shoeStyle: body.shoeStyle,
        accentColor: body.accentColor,
        nickname: body.nickname,
      });
      res.json({ ok: true, profile: result.profile, celebration: result.celebration });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan kustomisasi karakter.', code: 'ADVENTURE_CHARACTER_SAVE_ERROR' });
    }
  });

  app.get('/api/student/adventure/basecamp', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    try {
      const baseCamp = await buildStudentBaseCampPayload(req.studentAuth!);
      res.json({ ok: true, ...baseCamp });
    } catch {
      res.status(500).json({ error: 'Gagal memuat data Base Camp petualangan.', code: 'BASECAMP_LOAD_ERROR' });
    }
  });

  app.get('/api/student/adventure/worlds', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    try {
      const baseCamp = await buildStudentBaseCampPayload(req.studentAuth!);
      res.json({ ok: true, worlds: baseCamp.worlds, profile: baseCamp.profile, levelInfo: baseCamp.levelInfo });
    } catch {
      res.status(500).json({ error: 'Gagal memuat daftar 10 dunia petualangan.', code: 'WORLDS_LOAD_ERROR' });
    }
  });

  app.get('/api/student/adventure/world/:worldId', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const worldId = sanitizeId(String(req.params.worldId || ''));
    try {
      const result = await getWorldDetailForStudent(req.studentAuth!, worldId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Gagal memuat detail dunia petualangan.', code: 'WORLD_DETAIL_ERROR' });
    }
  });

  app.post('/api/student/adventure/world/:worldId/open', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const worldId = sanitizeId(String(req.params.worldId || ''));
    try {
      const result = await openWorldForStudent(req.studentAuth!, worldId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Gagal membuka dunia petualangan.', code: 'WORLD_OPEN_ERROR' });
    }
  });

  app.get('/api/student/adventure/progress', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    try {
      const baseCamp = await buildStudentBaseCampPayload(req.studentAuth!);
      res.json({
        ok: true,
        profile: baseCamp.profile,
        levelInfo: baseCamp.levelInfo,
        worlds: baseCamp.worlds,
      });
    } catch {
      res.status(500).json({ error: 'Gagal memuat progres petualangan.', code: 'PROGRESS_LOAD_ERROR' });
    }
  });

  app.get('/api/student/adventure/progress/:worldId', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const worldId = sanitizeId(String(req.params.worldId || ''));
    try {
      const result = await getWorldDetailForStudent(req.studentAuth!, worldId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Gagal memuat progres dunia.', code: 'WORLD_PROGRESS_ERROR' });
    }
  });

  app.get('/api/student/adventure/world/:worldId/checkpoints', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const worldId = sanitizeId(String(req.params.worldId || ''));
    try {
      const result = await getWorldDetailForStudent(req.studentAuth!, worldId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ ok: true, world: result.world, checkpoints: result.checkpoints });
    } catch {
      res.status(500).json({ error: 'Gagal memuat daftar checkpoint dunia.', code: 'CHECKPOINTS_LOAD_ERROR' });
    }
  });

  app.post('/api/student/adventure/checkpoint/:checkpointId/start', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const checkpointId = sanitizeId(String(req.params.checkpointId || ''));
    try {
      const result = await startCheckpointForStudent(req.studentAuth!, checkpointId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Gagal memulai checkpoint petualangan.', code: 'CHECKPOINT_START_ERROR' });
    }
  });

  app.post('/api/student/adventure/checkpoint/:checkpointId/complete', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const checkpointId = sanitizeId(String(req.params.checkpointId || ''));
    try {
      const result = await completeCheckpointForStudent(req.studentAuth!, checkpointId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Gagal menyelesaikan checkpoint petualangan.', code: 'CHECKPOINT_COMPLETE_ERROR' });
    }
  });

  app.get('/api/student/adventure/xp', authenticateStudent, (req: AuthenticatedRequest, res) => {
    const data = getStudentXpAndHistory(req.studentAuth!);
    res.json({
      ok: true,
      levelInfo: data.levelInfo,
      levelThresholds: data.levelThresholds,
      totalTransactions: data.transactions.length,
    });
  });

  // Anti-cheat guard: Reject direct client XP mutation attempts explicitly
  app.post('/api/student/adventure/xp', authenticateStudent, (_req, res) => {
    res.status(403).json({
      error: 'XP hanya dapat dihitung dan diberikan oleh server berdasarkan aktivitas valid.',
      code: 'CLIENT_XP_MUTATION_FORBIDDEN',
    });
  });

  app.get('/api/student/adventure/xp/history', authenticateStudent, (req: AuthenticatedRequest, res) => {
    const data = getStudentXpAndHistory(req.studentAuth!);
    res.json({
      ok: true,
      levelInfo: data.levelInfo,
      transactions: data.transactions,
      events: data.events,
    });
  });

  app.get('/api/student/adventure/badges', authenticateStudent, (req: AuthenticatedRequest, res) => {
    const data = getStudentBadgesView(req.studentAuth!);
    res.json({ ok: true, ...data });
  });

  // Stage 3 Ready Hook: Verified submission XP grant (checks own Firestore session status)
  app.post('/api/student/adventure/exam-completed', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as { sessionId?: unknown; assessmentId?: unknown; worldId?: unknown };
    const sessionId = sanitizeId(
      typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim()
        : req.studentTokenPayload!.sessionId
    );
    try {
      const sesRes = await fsGetDoc<Record<string, unknown>>(`assessmentSessions/${sessionId}`);
      if (!sesRes.exists || !sesRes.data) {
        res.status(404).json({ error: 'Sesi asesmen belum tersimpan.', code: 'SESSION_NOT_FOUND' });
        return;
      }
      if (sesRes.data.studentId && sesRes.data.studentId !== req.studentAuth!.studentId) {
        res.status(403).json({ error: 'Sesi asesmen bukan milik siswa ini.', code: 'CROSS_STUDENT_DENIED' });
        return;
      }
      if (sesRes.data.status !== 'submitted' && sesRes.data.status !== 'graded') {
        res.status(400).json({ error: 'Asesmen belum selesai dikumpulkan.', code: 'SESSION_NOT_SUBMITTED' });
        return;
      }
      const assessmentId = String(sesRes.data.assessmentId || req.studentTokenPayload!.assessmentId);
      const worldId = String(sesRes.data.subjectId || req.studentAuth!.subjectId || 'pai');
      const celebration = await recordExamCompletedHook(req.studentAuth!, assessmentId, worldId);
      res.json({ ok: true, celebration });
    } catch {
      res.status(500).json({ error: 'Gagal mencatat XP penyelesaian asesmen.', code: 'EXAM_HOOK_ERROR' });
    }
  });

  // --- TEACHER / ADMIN ADVENTURE ENGINE MANAGEMENT ---

  app.get(
    '/api/teacher/adventure/overview',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      try {
        const overview = await getTeacherAdventureOverview(staff.schoolId, staff.idToken);
        res.json({ ok: true, ...overview });
      } catch {
        res.status(500).json({
          error: 'Gagal memuat ringkasan Adventure Engine untuk guru.',
          code: 'TEACHER_ADVENTURE_OVERVIEW_ERROR',
        });
      }
    }
  );

  app.put(
    '/api/teacher/adventure/worlds/:worldId',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const worldId = sanitizeId(String(req.params.worldId || ''));
      const body = (req.body || {}) as {
        isAvailable?: unknown;
        availabilityReason?: unknown;
        scheduleLabel?: unknown;
      };
      if (typeof body.isAvailable !== 'boolean') {
        res.status(400).json({
          error: 'Field isAvailable (boolean) wajib disertakan.',
          code: 'INVALID_AVAILABILITY',
        });
        return;
      }
      try {
        const result = await updateWorldConfigByTeacher({
          schoolId: staff.schoolId,
          worldId,
          staffUid: staff.uid,
          staffIdToken: staff.idToken,
          isAvailable: body.isAvailable,
          availabilityReason:
            typeof body.availabilityReason === 'string' ? body.availabilityReason : undefined,
          scheduleLabel: typeof body.scheduleLabel === 'string' ? body.scheduleLabel : undefined,
        });
        if (result.ok === false) {
          res.status(result.status).json({ error: result.message, code: result.code });
          return;
        }
        res.json(result);
      } catch {
        res.status(500).json({
          error: 'Gagal memperbarui status dunia petualangan.',
          code: 'TEACHER_WORLD_UPDATE_ERROR',
        });
      }
    }
  );

  app.post(
    '/api/teacher/adventure/checkpoints',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = (req.body || {}) as {
        id?: unknown;
        worldId?: unknown;
        order?: unknown;
        title?: unknown;
        storyIntro?: unknown;
        storyOutro?: unknown;
        challengePrompt?: unknown;
        challengeOptions?: unknown;
        helpfulHint?: unknown;
        checkpointType?: unknown;
        xpReward?: unknown;
      };
      try {
        const result = await upsertCheckpointByTeacher({
          schoolId: staff.schoolId,
          staffUid: staff.uid,
          staffIdToken: staff.idToken,
          id: typeof body.id === 'string' ? body.id : undefined,
          worldId: typeof body.worldId === 'string' ? body.worldId : '',
          order: Number(body.order) || 1,
          title: typeof body.title === 'string' ? body.title : '',
          storyIntro: typeof body.storyIntro === 'string' ? body.storyIntro : '',
          storyOutro: typeof body.storyOutro === 'string' ? body.storyOutro : undefined,
          challengePrompt: typeof body.challengePrompt === 'string' ? body.challengePrompt : undefined,
          challengeOptions: Array.isArray(body.challengeOptions)
            ? body.challengeOptions.map(String)
            : undefined,
          helpfulHint: typeof body.helpfulHint === 'string' ? body.helpfulHint : undefined,
          checkpointType:
            body.checkpointType === 'story' || body.checkpointType === 'mission_gate'
              ? body.checkpointType
              : 'exploration',
          xpReward: Number(body.xpReward) || 25,
        });
        if (result.ok === false) {
          res.status(result.status).json({ error: result.message, code: result.code });
          return;
        }
        res.status(201).json(result);
      } catch {
        res.status(500).json({
          error: 'Gagal menyimpan konfigurasi checkpoint.',
          code: 'TEACHER_CHECKPOINT_SAVE_ERROR',
        });
      }
    }
  );

  app.delete(
    '/api/teacher/adventure/checkpoints/:checkpointId',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const checkpointId = sanitizeId(String(req.params.checkpointId || ''));
      try {
        const result = await deactivateCheckpointByTeacher({
          schoolId: staff.schoolId,
          checkpointId,
          staffUid: staff.uid,
          staffIdToken: staff.idToken,
        });
        if (result.ok === false) {
          res.status(result.status).json({ error: result.message, code: result.code });
          return;
        }
        res.json(result);
      } catch {
        res.status(500).json({
          error: 'Gagal menonaktifkan checkpoint.',
          code: 'TEACHER_CHECKPOINT_DELETE_ERROR',
        });
      }
    }
  );

  app.post(
    '/api/admin/adventure/sync-defaults',
    authenticateStaff,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      try {
        const synced = await syncDefaultAdventureCatalogToFirestore(
          staff.schoolId,
          staff.uid,
          staff.idToken
        );
        res.json({ ok: true, ...synced });
      } catch (err) {
        handleFirestoreRouteError(
          res,
          err,
          'Gagal menyinkronkan katalog 10 dunia, checkpoint, dan 12 lencana ke Firestore.'
        );
      }
    }
  );

  // =========================================================================
  // STAGE 3 — ASSESSMENT ENGINE API ROUTES
  // =========================================================================

  async function mirrorExamRecordToFirestore(
    staff: StaffAuthContext,
    exam: ExamRecord,
    questions?: ExamQuestionRecord[]
  ) {
    if (!staff.idToken || !isFirebaseServerConfigured) return;
    try {
      const targetQuestions = Array.isArray(questions) ? questions.slice(0, 60) : [];
      const [existingExamDoc, ...existingQuestionDocs] = await Promise.all([
        fsGetDoc<{ ownerId?: string }>(`assessments/${exam.id}`, staff.idToken).catch(() => ({
          exists: false,
          data: null,
        })),
        ...targetQuestions.map((q) =>
          fsGetDoc<{ ownerId?: string }>(`publicQuestions/${q.id}`, staff.idToken).catch(() => ({
            exists: false,
            data: null,
          }))
        ),
      ]);

      const assessmentBaseData: Record<string, unknown> = {
        id: exam.id,
        schoolId: exam.schoolId,
        classIds: exam.classIds,
        code: exam.code,
        codeHash: exam.codeHash,
        title: exam.title,
        ...(exam.description ? { description: exam.description } : {}),
        ...(exam.academicYear ? { academicYear: exam.academicYear } : {}),
        subjectId: exam.subjectId,
        worldThemeId: exam.worldThemeId,
        grade: exam.grade,
        semester: exam.semester,
        ...(exam.date ? { date: exam.date } : {}),
        ...(exam.startsAt ? { startsAt: exam.startsAt } : {}),
        ...(exam.endsAt ? { endsAt: exam.endsAt } : {}),
        durationMinutes: exam.durationMinutes,
        maxAttempts: exam.maxAttempts,
        allowMultipleSessions: exam.allowMultipleSessions,
        mode: exam.mode,
        status: exam.status,
        isLocked: exam.isLocked,
        isVisibleOnMap: exam.isVisibleOnMap,
        showScoreToStudent: exam.showScoreToStudent,
        introStory: exam.introStory,
        totalQuestions: exam.totalQuestions,
        ...(exam.targetQuestionCount ? { targetQuestionCount: exam.targetQuestionCount } : {}),
        checkpointInterval: exam.checkpointInterval,
        kkm: exam.kkm,
        navigationMode: exam.navigationMode,
        allowBack: exam.allowBack,
        allowEditAfterAnswer: exam.allowEditAfterAnswer,
        requireAnswerBeforeNext: exam.requireAnswerBeforeNext,
        shuffleQuestions: exam.shuffleQuestions,
        shuffleOptions: exam.shuffleOptions,
        identityMode: exam.identityMode,
        audioEnabled: exam.audioEnabled,
        examType: exam.examType,
        scoringPolicy: exam.scoringPolicy,
        resultPolicy: exam.resultPolicy,
        ...(exam.archivedAt ? { archivedAt: exam.archivedAt } : {}),
      };

      const writes: Parameters<typeof fsCommitWrites>[0] = [
        existingExamDoc.exists
          ? {
              docPath: `assessments/${exam.id}`,
              mode: 'update',
              data: assessmentBaseData,
              updateMaskFields: Object.keys(assessmentBaseData),
              serverTimestampFields: ['updatedAt'],
            }
          : {
              docPath: `assessments/${exam.id}`,
              mode: 'create',
              data: {
                ...assessmentBaseData,
                ownerId: staff.uid,
              },
              serverTimestampFields: ['createdAt', 'updatedAt'],
            },
        {
          docPath: `publicAssessments/${exam.id}`,
          mode: 'set',
          data: {
            id: exam.id,
            schoolId: exam.schoolId,
            classIds: exam.classIds,
            title: exam.title,
            ...(exam.description ? { description: exam.description } : {}),
            ...(exam.academicYear ? { academicYear: exam.academicYear } : {}),
            subjectId: exam.subjectId,
            worldThemeId: exam.worldThemeId,
            grade: exam.grade,
            semester: exam.semester,
            ...(exam.startsAt ? { startsAt: exam.startsAt } : {}),
            ...(exam.endsAt ? { endsAt: exam.endsAt } : {}),
            durationMinutes: exam.durationMinutes,
            maxAttempts: exam.maxAttempts,
            allowMultipleSessions: exam.allowMultipleSessions,
            mode: exam.mode,
            status: exam.status,
            isLocked: exam.isLocked,
            isVisibleOnMap: exam.isVisibleOnMap,
            showScoreToStudent: exam.showScoreToStudent,
            introStory: exam.introStory,
            totalQuestions: exam.totalQuestions,
            ...(exam.targetQuestionCount ? { targetQuestionCount: exam.targetQuestionCount } : {}),
            checkpointInterval: exam.checkpointInterval,
            navigationMode: exam.navigationMode,
            allowBack: exam.allowBack,
            allowEditAfterAnswer: exam.allowEditAfterAnswer,
            requireAnswerBeforeNext: exam.requireAnswerBeforeNext,
            shuffleQuestions: exam.shuffleQuestions,
            shuffleOptions: exam.shuffleOptions,
            identityMode: exam.identityMode,
            audioEnabled: exam.audioEnabled,
            examType: exam.examType,
            scoringPolicy: exam.scoringPolicy,
            resultPolicy: exam.resultPolicy,
            ownerId: existingExamDoc.data?.ownerId || exam.ownerId || staff.uid,
          },
          serverTimestampFields: ['updatedAt'],
        },
        {
          docPath: `assessmentAccess/${exam.codeHash}`,
          mode: 'set',
          data: {
            codeHash: exam.codeHash,
            schoolId: exam.schoolId,
            assessmentId: exam.id,
            subjectId: exam.subjectId,
            classIds: exam.classIds,
            status: exam.status,
            isLocked: exam.isLocked,
            ...(exam.startsAt ? { startsAt: exam.startsAt } : {}),
            ...(exam.endsAt ? { endsAt: exam.endsAt } : {}),
            maxAttempts: exam.maxAttempts,
            allowMultipleSessions: exam.allowMultipleSessions,
            identityMode: exam.identityMode,
            ownerId: existingExamDoc.data?.ownerId || exam.ownerId || staff.uid,
          },
          serverTimestampFields: ['updatedAt'],
        },
      ];

      for (let i = 0; i < targetQuestions.length; i++) {
        const q = targetQuestions[i];
        const existingQ = existingQuestionDocs[i];
        const publicQuestionData: Record<string, unknown> = {
          id: q.id,
          schoolId: q.schoolId,
          assessmentId: q.assessmentId,
          subjectId: q.subjectId,
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          ...(q.options ? { options: q.options } : {}),
          ...(q.mediaUrl ? { mediaUrl: q.mediaUrl } : {}),
          ...(q.audioUrl ? { audioUrl: q.audioUrl } : {}),
          ...(q.audioText ? { audioText: q.audioText } : {}),
          ...(q.matchLeft ? { matchLeft: q.matchLeft } : {}),
          ...(q.matchRight ? { matchRight: q.matchRight } : {}),
          ...(q.orderingItems ? { orderingItems: q.orderingItems } : {}),
          ...(q.dragItems ? { dragItems: q.dragItems } : {}),
          ...(q.dragTargets ? { dragTargets: q.dragTargets } : {}),
          ...(q.imageOptions ? { imageOptions: q.imageOptions } : {}),
          weight: q.weight,
          ...(q.topic ? { topic: q.topic } : {}),
          ...(q.indicator ? { indicator: q.indicator } : {}),
          ...(q.difficulty ? { difficulty: q.difficulty } : {}),
          ...(q.bankItemId ? { bankItemId: q.bankItemId } : {}),
          ...(typeof q.numericTolerance === 'number' ? { numericTolerance: q.numericTolerance } : {}),
          ...(typeof q.allowPartialScoring === 'boolean' ? { allowPartialScoring: q.allowPartialScoring } : {}),
          isPublished: q.isPublished,
        };

        writes.push(
          existingQ?.exists
            ? {
                docPath: `publicQuestions/${q.id}`,
                mode: 'update',
                data: publicQuestionData,
                updateMaskFields: Object.keys(publicQuestionData),
                serverTimestampFields: ['updatedAt'],
              }
            : {
                docPath: `publicQuestions/${q.id}`,
                mode: 'create',
                data: {
                  ...publicQuestionData,
                  ownerId: staff.uid,
                },
                serverTimestampFields: ['createdAt', 'updatedAt'],
              }
        );

        writes.push({
          docPath: `questionKeys/${q.id}`,
          mode: 'set',
          data: {
            questionId: q.id,
            schoolId: q.schoolId,
            assessmentId: q.assessmentId,
            type: q.type,
            correctAnswer: q.correctAnswer,
            ...(q.acceptedVariations ? { acceptedVariations: q.acceptedVariations } : {}),
            ...(typeof q.numericTolerance === 'number' ? { numericTolerance: q.numericTolerance } : {}),
            ...(q.rubric ? { rubric: q.rubric } : {}),
            ...(q.explanation ? { explanation: q.explanation } : {}),
            weight: q.weight,
            ownerId: existingQ?.data?.ownerId || q.ownerId || staff.uid,
          },
          serverTimestampFields: ['updatedAt'],
        });
      }

      await fsCommitWrites(writes, staff.idToken);
    } catch {
      // Non-fatal mirror failure if Firestore REST rejected offline or transient token
    }
  }

  // --- QUESTION BANK ROUTES ---
  app.get('/api/teacher/questions', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const items = listQuestionBankItemsEngine(staff.schoolId, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      subjectId: typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined,
      grade: typeof req.query.grade === 'string' ? req.query.grade : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
      difficulty: typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined,
      status:
        req.query.status === 'archived' || req.query.status === 'all' ? req.query.status : 'active',
    });
    res.json({ ok: true, items, total: items.length });
  });

  app.post('/api/teacher/questions', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const result = await upsertQuestionBankItemEngine(staff, req.body || {});
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.status(201).json({ ok: true, item: result.item });
  });

  app.get('/api/teacher/questions/:questionId', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const item = getQuestionBankItemEngine(staff.schoolId, sanitizeId(String(req.params.questionId || '')));
    if (!item) {
      res.status(404).json({ error: 'Soal tidak ditemukan di Bank Soal.', code: 'QUESTION_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, item });
  });

  app.put('/api/teacher/questions/:questionId', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const questionId = sanitizeId(String(req.params.questionId || ''));
    const result = await upsertQuestionBankItemEngine(staff, { ...(req.body || {}), id: questionId });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json({ ok: true, item: result.item });
  });

  app.delete('/api/teacher/questions/:questionId', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const questionId = sanitizeId(String(req.params.questionId || ''));
    const forceArchive = req.query.archive === 'true';
    const result = await deleteOrArchiveQuestionBankItemEngine(staff, questionId, forceArchive);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json(result);
  });

  app.post('/api/teacher/questions/:questionId/duplicate', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const questionId = sanitizeId(String(req.params.questionId || ''));
    const result = await duplicateQuestionBankItemEngine(staff, questionId);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.status(201).json(result);
  });

  // --- EXAM BUILDER & MANAGEMENT ROUTES ---
  app.post('/api/teacher/exams/sync-mirror', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const result = await syncExamFromTeacherClient(staff, req.body || {});
    res.json(result);
  });

  app.get('/api/teacher/exams', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const items = listExamsForTeacherEngine(staff.schoolId, statusFilter);
    res.json({ ok: true, items });
  });

  app.post('/api/teacher/exams', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const result = await upsertExamEngine(staff, req.body || {});
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    await mirrorExamRecordToFirestore(staff, result.exam);
    res.status(201).json(result);
  });

  app.get('/api/teacher/exams/:examId', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const detail = getExamDetailForTeacherEngine(staff.schoolId, examId);
    if (!detail) {
      res.status(404).json({ error: 'Asesmen tidak ditemukan.', code: 'EXAM_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, ...detail });
  });

  app.put('/api/teacher/exams/:examId', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const result = await upsertExamEngine(staff, { ...(req.body || {}), id: examId });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    const detail = getExamDetailForTeacherEngine(staff.schoolId, examId);
    await mirrorExamRecordToFirestore(staff, result.exam, detail?.questions);
    res.json(result);
  });

  app.post('/api/teacher/exams/:examId/questions', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const result = await addOrAttachQuestionsToExamEngine(staff, examId, req.body || {});
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    const detail = getExamDetailForTeacherEngine(staff.schoolId, examId);
    if (detail) {
      await mirrorExamRecordToFirestore(staff, detail.exam, detail.questions);
    }
    res.json(result);
  });

  app.delete('/api/teacher/exams/:examId/questions/:questionId', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const questionId = sanitizeId(String(req.params.questionId || ''));
    const result = await removeExamQuestionEngine(staff, examId, questionId);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    const detail = getExamDetailForTeacherEngine(staff.schoolId, examId);
    if (detail) {
      await mirrorExamRecordToFirestore(staff, detail.exam, detail.questions);
    }
    res.json(result);
  });

  app.post('/api/teacher/exams/:examId/publish', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const result = await transitionExamStatusEngine(staff, examId, 'active');
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    const detail = getExamDetailForTeacherEngine(staff.schoolId, examId);
    await mirrorExamRecordToFirestore(staff, result.exam, detail?.questions);
    res.json(result);
  });

  app.post('/api/teacher/exams/:examId/close', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const result = await transitionExamStatusEngine(staff, examId, 'closed');
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    await mirrorExamRecordToFirestore(staff, result.exam);
    res.json(result);
  });

  app.post('/api/teacher/exams/:examId/archive', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const result = await transitionExamStatusEngine(staff, examId, 'archived');
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    await mirrorExamRecordToFirestore(staff, result.exam);
    res.json(result);
  });

  // --- STUDENT EXAM LIFECYCLE ROUTES ---
  app.post('/api/student/exam/enter', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as { assessmentId?: unknown };
    const requestedId = typeof body.assessmentId === 'string' ? body.assessmentId : undefined;
    const result = await enterExamForStudentEngine(req.studentAuth!, requestedId);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json(result);
  });

  app.post('/api/student/exam/start', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as { assessmentId?: unknown };
    const requestedId = typeof body.assessmentId === 'string' ? body.assessmentId : undefined;
    const result = await startExamForStudentEngine(
      req.studentAuth!,
      requestedId,
      req.studentTokenPayload?.sessionId
    );
    if (result.ok === false) {
      res.status(result.status).json({
        error: result.message,
        code: result.code,
        ...('submission' in result && result.submission ? { submission: result.submission } : {}),
      });
      return;
    }
    res.json(result);
  });

  app.get('/api/student/exam/session', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = req.studentTokenPayload!.sessionId;
    const result = await getStudentSessionPayloadEngine(req.studentAuth!, sesId);
    if (result.ok === false) {
      res.status(result.status).json({
        error: result.message,
        code: result.code,
        ...('submission' in result && result.submission ? { submission: result.submission } : {}),
      });
      return;
    }
    res.json(result);
  });

  app.get('/api/student/exam/session/:sessionId', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = sanitizeId(String(req.params.sessionId || ''));
    const result = await getStudentSessionPayloadEngine(req.studentAuth!, sesId);
    if (result.ok === false) {
      res.status(result.status).json({
        error: result.message,
        code: result.code,
        ...('submission' in result && result.submission ? { submission: result.submission } : {}),
      });
      return;
    }
    res.json(result);
  });

  app.post('/api/student/exam/session/:sessionId/answer', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = sanitizeId(String(req.params.sessionId || ''));
    const body = (req.body || {}) as { questionId?: unknown; answerValue?: unknown; currentIndex?: unknown };
    if (typeof body.questionId !== 'string' || !body.questionId.trim()) {
      res.status(400).json({ error: 'questionId wajib diisi.', code: 'INVALID_QUESTION_ID' });
      return;
    }
    const result = await saveStudentAnswerEngine(req.studentAuth!, sesId, {
      questionId: body.questionId,
      answerValue: typeof body.answerValue === 'string' ? body.answerValue : '',
      currentIndex: typeof body.currentIndex === 'number' ? body.currentIndex : undefined,
    });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json(result);
  });

  app.post('/api/student/exam/session/:sessionId/flag', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = sanitizeId(String(req.params.sessionId || ''));
    const body = (req.body || {}) as { questionId?: unknown; flagged?: unknown };
    if (typeof body.questionId !== 'string' || !body.questionId.trim()) {
      res.status(400).json({ error: 'questionId wajib diisi.', code: 'INVALID_QUESTION_ID' });
      return;
    }
    const result = await toggleStudentQuestionFlagEngine(
      req.studentAuth!,
      sesId,
      body.questionId,
      typeof body.flagged === 'boolean' ? body.flagged : undefined
    );
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json(result);
  });

  app.get('/api/student/exam/session/:sessionId/status', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = sanitizeId(String(req.params.sessionId || ''));
    const result = await getStudentSessionStatusEngine(req.studentAuth!, sesId);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json(result);
  });

  app.post('/api/student/exam/session/:sessionId/submit', authenticateStudent, async (req: AuthenticatedRequest, res) => {
    const sesId = sanitizeId(String(req.params.sessionId || ''));
    const body = (req.body || {}) as {
      pendingAnswers?: Array<{ questionId: string; answerValue: string }>;
      autoSubmittedByTimeout?: boolean;
    };
    const result = await submitStudentExamEngine(req.studentAuth!, sesId, {
      pendingAnswers: Array.isArray(body.pendingAnswers) ? body.pendingAnswers : undefined,
      autoSubmittedByTimeout: body.autoSubmittedByTimeout === true,
    });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }
    res.json({
      ok: true,
      alreadySubmitted: result.alreadySubmitted,
      result: result.result,
    });
  });

  // --- RESULTS & ESSAY GRADING ROUTES ---
  app.get('/api/teacher/exams/:examId/results', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const examId = sanitizeId(String(req.params.examId || ''));
    const data = getTeacherExamResultsEngine(staff.schoolId, examId);
    res.json({ ok: true, ...data });
  });

  app.get('/api/teacher/submissions/:submissionId', authenticateStaff, requireRole(['admin', 'teacher']), (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const submissionId = sanitizeId(String(req.params.submissionId || ''));
    const detail = getSubmissionDetailForTeacherEngine(staff.schoolId, submissionId);
    if (!detail) {
      res.status(404).json({ error: 'Submission tidak ditemukan.', code: 'SUBMISSION_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, ...detail });
  });

  app.post('/api/teacher/submissions/:submissionId/grade', authenticateStaff, requireRole(['admin', 'teacher']), async (req: AuthenticatedRequest, res) => {
    const staff = req.staffAuth!;
    const submissionId = sanitizeId(String(req.params.submissionId || ''));
    const body = (req.body || {}) as {
      grades?: Array<{ questionId: string; score: number; comment?: string }>;
    };
    if (!Array.isArray(body.grades) || body.grades.length === 0) {
      res.status(400).json({ error: 'Daftar penilaian uraian (grades) wajib diisi.', code: 'INVALID_GRADES' });
      return;
    }
    const result = await gradeEssaySubmissionEngine(staff, submissionId, body.grades);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, code: result.code });
      return;
    }

    // Mirror updated graded result to Firestore results/{sessionId}
    if (staff.idToken && isFirebaseServerConfigured) {
      const sub = result.submission;
      try {
        const existingResult = await fsGetDoc(`results/${sub.sessionId}`, staff.idToken).catch(() => ({
          exists: false,
          data: null,
        }));
        const resultPayload: Record<string, unknown> = {
          sessionId: sub.sessionId,
          schoolId: sub.schoolId,
          assessmentId: sub.assessmentId,
          assessmentTitle: sub.assessmentTitle,
          subjectId: sub.subjectId,
          ...(sub.classId ? { classId: sub.classId } : {}),
          ...(sub.studentId ? { studentId: sub.studentId } : {}),
          studentName: sub.studentName,
          gradeClass: sub.gradeClass,
          ...(sub.participantNumber ? { participantNumber: sub.participantNumber } : {}),
          examMode: sub.examMode,
          examType: sub.examType,
          attemptNumber: sub.attemptNumber,
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
          gradedBy: staff.uid,
          startedAt: sub.startedAt,
          submittedAt: sub.submittedAt,
        };
        await fsCommitWrites(
          [
            existingResult.exists
              ? {
                  docPath: `results/${sub.sessionId}`,
                  mode: 'update',
                  data: resultPayload,
                  updateMaskFields: Object.keys(resultPayload),
                  serverTimestampFields: ['updatedAt'],
                }
              : {
                  docPath: `results/${sub.sessionId}`,
                  mode: 'create',
                  data: resultPayload,
                  serverTimestampFields: ['createdAt', 'updatedAt'],
                },
          ],
          staff.idToken
        );
      } catch {
        // Non-blocking Firestore mirror
      }
    }

    res.json(result);
  });

  app.get('/api/student/results', authenticateStudent, (req: AuthenticatedRequest, res) => {
    const items = getStudentResultsHistoryEngine(req.studentAuth!);
    res.json({ ok: true, items });
  });

  // --- STAGE 4: AI QUESTION IMPORT ROUTES ---
  pruneExpiredImportTempFiles();
  setInterval(() => {
    pruneExpiredImportTempFiles();
  }, 10 * 60 * 1000).unref();

  const importUploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMPORT_FILE_SIZE_BYTES,
      files: MAX_IMPORT_FILES_PER_BATCH,
    },
  });

  function sanitizeImportRouteBatch(batch: ReturnType<typeof getImportBatchEngine>) {
    if (!batch) return null;
    return {
      ...batch,
      files: batch.files.map(({ storedFileName: _omit, ...rest }) => rest),
      tempAssets: batch.tempAssets.map(({ storedFileName: _omit, ...rest }) => rest),
    };
  }

  app.get(
    '/api/teacher/import/status',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (_req: AuthenticatedRequest, res) => {
      res.json({
        ok: true,
        geminiConfigured: isGeminiImportConfigured(),
        maxFileSizeBytes: MAX_IMPORT_FILE_SIZE_BYTES,
        maxFilesPerBatch: MAX_IMPORT_FILES_PER_BATCH,
        storageBucketConfigured: Boolean(FIREBASE_STORAGE_BUCKET),
      });
    }
  );

  app.get(
    '/api/teacher/import/batches',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const items = listImportBatchesEngine(staff.schoolId);
      res.json({ ok: true, items });
    }
  );

  app.post(
    '/api/teacher/import/batches',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const body = (req.body || {}) as {
        sourceMode?: 'document' | 'photo' | 'camera';
        defaultSubjectId?: string;
        defaultGrade?: string;
        defaultSemester?: 'Ganjil' | 'Genap';
        defaultTopic?: string;
      };
      const batch = await createImportBatchEngine(staff, body);
      res.status(201).json({ ok: true, batch: sanitizeImportRouteBatch(batch) });
    }
  );

  app.post(
    '/api/teacher/import/batches/:batchId/upload',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      importUploadMiddleware.array('files', MAX_IMPORT_FILES_PER_BATCH)(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              res.status(400).json({
                error: 'Ukuran salah satu berkas melebihi batas maksimal 10 MB.',
                code: 'FILE_TOO_LARGE',
              });
              return;
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              res.status(400).json({
                error: `Maksimal ${MAX_IMPORT_FILES_PER_BATCH} berkas dalam satu sesi impor.`,
                code: 'TOO_MANY_FILES',
              });
              return;
            }
          }
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Gagal membaca berkas unggahan.',
            code: 'UPLOAD_ERROR',
          });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const incoming = uploadedFiles.map((f) => ({
        originalName: f.originalname,
        mimeType: f.mimetype,
        sizeBytes: f.size,
        buffer: f.buffer,
      }));
      const sourceMode =
        req.body?.sourceMode === 'photo' || req.body?.sourceMode === 'camera'
          ? req.body.sourceMode
          : undefined;

      const result = await uploadFilesToImportBatchEngine(staff, batchId, incoming, sourceMode);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ ok: true, batch: sanitizeImportRouteBatch(result.batch) });
    }
  );

  app.post(
    '/api/teacher/import/batches/:batchId/extract',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const rl = checkRateLimit(`ai_import:${staff.schoolId}:${staff.uid}`, 20, 15 * 60 * 1000);
      if (!rl.allowed) {
        res.status(429).json({
          error: `Batas ekstraksi AI sementara tercapai. Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
          code: 'RATE_LIMITED',
        });
        return;
      }
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const result = await extractImportBatchEngine(staff, batchId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ ok: true, batch: sanitizeImportRouteBatch(result.batch) });
    }
  );

  app.get(
    '/api/teacher/import/batches/:batchId',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const batch = getImportBatchEngine(staff.schoolId, batchId);
      if (!batch) {
        res.status(404).json({ error: 'Sesi impor tidak ditemukan.', code: 'BATCH_NOT_FOUND' });
        return;
      }
      res.json({ ok: true, batch: sanitizeImportRouteBatch(batch) });
    }
  );

  app.put(
    '/api/teacher/import/batches/:batchId/questions',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const body = (req.body || {}) as { candidates?: unknown[] };
      const result = await updateImportCandidatesEngine(
        staff,
        batchId,
        Array.isArray(body.candidates) ? (body.candidates as never[]) : []
      );
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ ok: true, batch: sanitizeImportRouteBatch(result.batch) });
    }
  );

  app.post(
    '/api/teacher/import/batches/:batchId/save',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const body = (req.body || {}) as { selectedIds?: string[]; skipDuplicates?: boolean };
      const result = await saveImportBatchToBankEngine(staff, batchId, {
        selectedIds: Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : undefined,
        skipDuplicates: Boolean(body.skipDuplicates),
      });
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({
        ok: true,
        alreadySaved: result.alreadySaved,
        savedQuestionIds: result.savedQuestionIds,
        storageWarnings: result.storageWarnings,
        batch: sanitizeImportRouteBatch(result.batch),
      });
    }
  );

  app.post(
    '/api/teacher/import/batches/:batchId/cancel',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    async (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const result = await cancelImportBatchEngine(staff, batchId);
      if (result.ok === false) {
        res.status(result.status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ ok: true, batch: sanitizeImportRouteBatch(result.batch) });
    }
  );

  app.get(
    '/api/teacher/import/batches/:batchId/assets/:assetId',
    authenticateStaff,
    requireRole(['admin', 'teacher']),
    (req: AuthenticatedRequest, res) => {
      const staff = req.staffAuth!;
      const batchId = sanitizeId(String(req.params.batchId || ''));
      const assetId = sanitizeId(String(req.params.assetId || ''));
      const asset = getTempAssetBufferEngine(staff.schoolId, batchId, assetId);
      if (!asset) {
        res.status(404).json({ error: 'Aset gambar impor tidak ditemukan atau sudah kedaluwarsa.', code: 'ASSET_NOT_FOUND' });
        return;
      }
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(asset.buffer);
    }
  );

  app.all('/api/*', (_req, res) => {
    res.status(404).json({
      error: 'Endpoint API tidak ditemukan.',
      code: 'API_NOT_FOUND',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PSAS Adventure server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
