import fs from 'fs';
import path from 'path';

export type ImportSourceMode = 'document' | 'photo' | 'camera';
export type ImportBatchStatus =
  | 'uploaded'
  | 'processing'
  | 'review_required'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type CandidateExtractionStatus = 'success' | 'needs_review' | 'failed';
export type ImportDetectedKind = 'docx' | 'pdf' | 'xlsx' | 'csv' | 'image';

export interface ImportFileMetaRecord {
  id: string;
  originalName: string;
  sanitizedName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sourceMode: ImportSourceMode;
  detectedKind: ImportDetectedKind;
  storedFileName: string;
  uploadedAt: string;
  pageCount?: number;
  scannedPdf?: boolean;
}

export interface ImportTempAssetRecord {
  id: string;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceFileName: string;
  pageOrIndex?: number;
}

export interface ExtractedCandidateRecord {
  id: string;
  orderIndex: number;
  subjectId: string;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  topic: string;
  competency: string;
  indicator: string;
  type: string;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  prompt: string;
  options?: string[];
  matchLeft?: string[];
  matchRight?: string[];
  orderingItems?: string[];
  dragItems?: Array<{ id: string; label: string }>;
  dragTargets?: Array<{ id: string; label: string }>;
  imageOptions?: Array<{ id: string; label: string; imageUrl?: string; motif?: string }>;
  correctAnswer: string;
  hasExplicitKey: boolean;
  aiSuggestedAnswer?: string;
  aiSuggestionApproved: boolean;
  aiSuggestionConfidence?: number;
  aiSuggestionNote?: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  rubric?: string;
  explanation?: string;
  weight: number;
  imageUrl?: string;
  tempAssetId?: string;
  removeImage?: boolean;
  sourceFileName: string;
  sourceFileType: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
  extractionStatus: CandidateExtractionStatus;
  extractionConfidence: number;
  needsReview: boolean;
  uncertainSegments: string[];
  validationWarnings: string[];
  duplicateOfId?: string;
  duplicatePromptPreview?: string;
  duplicateSimilarity?: number;
  selectedForSave: boolean;
}

export interface ImportBatchStatsRecord {
  totalFiles: number;
  totalExtracted: number;
  readyCount: number;
  needsReviewCount: number;
  failedCount: number;
  missingKeyCount: number;
  duplicateCount: number;
  savedCount: number;
}

export interface ImportBatchStateRecord {
  id: string;
  schoolId: string;
  ownerId: string;
  ownerName: string;
  sourceMode: ImportSourceMode;
  defaultSubjectId: string;
  defaultGrade: string;
  defaultSemester: 'Ganjil' | 'Genap';
  defaultTopic: string;
  status: ImportBatchStatus;
  progressPercent: number;
  progressStage: string;
  progressMessage: string;
  errorMessage?: string;
  errorCode?: string;
  files: ImportFileMetaRecord[];
  tempAssets: ImportTempAssetRecord[];
  candidates: ExtractedCandidateRecord[];
  stats: ImportBatchStatsRecord;
  savedQuestionIds: string[];
  duplicateSkippedIds?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ImportStateSchema {
  version: number;
  batches: Record<string, ImportBatchStateRecord>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, 'import-state.json');
export const IMPORT_TEMP_ROOT = path.join(DATA_DIR, 'import-temp');

const TEMP_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const FINISHED_TEMP_AGE_MS = 15 * 60 * 1000; // 15 mins for completed/cancelled/failed

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(IMPORT_TEMP_ROOT)) {
    fs.mkdirSync(IMPORT_TEMP_ROOT, { recursive: true });
  }
}

export function sanitizeImportId(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
}

export function makeBatchKey(schoolId: string, batchId: string): string {
  return `${sanitizeImportId(schoolId)}::${sanitizeImportId(batchId)}`;
}

export function resolveSafeBatchDir(batchId: string): string {
  ensureDirectories();
  const safeId = sanitizeImportId(batchId);
  if (!safeId) {
    throw new Error('ID batch impor tidak valid.');
  }
  const target = path.resolve(IMPORT_TEMP_ROOT, safeId);
  if (!target.startsWith(IMPORT_TEMP_ROOT + path.sep)) {
    throw new Error('Akses direktori impor tidak diizinkan.');
  }
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
}

export function resolveSafeBatchSubFile(
  batchId: string,
  subFolder: 'uploads' | 'assets',
  storedFileName: string
): string {
  if (
    !storedFileName ||
    storedFileName.includes('/') ||
    storedFileName.includes('\\') ||
    storedFileName.includes('..')
  ) {
    throw new Error('Nama berkas sementara tidak valid atau mengandung karakter terlarang.');
  }
  const batchDir = resolveSafeBatchDir(batchId);
  const folderDir = path.resolve(batchDir, subFolder);
  if (!folderDir.startsWith(batchDir + path.sep)) {
    throw new Error('Subdirektori impor tidak valid.');
  }
  if (!fs.existsSync(folderDir)) {
    fs.mkdirSync(folderDir, { recursive: true });
  }
  const cleanFile = path.basename(storedFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!cleanFile || cleanFile === '.' || cleanFile === '..') {
    throw new Error('Nama berkas sementara tidak valid.');
  }
  const target = path.resolve(folderDir, cleanFile);
  if (!target.startsWith(folderDir + path.sep)) {
    throw new Error('Jalur berkas keluar dari ruang isolasi impor.');
  }
  return target;
}

export function cleanupBatchTempFiles(batchId: string): void {
  try {
    const safeId = sanitizeImportId(batchId);
    if (!safeId) return;
    const target = path.resolve(IMPORT_TEMP_ROOT, safeId);
    if (!target.startsWith(IMPORT_TEMP_ROOT + path.sep)) return;
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

export function cleanupBatchRawUploads(batchId: string): void {
  try {
    const safeId = sanitizeImportId(batchId);
    if (!safeId) return;
    const uploadsDir = path.resolve(IMPORT_TEMP_ROOT, safeId, 'uploads');
    if (!uploadsDir.startsWith(IMPORT_TEMP_ROOT + path.sep)) return;
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

function emptyState(): ImportStateSchema {
  return {
    version: 1,
    batches: {},
  };
}

let cachedState: ImportStateSchema | null = null;
let writeChain: Promise<void> = Promise.resolve();

function loadStateFromDisk(): ImportStateSchema {
  if (cachedState) return cachedState;
  ensureDirectories();
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ImportStateSchema>;
      cachedState = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        batches: parsed.batches && typeof parsed.batches === 'object' ? parsed.batches : {},
      };
      return cachedState;
    }
  } catch {
    // Recover cleanly with empty state
  }
  cachedState = emptyState();
  return cachedState;
}

function persistStateToDisk(state: ImportStateSchema): void {
  ensureDirectories();
  const tmpPath = `${STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, STATE_PATH);
}

export function getImportStateSnapshot(): ImportStateSchema {
  return loadStateFromDisk();
}

export async function mutateImportState<T>(
  mutator: (state: ImportStateSchema) => Promise<T> | T
): Promise<T> {
  const prev = writeChain;
  let release!: () => void;
  writeChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prev;
  try {
    const state = loadStateFromDisk();
    const result = await mutator(state);
    persistStateToDisk(state);
    return result;
  } finally {
    release();
  }
}

export function computeBatchStats(batch: Pick<ImportBatchStateRecord, 'files' | 'candidates' | 'savedQuestionIds'>): ImportBatchStatsRecord {
  const readyCount = batch.candidates.filter(
    (c) => c.extractionStatus === 'success' && !c.needsReview && Boolean(c.correctAnswer.trim())
  ).length;
  const needsReviewCount = batch.candidates.filter(
    (c) => c.needsReview || c.extractionStatus === 'needs_review'
  ).length;
  const failedCount = batch.candidates.filter((c) => c.extractionStatus === 'failed').length;
  const missingKeyCount = batch.candidates.filter(
    (c) => !c.correctAnswer || !c.correctAnswer.trim()
  ).length;
  const duplicateCount = batch.candidates.filter((c) => Boolean(c.duplicateOfId)).length;

  return {
    totalFiles: batch.files.length,
    totalExtracted: batch.candidates.length,
    readyCount,
    needsReviewCount,
    failedCount,
    missingKeyCount,
    duplicateCount,
    savedCount: batch.savedQuestionIds.length,
  };
}

export function pruneExpiredImportTempFiles(): void {
  try {
    ensureDirectories();
    const state = loadStateFromDisk();
    const batchById = new Map<string, ImportBatchStateRecord>();
    for (const b of Object.values(state.batches)) {
      batchById.set(b.id, b);
    }

    const entries = fs.readdirSync(IMPORT_TEMP_ROOT, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.resolve(IMPORT_TEMP_ROOT, entry.name);
      if (!dirPath.startsWith(IMPORT_TEMP_ROOT + path.sep)) continue;

      const stat = fs.statSync(dirPath);
      const ageMs = now - stat.mtimeMs;
      const batch = batchById.get(entry.name);
      const isFinished =
        batch && (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed');

      if (!batch && ageMs > FINISHED_TEMP_AGE_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else if (isFinished && ageMs > FINISHED_TEMP_AGE_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else if (ageMs > TEMP_MAX_AGE_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    }
  } catch {
    // Non-fatal background pruning
  }
}

export function resetImportStateCacheForTests(): void {
  cachedState = null;
}
