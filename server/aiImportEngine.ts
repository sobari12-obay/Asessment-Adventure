import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type, type Part, type Schema } from '@google/genai';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import { upsertQuestionBankItemEngine } from './assessmentEngine.js';
import { getAssessmentStateSnapshot, type DifficultyLevel } from './assessmentStore.js';
import { FIREBASE_STORAGE_BUCKET, isFirebaseServerConfigured } from './firebaseAdmin.js';
import { fsCommitWrites, fsGetDoc } from './firestoreRest.js';
import {
  cleanupBatchRawUploads,
  cleanupBatchTempFiles,
  computeBatchStats,
  getImportStateSnapshot,
  makeBatchKey,
  mutateImportState,
  resolveSafeBatchSubFile,
  sanitizeImportId,
  type CandidateExtractionStatus,
  type ExtractedCandidateRecord,
  type ImportBatchStateRecord,
  type ImportDetectedKind,
  type ImportFileMetaRecord,
  type ImportSourceMode,
  type ImportTempAssetRecord,
} from './importStore.js';

export const GEMINI_IMPORT_MODEL = 'gemini-4-hydrogen';
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_IMPORT_FILES_PER_BATCH = 5;
export const MAX_IMPORT_BATCH_TOTAL_BYTES = 35 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.docx',
  '.pdf',
  '.xlsx',
  '.csv',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

const ALLOWED_SUBJECT_IDS = new Set([
  'pai',
  'pancasila',
  'bahasa_indonesia',
  'matematika',
  'ipas',
  'seni_rupa',
  'pjok',
  'bahasa_inggris',
  'bahasa_sunda',
  'bahasa_cirebon',
]);

const ALLOWED_QUESTION_TYPES = new Set([
  'multiple_choice',
  'true_false',
  'short_answer',
  'matching',
  'ordering',
  'drag_drop',
  'image_choice',
  'audio',
  'illustrated',
  'multiple_select',
  'essay',
]);

export interface ImportStaffActor {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'teacher';
  schoolId: string;
  idToken?: string;
}

export interface IncomingUploadFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export function isGeminiImportConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key !== 'undefined' && key.length >= 10);
}

function getGeminiClient(): GoogleGenAI {
  if (!isGeminiImportConfigured()) {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada server. Impor AI untuk dokumen PDF, Word, atau foto membutuhkan kunci API Gemini di sisi server.'
    ) as Error & { status?: number; code?: string };
    err.status = 503;
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!.trim(),
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export function sanitizeDisplayFilename(name: string): string {
  const base = path.basename(String(name || 'berkas').trim());
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s()]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'berkas').slice(0, 160);
}

function checkImageMagicBytes(buf: Buffer, ext: string): boolean {
  if (ext === '.png') {
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === '.webp') {
    return (
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export async function validateUploadedFile(
  file: IncomingUploadFile
): Promise<{
  ok: true;
  detectedKind: ImportDetectedKind;
  extension: string;
  sanitizedName: string;
  normalizedMime: string;
} | { ok: false; status: number; code: string; message: string }> {
  const sanitizedName = sanitizeDisplayFilename(file.originalName);
  const ext = path.extname(sanitizedName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      status: 400,
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `Format file "${sanitizedName}" tidak didukung. Gunakan .docx, .pdf, .xlsx, .csv, .jpg, .jpeg, .png, atau .webp.`,
    };
  }

  if (!file.buffer || file.sizeBytes <= 0 || file.buffer.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'EMPTY_FILE',
      message: `File "${sanitizedName}" kosong atau tidak dapat dibaca.`,
    };
  }

  if (file.sizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
    return {
      ok: false,
      status: 400,
      code: 'FILE_TOO_LARGE',
      message: `Ukuran file "${sanitizedName}" melebihi batas maksimal 10 MB per file.`,
    };
  }

  const buf = file.buffer;

  if (ext === '.pdf') {
    const header = buf.subarray(0, Math.min(buf.length, 1024)).toString('latin1');
    if (!header.includes('%PDF-')) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_FILE_SIGNATURE',
        message: `File "${sanitizedName}" bukan dokumen PDF yang valid (header PDF tidak cocok).`,
      };
    }
    return {
      ok: true,
      detectedKind: 'pdf',
      extension: ext,
      sanitizedName,
      normalizedMime: 'application/pdf',
    };
  }

  if (ext === '.docx' || ext === '.xlsx') {
    const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    if (!isZip) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_FILE_SIGNATURE',
        message: `File "${sanitizedName}" bukan arsip ${ext.toUpperCase()} yang valid.`,
      };
    }
    try {
      const zip = await JSZip.loadAsync(buf);
      if (ext === '.docx') {
        if (!zip.file('word/document.xml')) {
          return {
            ok: false,
            status: 400,
            code: 'INVALID_DOCX_STRUCTURE',
            message: `File "${sanitizedName}" tidak memiliki struktur dokumen Word (word/document.xml).`,
          };
        }
        return {
          ok: true,
          detectedKind: 'docx',
          extension: ext,
          sanitizedName,
          normalizedMime:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      }
      const hasXl = Object.keys(zip.files).some((k) => k.startsWith('xl/'));
      if (!hasXl) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_XLSX_STRUCTURE',
          message: `File "${sanitizedName}" tidak memiliki struktur workbook Excel yang valid.`,
        };
      }
      return {
        ok: true,
        detectedKind: 'xlsx',
        extension: ext,
        sanitizedName,
        normalizedMime:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } catch {
      return {
        ok: false,
        status: 400,
        code: 'CORRUPT_ARCHIVE',
        message: `File "${sanitizedName}" rusak atau terenkripsi sehingga tidak dapat dibuka.`,
      };
    }
  }

  if (ext === '.csv') {
    const sample = buf.subarray(0, Math.min(buf.length, 4096));
    if (sample.includes(0x00)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_CSV_FILE',
        message: `File "${sanitizedName}" mengandung data biner dan bukan berkas teks CSV yang valid.`,
      };
    }
    return {
      ok: true,
      detectedKind: 'csv',
      extension: ext,
      sanitizedName,
      normalizedMime: 'text/csv',
    };
  }

  // Images
  if (!checkImageMagicBytes(buf, ext)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_IMAGE_SIGNATURE',
      message: `File "${sanitizedName}" bukan gambar ${ext.toUpperCase()} yang valid.`,
    };
  }

  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  return {
    ok: true,
    detectedKind: 'image',
    extension: ext,
    sanitizedName,
    normalizedMime: mime,
  };
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function guessImageMimeFromExt(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return null;
}

async function extractDocxStructuredContent(
  batchId: string,
  sourceFileName: string,
  buffer: Buffer
): Promise<{
  text: string;
  extractedAssets: Array<{ asset: ImportTempAssetRecord; mimeType: string; buffer: Buffer }>;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const extractedAssets: Array<{ asset: ImportTempAssetRecord; mimeType: string; buffer: Buffer }> = [];
  const targetToAssetId = new Map<string, string>();
  const rIdToAssetId = new Map<string, string>();

  // 1. Extract embedded images in word/media/*
  const mediaPaths = Object.keys(zip.files)
    .filter((p) => p.startsWith('word/media/') && !zip.files[p].dir)
    .sort()
    .slice(0, 25);

  let idx = 0;
  for (const mediaPath of mediaPaths) {
    const mimeType = guessImageMimeFromExt(mediaPath);
    if (!mimeType) continue;
    const imgBuf = await zip.files[mediaPath].async('nodebuffer');
    if (imgBuf.length === 0 || imgBuf.length > 3 * 1024 * 1024) continue;
    idx += 1;
    const ext = path.extname(mediaPath).toLowerCase() || '.png';
    const assetId = sanitizeImportId(`asset_${batchId}_${idx}_${crypto.randomBytes(2).toString('hex')}`);
    const origImgName = path.basename(mediaPath);
    const storedFileName = `${assetId}${ext}`;
    const destPath = resolveSafeBatchSubFile(batchId, 'assets', storedFileName);
    fs.writeFileSync(destPath, imgBuf);

    const asset: ImportTempAssetRecord = {
      id: assetId,
      fileName: origImgName,
      storedFileName,
      mimeType,
      sizeBytes: imgBuf.length,
      sourceFileName,
      pageOrIndex: idx,
    };
    extractedAssets.push({ asset, mimeType, buffer: imgBuf });
    targetToAssetId.set(mediaPath.replace(/^word\//, ''), assetId);
    targetToAssetId.set(mediaPath, assetId);
  }

  // 2. Map rIds in word/_rels/document.xml.rels to extracted assetIds
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const relsXml = await relsFile.async('string');
    const relMatches = relsXml.matchAll(/<Relationship\b[^>]*>/gi);
    for (const m of relMatches) {
      const tag = m[0];
      const idMatch = tag.match(/\bId="([^"]+)"/i);
      const targetMatch = tag.match(/\bTarget="([^"]+)"/i);
      if (idMatch && targetMatch) {
        const cleanTarget = targetMatch[1].replace(/^\/+/, '');
        const matchedAssetId =
          targetToAssetId.get(cleanTarget) ||
          targetToAssetId.get(`word/${cleanTarget}`) ||
          targetToAssetId.get(cleanTarget.replace(/^word\//, ''));
        if (matchedAssetId) {
          rIdToAssetId.set(idMatch[1], matchedAssetId);
        }
      }
    }
  }

  // 3. Parse word/document.xml preserving tables & inline image markers
  let structuredXmlText = '';
  const docXmlFile = zip.file('word/document.xml');
  if (docXmlFile) {
    const docXml = await docXmlFile.async('string');
    const lines: string[] = [];

    // Tokenize paragraphs and tables cleanly by replacing XML tags while keeping structure
    const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/i);
    const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

    // Extract rows/paragraphs in order
    const blockRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/gi;
    const blocks = bodyXml.match(blockRegex) || [];

    const parseParagraphXml = (pXml: string): string => {
      let out = pXml;
      out = out.replace(/<w:tab\b[^>]*\/>/gi, '\t');
      out = out.replace(/<w:br\b[^>]*\/>/gi, '\n');
      out = out.replace(/(?:r:embed|r:link)="([^"]+)"/gi, (_m, rId) => {
        const assetId = rIdToAssetId.get(rId);
        return assetId ? ` [LAMPIRAN_GAMBAR_ID:${assetId}] ` : '';
      });
      out = out.replace(/<[^>]+>/g, '');
      return decodeXmlEntities(out).replace(/[ \t]+/g, ' ').trim();
    };

    for (const block of blocks) {
      if (block.startsWith('<w:tbl')) {
        lines.push('[MULAI TABEL]');
        const rows = block.match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) || [];
        for (const row of rows) {
          const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) || [];
          const cellTexts = cells.map((cell) => {
            const cellParas = cell.match(/<w:p\b[\s\S]*?<\/w:p>/gi) || [];
            return cellParas
              .map(parseParagraphXml)
              .filter(Boolean)
              .join(' / ');
          });
          if (cellTexts.some(Boolean)) {
            lines.push(`| ${cellTexts.join(' | ')} |`);
          }
        }
        lines.push('[AKHIR TABEL]');
      } else {
        const line = parseParagraphXml(block);
        if (line) lines.push(line);
      }
    }
    structuredXmlText = lines.join('\n');
  }

  // Also extract mammoth raw text as clean fallback
  let mammothText = '';
  try {
    const mRes = await mammoth.extractRawText({ buffer });
    mammothText = (mRes.value || '').trim();
  } catch {
    mammothText = '';
  }

  const combinedText =
    structuredXmlText.length >= 20
      ? structuredXmlText
      : mammothText || '[Dokumen Word tidak memiliki teks yang dapat dibaca]';

  return { text: combinedText, extractedAssets };
}

async function extractPdfContent(buffer: Buffer): Promise<{
  text: string;
  pageCount: number;
  scannedPdf: boolean;
}> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    const pageCount = Math.max(1, res.total || (Array.isArray(res.pages) ? res.pages.length : 1));
    const pageTexts =
      Array.isArray(res.pages) && res.pages.length > 0
        ? res.pages.map((p) => `[HALAMAN ${p.num}]\n${(p.text || '').trim()}`).join('\n\n')
        : (res.text || '').trim();

    const rawText = (res.text || '').trim();
    const nonWs = rawText.replace(/\s+/g, '');
    const charsPerPage = nonWs.length / pageCount;
    const replacementCount = (rawText.match(/\uFFFD/g) || []).length;
    const scannedPdf =
      charsPerPage < 45 || (nonWs.length > 0 && replacementCount / nonWs.length > 0.08);

    return {
      text: pageTexts,
      pageCount,
      scannedPdf,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function normalizeHeaderCell(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseExcelOrCsvDeterministic(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  defaults: {
    subjectId: string;
    grade: string;
    semester: 'Ganjil' | 'Genap';
    topic: string;
  }
): {
  structuredFound: boolean;
  candidates: ExtractedCandidateRecord[];
  rawFallbackText: string;
} {
  const wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) {
    return { structuredFound: false, candidates: [], rawFallbackText: '' };
  }

  const allCandidates: ExtractedCandidateRecord[] = [];
  const fallbackChunks: string[] = [];

  for (const sheetName of sheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    if (rows.length === 0) continue;

    // Collect fallback text representation
    const textRows = rows
      .slice(0, 120)
      .map((r) => `| ${r.map((c) => String(c ?? '').trim()).join(' | ')} |`)
      .join('\n');
    fallbackChunks.push(`[SHEET: ${sheetName}]\n${textRows}`);

    // Detect header row within first 5 rows
    let headerIdx = -1;
    let colMap: Record<string, number> = {};
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const normalized = rows[r].map(normalizeHeaderCell);
      const findCol = (aliases: string[]): number =>
        normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

      const promptCol = findCol(['pertanyaan', 'soal', 'butir soal', 'teks soal', 'prompt', 'question']);
      if (promptCol >= 0) {
        headerIdx = r;
        colMap = {
          num: findCol(['no', 'nomor', 'number']),
          type: findCol(['tipe', 'jenis', 'type']),
          subject: findCol(['mapel', 'mata pelajaran', 'subject']),
          prompt: promptCol,
          optA: findCol(['opsi a', 'pilihan a', 'jawaban a', 'a']),
          optB: findCol(['opsi b', 'pilihan b', 'jawaban b', 'b']),
          optC: findCol(['opsi c', 'pilihan c', 'jawaban c', 'c']),
          optD: findCol(['opsi d', 'pilihan d', 'jawaban d', 'd']),
          optE: findCol(['opsi e', 'pilihan e', 'jawaban e', 'e']),
          options: findCol(['opsi', 'pilihan', 'options']),
          key: findCol(['kunci jawaban', 'kunci', 'jawaban benar', 'correct answer', 'answer', 'key']),
          explanation: findCol(['pembahasan', 'penjelasan', 'explanation']),
          rubric: findCol(['rubrik', 'rubric', 'pedoman']),
          topic: findCol(['topik', 'materi', 'bab', 'topic']),
          indicator: findCol(['indikator', 'indicator']),
          difficulty: findCol(['kesulitan', 'level', 'difficulty']),
          weight: findCol(['bobot', 'skor', 'poin', 'weight']),
        };
        break;
      }
    }

    if (headerIdx === -1) continue;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const prompt = String(row[colMap.prompt] ?? '').trim();
      if (!prompt) continue;

      const qNum =
        colMap.num >= 0 && String(row[colMap.num] ?? '').trim()
          ? String(row[colMap.num]).trim()
          : String(allCandidates.length + 1);

      const rawType = colMap.type >= 0 ? normalizeHeaderCell(row[colMap.type]) : '';
      let qType = 'multiple_choice';
      if (rawType.includes('uraian') || rawType.includes('essay') || rawType.includes('esai')) {
        qType = 'essay';
      } else if (rawType.includes('benar') || rawType.includes('true')) {
        qType = 'true_false';
      } else if (rawType.includes('isian') || rawType.includes('short')) {
        qType = 'short_answer';
      } else if (rawType.includes('kompleks') || rawType.includes('multiple select')) {
        qType = 'multiple_select';
      } else if (rawType.includes('jodoh') || rawType.includes('match')) {
        qType = 'matching';
      } else if (rawType.includes('urut') || rawType.includes('order')) {
        qType = 'ordering';
      }

      const rawOpts: string[] = [];
      for (const key of ['optA', 'optB', 'optC', 'optD', 'optE'] as const) {
        const idx = colMap[key];
        if (idx >= 0) {
          const val = String(row[idx] ?? '').trim();
          if (val) rawOpts.push(val);
        }
      }
      if (rawOpts.length === 0 && colMap.options >= 0) {
        const combined = String(row[colMap.options] ?? '').trim();
        if (combined) {
          for (const part of combined.split(/\s*[|;\n]\s*/)) {
            if (part.trim()) rawOpts.push(part.trim());
          }
        }
      }

      if (rawType === '' && rawOpts.length === 0) {
        qType = 'short_answer';
      }

      const rawKey = colMap.key >= 0 ? String(row[colMap.key] ?? '').trim() : '';
      let resolvedKey = rawKey;
      const hasExplicitKey = Boolean(rawKey);

      if (hasExplicitKey && (qType === 'multiple_choice' || qType === 'illustrated' || qType === 'audio')) {
        const letterMatch = rawKey.match(/^([A-Ea-e])(?:\s*[.)])?$/);
        if (letterMatch) {
          const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
          if (rawOpts[letterIdx]) {
            resolvedKey = rawOpts[letterIdx];
          }
        }
      } else if (hasExplicitKey && qType === 'true_false') {
        const lk = rawKey.toLowerCase();
        if (lk === 'b' || lk === 'benar' || lk === 'true' || lk === 't') resolvedKey = 'Benar';
        if (lk === 's' || lk === 'salah' || lk === 'false' || lk === 'f') resolvedKey = 'Salah';
      } else if (hasExplicitKey && qType === 'multiple_select') {
        const tokens = rawKey
          .split(/[,;|]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => {
            const lm = t.match(/^([A-Ea-e])(?:\s*[.)])?$/);
            if (lm) {
              const li = lm[1].toUpperCase().charCodeAt(0) - 65;
              return rawOpts[li] || t;
            }
            return t;
          });
        resolvedKey = JSON.stringify(tokens);
      }

      const warnings: string[] = [];
      let needsReview = false;
      if (!hasExplicitKey) {
        needsReview = true;
        warnings.push('Belum ada kunci jawaban pada berkas sumber.');
      }
      if ((qType === 'multiple_choice' || qType === 'multiple_select') && rawOpts.length < 2) {
        needsReview = true;
        warnings.push('Opsi pilihan ganda kurang dari 2 pilihan.');
      }

      const rawDiff = colMap.difficulty >= 0 ? normalizeHeaderCell(row[colMap.difficulty]) : '';
      const difficulty: DifficultyLevel =
        rawDiff === 'mudah' ? 'mudah' : rawDiff === 'sulit' ? 'sulit' : 'sedang';

      const rawWeight = colMap.weight >= 0 ? Number(row[colMap.weight]) : NaN;
      const weight = Number.isFinite(rawWeight) && rawWeight > 0 && rawWeight <= 100 ? Math.round(rawWeight) : 10;

      const rawSubj = colMap.subject >= 0 ? normalizeHeaderCell(row[colMap.subject]).replace(/\s+/g, '_') : '';
      const subjectId = ALLOWED_SUBJECT_IDS.has(rawSubj) ? rawSubj : defaults.subjectId;

      allCandidates.push({
        id: `cand_${crypto.randomBytes(4).toString('hex')}`,
        orderIndex: allCandidates.length + 1,
        subjectId,
        grade: defaults.grade,
        semester: defaults.semester,
        topic:
          (colMap.topic >= 0 ? String(row[colMap.topic] ?? '').trim() : '') ||
          defaults.topic ||
          'Umum',
        competency: '',
        indicator: colMap.indicator >= 0 ? String(row[colMap.indicator] ?? '').trim() : '',
        type: qType,
        difficulty,
        prompt: prompt.slice(0, 2000),
        ...(rawOpts.length > 0 ? { options: rawOpts } : {}),
        correctAnswer: resolvedKey.slice(0, 2000),
        hasExplicitKey,
        aiSuggestionApproved: false,
        explanation:
          colMap.explanation >= 0 ? String(row[colMap.explanation] ?? '').trim().slice(0, 1000) : '',
        rubric: colMap.rubric >= 0 ? String(row[colMap.rubric] ?? '').trim().slice(0, 2000) : '',
        weight,
        sourceFileName: fileName,
        sourceFileType: fileType,
        sourceQuestionNumber: qNum,
        extractionStatus: needsReview ? 'needs_review' : 'success',
        extractionConfidence: needsReview ? 0.85 : 0.99,
        needsReview,
        uncertainSegments: [],
        validationWarnings: warnings,
        selectedForSave: true,
      });
    }
  }

  return {
    structuredFound: allCandidates.length > 0,
    candidates: allCandidates,
    rawFallbackText: fallbackChunks.join('\n\n'),
  };
}

const GEMINI_QUESTION_SCHEMA: Schema = {
  type: Type.ARRAY,
  description: 'Daftar kandidat butir soal yang diekstrak dari dokumen atau gambar secara akurat tanpa mengarang.',
  items: {
    type: Type.OBJECT,
    properties: {
      sourceQuestionNumber: {
        type: Type.STRING,
        description: 'Nomor soal asli di sumber (contoh: "1", "2a", "Romawi II No 1").',
      },
      sourcePage: {
        type: Type.INTEGER,
        description: 'Nomor halaman sumber jika diketahui (mulai dari 1).',
      },
      type: {
        type: Type.STRING,
        description:
          'Jenis soal: multiple_choice, multiple_select, true_false, short_answer, matching, ordering, essay, atau illustrated.',
      },
      prompt: {
        type: Type.STRING,
        description: 'Teks pertanyaan utama secara utuh dan presisi tanpa mengubah angka, satuan, atau istilah.',
      },
      options: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Daftar isi teks opsi pilihan (hilangkan huruf prefix "A. ", "B. " jika jelas sebagai label opsi).',
      },
      matchLeft: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Khusus matching: daftar item kolom kiri.',
      },
      matchRight: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Khusus matching: daftar pasangan item kolom kanan.',
      },
      orderingItems: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Khusus ordering: daftar langkah/item.',
      },
      hasExplicitKey: {
        type: Type.BOOLEAN,
        description: 'True HANYA jika kunci jawaban tertulis secara eksplisit pada dokumen/gambar sumber. False jika tidak ada kunci di sumber.',
      },
      explicitKey: {
        type: Type.STRING,
        description: 'Kunci jawaban persis seperti di sumber (untuk PG: isi teks opsi yang benar; untuk PG kompleks: pisahkan dengan || ; untuk Benar/Salah: "Benar" atau "Salah"). Wajib string kosong "" jika hasExplicitKey = false.',
      },
      aiSuggestedAnswer: {
        type: Type.STRING,
        description: 'Opsional: saran jawaban AI terpisah untuk membantu guru meninjau bila kunci tidak tersedia di sumber. JANGAN masukkan ke explicitKey.',
      },
      aiSuggestionConfidence: {
        type: Type.NUMBER,
        description: 'Tingkat keyakinan saran jawaban AI antara 0 sampai 1.',
      },
      aiSuggestionNote: {
        type: Type.STRING,
        description: 'Catatan singkat alasan saran jawaban AI atau catatan verifikasi untuk guru.',
      },
      explanation: {
        type: Type.STRING,
        description: 'Pembahasan singkat jika ada di sumber atau relevan untuk membantu guru.',
      },
      rubric: {
        type: Type.STRING,
        description: 'Rubrik penilaian khusus soal uraian/essay jika ada di sumber.',
      },
      topic: {
        type: Type.STRING,
        description: 'Topik materi soal (jika dapat dikenali).',
      },
      indicator: {
        type: Type.STRING,
        description: 'Indikator pembelajaran singkat jika tertulis atau jelas.',
      },
      difficulty: {
        type: Type.STRING,
        description: 'mudah, sedang, atau sulit.',
      },
      weight: {
        type: Type.INTEGER,
        description: 'Bobot nilai soal (default 10 jika tidak tertulis).',
      },
      tempAssetId: {
        type: Type.STRING,
        description: 'Isi HANYA jika penanda [LAMPIRAN_GAMBAR_ID:...] benar-benar muncul pada soal tersebut di dokumen sumber.',
      },
      extractionStatus: {
        type: Type.STRING,
        description: 'success, needs_review, atau failed.',
      },
      extractionConfidence: {
        type: Type.NUMBER,
        description: 'Tingkat kejelasan pembacaan OCR/teks antara 0 sampai 1.',
      },
      needsReview: {
        type: Type.BOOLEAN,
        description: 'True jika ada teks buram, tulisan tangan ragu, opsi kurang lengkap, kunci belum ada, atau soal kompleks.',
      },
      uncertainSegments: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Bagian teks/angka/kata yang buram atau perlu dicek ulang oleh guru.',
      },
      validationWarnings: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Daftar peringatan validasi atau bagian yang tidak terbaca penuh.',
      },
    },
    required: [
      'type',
      'prompt',
      'hasExplicitKey',
      'explicitKey',
      'extractionStatus',
      'extractionConfidence',
      'needsReview',
    ],
  },
};

const SYSTEM_INSTRUCTION = [
  'Anda adalah spesialis ekstraksi soal SD Kelas 3 (Kurikulum Merdeka) untuk guru SDN Pekiringan.',
  'ATURAN KETAT ANTI-HALUSINASI DAN AKURASI:',
  '1. Ekstrak HANYA butir soal yang benar-benar tertulis atau tampak di dokumen/foto sumber. DILARANG membuat soal baru atau menambah opsi yang tidak ada.',
  '2. DILARANG mengubah angka, pecahan, operasi matematika, satuan, tanda baca penting, atau nama tokoh pada soal.',
  '3. KUNCI JAWABAN RESMI (hasExplicitKey & explicitKey): isi hasExplicitKey=true HANYA jika dokumen/gambar sumber secara eksplisit mencantumkan kunci jawaban (misal tabel kunci, tulisan "Kunci: B", tanda centang/tebal yang jelas). Jika sumber TIDAK mencantumkan kunci jawaban, WAJIB set hasExplicitKey=false dan explicitKey="".',
  '4. Anda boleh mengisi aiSuggestedAnswer secara TERPISAH sebagai saran untuk guru, namun TIDAK PERNAH menggantikan explicitKey.',
  '5. Jika tulisan buram, terpotong, tulisan tangan kurang jelas, atau simbol ambigu: lakukan transkripsi terbaik, set extractionStatus="needs_review", needsReview=true, turunkan extractionConfidence (< 0.8), dan cantumkan potongan kata/kalimat yang diragukan dalam uncertainSegments.',
  '6. Jika suatu nomor soal sama sekali tidak terbaca, tetap kembalikan entry dengan extractionStatus="failed", needsReview=true, dan jelaskan kendala pada validationWarnings.',
  '7. DILARANG mengarang gambar. Isi tempAssetId HANYA dengan ID yang tercantum di penanda [LAMPIRAN_GAMBAR_ID:...] milik soal tersebut.',
  '8. Untuk soal Pilihan Ganda, bersihkan awalan "A. ", "B. ", "C. ", "D. " dari teks masing-masing opsi jika huruf tersebut jelas hanya penanda pilihan.',
].join('\n');

interface RawGeminiQuestion {
  sourceQuestionNumber?: string;
  sourcePage?: number;
  type?: string;
  prompt?: string;
  options?: string[];
  matchLeft?: string[];
  matchRight?: string[];
  orderingItems?: string[];
  hasExplicitKey?: boolean;
  explicitKey?: string;
  aiSuggestedAnswer?: string;
  aiSuggestionConfidence?: number;
  aiSuggestionNote?: string;
  explanation?: string;
  rubric?: string;
  topic?: string;
  indicator?: string;
  difficulty?: string;
  weight?: number;
  tempAssetId?: string;
  extractionStatus?: string;
  extractionConfidence?: number;
  needsReview?: boolean;
  uncertainSegments?: string[];
  validationWarnings?: string[];
}

async function callGeminiWithRetry(parts: Part[], fileName: string): Promise<RawGeminiQuestion[]> {
  const ai = getGeminiClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const responsePromise = ai.models.generateContent({
        model: GEMINI_IMPORT_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_QUESTION_SCHEMA,
        },
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Proses AI melebihi batas waktu 90 detik saat membaca "${fileName}".`));
        }, 90_000);
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const rawText = (response.text || '').trim();
      if (!rawText) {
        return [];
      }
      const parsed = JSON.parse(rawText) as unknown;
      return Array.isArray(parsed) ? (parsed as RawGeminiQuestion[]) : [];
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('timeout');
      if (!isTransient || attempt === 2) {
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          const qErr = new Error(
            'Kuota permintaan Gemini AI sementara penuh. Silakan tunggu beberapa saat lalu coba ekstrak kembali.'
          ) as Error & { status?: number; code?: string };
          qErr.status = 429;
          qErr.code = 'GEMINI_QUOTA_EXCEEDED';
          throw qErr;
        }
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gagal memproses dokumen dengan AI.');
}

function normalizeGeminiQuestion(
  raw: RawGeminiQuestion,
  meta: {
    fileName: string;
    fileType: string;
    defaultSubjectId: string;
    defaultGrade: string;
    defaultSemester: 'Ganjil' | 'Genap';
    defaultTopic: string;
    validTempAssetIds: Set<string>;
    orderIndex: number;
  }
): ExtractedCandidateRecord {
  const rawType = String(raw.type || 'multiple_choice').trim().toLowerCase();
  const type = ALLOWED_QUESTION_TYPES.has(rawType) ? rawType : 'multiple_choice';

  const options = Array.isArray(raw.options)
    ? raw.options
        .map((o) =>
          String(o || '')
            .replace(/^[A-Ea-e][.)]\s+/, '')
            .trim()
        )
        .filter(Boolean)
        .slice(0, 8)
    : undefined;

  const hasExplicitKey = Boolean(raw.hasExplicitKey && typeof raw.explicitKey === 'string' && raw.explicitKey.trim());
  let officialKey = hasExplicitKey ? raw.explicitKey!.trim() : '';

  if (officialKey && (type === 'multiple_choice' || type === 'illustrated' || type === 'audio') && options?.length) {
    const letterMatch = officialKey.match(/^([A-Ea-e])(?:\s*[.)])?$/);
    if (letterMatch) {
      const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (options[idx]) officialKey = options[idx];
    } else {
      const stripped = officialKey.replace(/^[A-Ea-e][.)]\s+/, '').trim();
      const matchedOpt = options.find((o) => o.toLowerCase() === stripped.toLowerCase());
      if (matchedOpt) officialKey = matchedOpt;
    }
  } else if (officialKey && type === 'true_false') {
    const lk = officialKey.toLowerCase();
    if (lk === 'benar' || lk === 'true' || lk === 'b') officialKey = 'Benar';
    else if (lk === 'salah' || lk === 'false' || lk === 's') officialKey = 'Salah';
  } else if (officialKey && type === 'multiple_select') {
    try {
      const parsed = JSON.parse(officialKey) as unknown;
      if (Array.isArray(parsed)) {
        officialKey = JSON.stringify(parsed.map(String));
      }
    } catch {
      const items = officialKey
        .split(/\s*\|\|\s*|[,;]+/)
        .map((s) => s.replace(/^[A-Ea-e][.)]\s+/, '').trim())
        .filter(Boolean)
        .map((s) => {
          const lm = s.match(/^([A-Ea-e])$/);
          if (lm && options) {
            const idx = lm[1].toUpperCase().charCodeAt(0) - 65;
            return options[idx] || s;
          }
          return s;
        });
      officialKey = JSON.stringify(items);
    }
  } else if (officialKey && type === 'ordering' && Array.isArray(raw.orderingItems) && raw.orderingItems.length > 0) {
    try {
      JSON.parse(officialKey);
    } catch {
      officialKey = JSON.stringify(raw.orderingItems.map((i) => String(i).trim()).filter(Boolean));
    }
  }

  let aiSuggestedAnswer =
    typeof raw.aiSuggestedAnswer === 'string' && raw.aiSuggestedAnswer.trim()
      ? raw.aiSuggestedAnswer.trim().slice(0, 1000)
      : undefined;

  if (
    aiSuggestedAnswer &&
    (type === 'multiple_choice' || type === 'illustrated') &&
    options?.length
  ) {
    const lm = aiSuggestedAnswer.match(/^([A-Ea-e])(?:\s*[.)])?$/);
    if (lm) {
      const idx = lm[1].toUpperCase().charCodeAt(0) - 65;
      if (options[idx]) aiSuggestedAnswer = options[idx];
    }
  }

  const warnings = Array.isArray(raw.validationWarnings)
    ? raw.validationWarnings.map((w) => String(w).trim()).filter(Boolean)
    : [];
  const uncertainSegments = Array.isArray(raw.uncertainSegments)
    ? raw.uncertainSegments.map((u) => String(u).trim()).filter(Boolean)
    : [];

  if (!hasExplicitKey) {
    warnings.push('Sumber tidak mencantumkan kunci jawaban resmi — perlu ditinjau guru.');
  }
  if ((type === 'multiple_choice' || type === 'multiple_select') && (!options || options.length < 2)) {
    warnings.push('Pilihan jawaban kurang dari 2 opsi.');
  }

  const prompt = String(raw.prompt || '').trim().slice(0, 2000);
  const rawStatus = raw.extractionStatus;
  let extractionStatus: CandidateExtractionStatus =
    rawStatus === 'failed'
      ? 'failed'
      : rawStatus === 'needs_review'
        ? 'needs_review'
        : 'success';

  if (!prompt || prompt.length < 4) {
    extractionStatus = 'failed';
    warnings.push('Teks soal kosong atau gagal dibaca.');
  }

  const confidence =
    typeof raw.extractionConfidence === 'number'
      ? Math.max(0, Math.min(1, Number(raw.extractionConfidence)))
      : extractionStatus === 'success'
        ? 0.9
        : 0.55;

  const needsReview =
    Boolean(raw.needsReview) ||
    extractionStatus !== 'success' ||
    !hasExplicitKey ||
    uncertainSegments.length > 0 ||
    confidence < 0.78;

  const validAssetId =
    typeof raw.tempAssetId === 'string' && meta.validTempAssetIds.has(raw.tempAssetId.trim())
      ? raw.tempAssetId.trim()
      : undefined;

  const difficulty: DifficultyLevel =
    raw.difficulty === 'mudah' || raw.difficulty === 'sulit' ? raw.difficulty : 'sedang';

  const weight =
    typeof raw.weight === 'number' && Number.isFinite(raw.weight) && raw.weight > 0 && raw.weight <= 100
      ? Math.round(raw.weight)
      : 10;

  return {
    id: `cand_${crypto.randomBytes(4).toString('hex')}`,
    orderIndex: meta.orderIndex,
    subjectId: meta.defaultSubjectId,
    grade: meta.defaultGrade,
    semester: meta.defaultSemester,
    topic: (raw.topic && raw.topic.trim()) || meta.defaultTopic || 'Umum',
    competency: '',
    indicator: (raw.indicator && raw.indicator.trim().slice(0, 300)) || '',
    type,
    difficulty,
    prompt: prompt || '[Soal tidak terbaca — klik Edit untuk menulis ulang]',
    ...(options && options.length > 0 ? { options } : {}),
    ...(Array.isArray(raw.matchLeft) && raw.matchLeft.length > 0
      ? { matchLeft: raw.matchLeft.map(String).slice(0, 10) }
      : {}),
    ...(Array.isArray(raw.matchRight) && raw.matchRight.length > 0
      ? { matchRight: raw.matchRight.map(String).slice(0, 10) }
      : {}),
    ...(Array.isArray(raw.orderingItems) && raw.orderingItems.length > 0
      ? { orderingItems: raw.orderingItems.map(String).slice(0, 12) }
      : {}),
    correctAnswer: officialKey.slice(0, 2000),
    hasExplicitKey,
    ...(aiSuggestedAnswer ? { aiSuggestedAnswer } : {}),
    aiSuggestionApproved: false,
    ...(typeof raw.aiSuggestionConfidence === 'number'
      ? { aiSuggestionConfidence: Math.max(0, Math.min(1, raw.aiSuggestionConfidence)) }
      : {}),
    ...(raw.aiSuggestionNote ? { aiSuggestionNote: String(raw.aiSuggestionNote).slice(0, 300) } : {}),
    ...(raw.explanation ? { explanation: String(raw.explanation).trim().slice(0, 1000) } : {}),
    ...(raw.rubric ? { rubric: String(raw.rubric).trim().slice(0, 2000) } : {}),
    weight,
    ...(validAssetId ? { tempAssetId: validAssetId } : {}),
    sourceFileName: meta.fileName,
    sourceFileType: meta.fileType,
    ...(typeof raw.sourcePage === 'number' && raw.sourcePage >= 1
      ? { sourcePage: Math.round(raw.sourcePage) }
      : {}),
    ...(raw.sourceQuestionNumber
      ? { sourceQuestionNumber: String(raw.sourceQuestionNumber).trim().slice(0, 32) }
      : {}),
    extractionStatus: extractionStatus === 'success' && needsReview ? 'needs_review' : extractionStatus,
    extractionConfidence: confidence,
    needsReview,
    uncertainSegments,
    validationWarnings: Array.from(new Set(warnings)),
    selectedForSave: extractionStatus !== 'failed',
  };
}

function normalizePromptForSimilarity(prompt: string): string {
  return String(prompt || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSetSimilarity(a: string, b: string): number {
  const na = normalizePromptForSimilarity(a);
  const nb = normalizePromptForSimilarity(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' ').filter((w) => w.length > 1));
  const wordsB = new Set(nb.split(' ').filter((w) => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function annotateDuplicatesAgainstBank(
  schoolId: string,
  candidates: ExtractedCandidateRecord[]
): ExtractedCandidateRecord[] {
  const bankItems = Object.values(getAssessmentStateSnapshot().questionBank).filter(
    (q) => q.schoolId === schoolId && q.isActive !== false
  );

  return candidates.map((cand) => {
    if (!cand.prompt || cand.extractionStatus === 'failed') {
      return cand;
    }
    let bestId: string | undefined;
    let bestPrompt: string | undefined;
    let bestScore = 0;

    for (const existing of bankItems) {
      if (existing.subjectId !== cand.subjectId) continue;
      const sim = wordSetSimilarity(cand.prompt, existing.prompt);
      if (sim > bestScore) {
        bestScore = sim;
        bestId = existing.id;
        bestPrompt = existing.prompt;
      }
    }

    if (bestId && bestScore >= 0.78) {
      const nextWarnings = Array.from(
        new Set([
          ...cand.validationWarnings,
          `Kemungkinan duplikat (${Math.round(bestScore * 100)}%) dengan soal di Bank Soal.`,
        ])
      );
      return {
        ...cand,
        duplicateOfId: bestId,
        duplicatePromptPreview: bestPrompt?.slice(0, 120),
        duplicateSimilarity: Number(bestScore.toFixed(2)),
        needsReview: true,
        validationWarnings: nextWarnings,
      };
    }

    return cand;
  });
}

export async function createImportBatchEngine(
  staff: ImportStaffActor,
  params: {
    sourceMode?: ImportSourceMode;
    defaultSubjectId?: string;
    defaultGrade?: string;
    defaultSemester?: 'Ganjil' | 'Genap';
    defaultTopic?: string;
  }
): Promise<ImportBatchStateRecord> {
  const nowIso = new Date().toISOString();
  const batchId = sanitizeImportId(`imp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`);
  const subjectId =
    params.defaultSubjectId && ALLOWED_SUBJECT_IDS.has(params.defaultSubjectId)
      ? params.defaultSubjectId
      : 'matematika';
  const sourceMode: ImportSourceMode =
    params.sourceMode === 'photo' || params.sourceMode === 'camera' ? params.sourceMode : 'document';

  const record: ImportBatchStateRecord = {
    id: batchId,
    schoolId: staff.schoolId,
    ownerId: staff.uid,
    ownerName: staff.displayName || staff.email,
    sourceMode,
    defaultSubjectId: subjectId,
    defaultGrade: (params.defaultGrade || '3').trim().slice(0, 16) || '3',
    defaultSemester: params.defaultSemester === 'Genap' ? 'Genap' : 'Ganjil',
    defaultTopic: (params.defaultTopic || 'Umum').trim().slice(0, 200) || 'Umum',
    status: 'uploaded',
    progressPercent: 0,
    progressStage: 'siap_unggah',
    progressMessage: 'Batch impor dibuat. Siap menerima berkas.',
    files: [],
    tempAssets: [],
    candidates: [],
    stats: {
      totalFiles: 0,
      totalExtracted: 0,
      readyCount: 0,
      needsReviewCount: 0,
      failedCount: 0,
      missingKeyCount: 0,
      duplicateCount: 0,
      savedCount: 0,
    },
    savedQuestionIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await mutateImportState((state) => {
    state.batches[makeBatchKey(staff.schoolId, batchId)] = record;
  });

  return record;
}

export async function uploadFilesToImportBatchEngine(
  staff: ImportStaffActor,
  batchId: string,
  files: IncomingUploadFile[],
  sourceMode?: ImportSourceMode
): Promise<{ ok: true; batch: ImportBatchStateRecord } | { ok: false; status: number; code: string; message: string }> {
  const key = makeBatchKey(staff.schoolId, batchId);
  const snapshot = getImportStateSnapshot().batches[key];
  if (!snapshot) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }
  if (snapshot.status === 'completed' || snapshot.status === 'cancelled') {
    return {
      ok: false,
      status: 409,
      code: 'BATCH_LOCKED',
      message: 'Batch impor sudah selesai atau dibatalkan.',
    };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, status: 400, code: 'NO_FILES', message: 'Pilih minimal satu berkas untuk diunggah.' };
  }
  if (snapshot.files.length + files.length > MAX_IMPORT_FILES_PER_BATCH) {
    return {
      ok: false,
      status: 400,
      code: 'TOO_MANY_FILES',
      message: `Maksimal ${MAX_IMPORT_FILES_PER_BATCH} berkas dalam satu sesi impor.`,
    };
  }

  const totalIncomingBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const existingBytes = snapshot.files.reduce((acc, f) => acc + f.sizeBytes, 0);
  if (existingBytes + totalIncomingBytes > MAX_IMPORT_BATCH_TOTAL_BYTES) {
    return {
      ok: false,
      status: 400,
      code: 'BATCH_SIZE_EXCEEDED',
      message: 'Total ukuran berkas dalam satu sesi maksimal 35 MB.',
    };
  }

  const newMeta: ImportFileMetaRecord[] = [];
  const newAssets: ImportTempAssetRecord[] = [];

  for (const file of files) {
    const validated = await validateUploadedFile(file);
    if (validated.ok === false) {
      return validated;
    }

    const fileId = sanitizeImportId(`f_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`);
    const storedFileName = `${fileId}${validated.extension}`;
    const destPath = resolveSafeBatchSubFile(batchId, 'uploads', storedFileName);
    fs.writeFileSync(destPath, file.buffer);

    const nowIso = new Date().toISOString();
    newMeta.push({
      id: fileId,
      originalName: file.originalName,
      sanitizedName: validated.sanitizedName,
      mimeType: validated.normalizedMime,
      extension: validated.extension,
      sizeBytes: file.sizeBytes,
      sourceMode: sourceMode || snapshot.sourceMode,
      detectedKind: validated.detectedKind,
      storedFileName,
      uploadedAt: nowIso,
    });

    if (validated.detectedKind === 'image') {
      const assetId = sanitizeImportId(`photo_${fileId}`);
      const assetStored = `${assetId}${validated.extension}`;
      const assetPath = resolveSafeBatchSubFile(batchId, 'assets', assetStored);
      fs.writeFileSync(assetPath, file.buffer);
      newAssets.push({
        id: assetId,
        fileName: validated.sanitizedName,
        storedFileName: assetStored,
        mimeType: validated.normalizedMime,
        sizeBytes: file.sizeBytes,
        sourceFileName: validated.sanitizedName,
      });
    }
  }

  const updated = await mutateImportState((state) => {
    const b = state.batches[key];
    if (!b) return null;
    b.files.push(...newMeta);
    b.tempAssets.push(...newAssets);
    if (sourceMode) b.sourceMode = sourceMode;
    b.status = 'uploaded';
    b.progressPercent = 20;
    b.progressStage = 'validasi_berkas';
    b.progressMessage = `${b.files.length} berkas berhasil divalidasi dan siap diekstrak.`;
    b.errorMessage = undefined;
    b.errorCode = undefined;
    b.stats = computeBatchStats(b);
    b.updatedAt = new Date().toISOString();
    return b;
  });

  if (!updated) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }

  return { ok: true, batch: updated };
}

export async function extractImportBatchEngine(
  staff: ImportStaffActor,
  batchId: string
): Promise<{ ok: true; batch: ImportBatchStateRecord } | { ok: false; status: number; code: string; message: string }> {
  const key = makeBatchKey(staff.schoolId, batchId);
  const initialBatch = getImportStateSnapshot().batches[key];
  if (!initialBatch) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }
  if (initialBatch.files.length === 0) {
    return { ok: false, status: 400, code: 'NO_FILES', message: 'Belum ada berkas yang diunggah pada sesi ini.' };
  }
  if (initialBatch.status === 'completed') {
    return {
      ok: false,
      status: 409,
      code: 'BATCH_ALREADY_COMPLETED',
      message: 'Sesi impor ini sudah selesai disimpan ke Bank Soal.',
    };
  }

  await mutateImportState((state) => {
    const b = state.batches[key];
    if (b) {
      b.status = 'processing';
      b.progressPercent = 40;
      b.progressStage = 'ekstraksi_konten';
      b.progressMessage = 'Mengekstrak teks, tabel, dan media dari berkas...';
      b.errorMessage = undefined;
      b.errorCode = undefined;
      b.updatedAt = new Date().toISOString();
    }
  });

  try {
    const allCandidates: ExtractedCandidateRecord[] = [];
    const discoveredAssets: ImportTempAssetRecord[] = [...initialBatch.tempAssets];
    const updatedFilesMeta: ImportFileMetaRecord[] = [];

    for (const fileMeta of initialBatch.files) {
      const uploadPath = resolveSafeBatchSubFile(batchId, 'uploads', fileMeta.storedFileName);
      if (!fs.existsSync(uploadPath)) {
        throw new Error(`Berkas sementara "${fileMeta.sanitizedName}" sudah kedaluwarsa. Unggah ulang berkas.`);
      }
      const buffer = fs.readFileSync(uploadPath);
      const defaults = {
        subjectId: initialBatch.defaultSubjectId,
        grade: initialBatch.defaultGrade,
        semester: initialBatch.defaultSemester,
        topic: initialBatch.defaultTopic,
      };

      if (fileMeta.detectedKind === 'xlsx' || fileMeta.detectedKind === 'csv') {
        const parsedTable = parseExcelOrCsvDeterministic(
          buffer,
          fileMeta.sanitizedName,
          fileMeta.detectedKind,
          defaults
        );
        if (parsedTable.structuredFound) {
          for (const cand of parsedTable.candidates) {
            cand.orderIndex = allCandidates.length + 1;
            allCandidates.push(cand);
          }
          updatedFilesMeta.push(fileMeta);
          continue;
        }

        // Unstructured spreadsheet/CSV fallback via Gemini
        await mutateImportState((state) => {
          const b = state.batches[key];
          if (b) {
            b.progressPercent = 65;
            b.progressStage = 'analisis_ai';
            b.progressMessage = `Menganalisis tabel tidak standar "${fileMeta.sanitizedName}" dengan Gemini AI...`;
          }
        });

        const parts: Part[] = [
          {
            text: `Sumber berkas spreadsheet (${fileMeta.sanitizedName}) tidak memakai header standar.\nMapel default: ${defaults.subjectId}, Kelas: ${defaults.grade}, Semester: ${defaults.semester}, Topik: ${defaults.topic}.\nEkstrak semua butir soal yang nyata ada pada data berikut:\n\n${parsedTable.rawFallbackText.slice(0, 60000)}`,
          },
        ];
        const aiRows = await callGeminiWithRetry(parts, fileMeta.sanitizedName);
        for (const r of aiRows) {
          allCandidates.push(
            normalizeGeminiQuestion(r, {
              fileName: fileMeta.sanitizedName,
              fileType: fileMeta.detectedKind,
              defaultSubjectId: defaults.subjectId,
              defaultGrade: defaults.grade,
              defaultSemester: defaults.semester,
              defaultTopic: defaults.topic,
              validTempAssetIds: new Set(),
              orderIndex: allCandidates.length + 1,
            })
          );
        }
        updatedFilesMeta.push(fileMeta);
        continue;
      }

      if (fileMeta.detectedKind === 'docx') {
        const docxContent = await extractDocxStructuredContent(batchId, fileMeta.sanitizedName, buffer);
        const validIds = new Set<string>();
        for (const a of docxContent.extractedAssets) {
          if (!discoveredAssets.some((ex) => ex.id === a.asset.id)) {
            discoveredAssets.push(a.asset);
          }
          validIds.add(a.asset.id);
        }

        await mutateImportState((state) => {
          const b = state.batches[key];
          if (b) {
            b.progressPercent = 70;
            b.progressStage = 'analisis_ai';
            b.progressMessage = `Menyusun struktur soal dari "${fileMeta.sanitizedName}" dengan Gemini AI...`;
          }
        });

        const parts: Part[] = [
          {
            text: `Ekstrak semua soal dari dokumen Word "${fileMeta.sanitizedName}".\nMapel default: ${defaults.subjectId}, Kelas: ${defaults.grade}, Semester: ${defaults.semester}, Topik default: ${defaults.topic}.\nCatatan: Penanda [LAMPIRAN_GAMBAR_ID:asset_...] menunjukkan posisi gambar asli pada dokumen.\n\nISI DOKUMEN:\n${docxContent.text.slice(0, 80000)}`,
          },
        ];

        for (const a of docxContent.extractedAssets.slice(0, 10)) {
          parts.push({
            text: `Lampiran gambar dari dokumen (ID: ${a.asset.id}, nama file asli: ${a.asset.fileName}):`,
          });
          parts.push({
            inlineData: {
              mimeType: a.mimeType,
              data: a.buffer.toString('base64'),
            },
          });
        }

        const aiRows = await callGeminiWithRetry(parts, fileMeta.sanitizedName);
        for (const r of aiRows) {
          allCandidates.push(
            normalizeGeminiQuestion(r, {
              fileName: fileMeta.sanitizedName,
              fileType: 'docx',
              defaultSubjectId: defaults.subjectId,
              defaultGrade: defaults.grade,
              defaultSemester: defaults.semester,
              defaultTopic: defaults.topic,
              validTempAssetIds: validIds,
              orderIndex: allCandidates.length + 1,
            })
          );
        }
        updatedFilesMeta.push(fileMeta);
        continue;
      }

      if (fileMeta.detectedKind === 'pdf') {
        const pdfInfo = await extractPdfContent(buffer);
        updatedFilesMeta.push({
          ...fileMeta,
          pageCount: pdfInfo.pageCount,
          scannedPdf: pdfInfo.scannedPdf,
        });

        await mutateImportState((state) => {
          const b = state.batches[key];
          if (b) {
            b.progressPercent = 70;
            b.progressStage = 'analisis_ai';
            b.progressMessage = pdfInfo.scannedPdf
              ? `Membaca PDF scan "${fileMeta.sanitizedName}" dengan OCR Multimodal Gemini...`
              : `Menganalisis PDF "${fileMeta.sanitizedName}" dengan Gemini AI...`;
          }
        });

        const parts: Part[] = [
          {
            text: `Ekstrak seluruh butir soal dari dokumen PDF "${fileMeta.sanitizedName}" (${pdfInfo.pageCount} halaman, mode=${pdfInfo.scannedPdf ? 'PDF scan/gambar' : 'PDF teks'}).\nMapel default: ${defaults.subjectId}, Kelas: ${defaults.grade}, Semester: ${defaults.semester}, Topik default: ${defaults.topic}.\nSertakan nomor halaman (sourcePage) untuk tiap soal.`,
          },
        ];

        if (pdfInfo.scannedPdf || buffer.length <= 7 * 1024 * 1024) {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          });
        }
        if (pdfInfo.text && pdfInfo.text.trim().length > 20) {
          parts.push({
            text: `Ekstraksi teks pendukung per halaman:\n${pdfInfo.text.slice(0, 80000)}`,
          });
        }

        const aiRows = await callGeminiWithRetry(parts, fileMeta.sanitizedName);
        for (const r of aiRows) {
          allCandidates.push(
            normalizeGeminiQuestion(r, {
              fileName: fileMeta.sanitizedName,
              fileType: pdfInfo.scannedPdf ? 'pdf_scan' : 'pdf',
              defaultSubjectId: defaults.subjectId,
              defaultGrade: defaults.grade,
              defaultSemester: defaults.semester,
              defaultTopic: defaults.topic,
              validTempAssetIds: new Set(),
              orderIndex: allCandidates.length + 1,
            })
          );
        }
        continue;
      }

      // Image / camera photo OCR
      await mutateImportState((state) => {
        const b = state.batches[key];
        if (b) {
          b.progressPercent = 75;
          b.progressStage = 'analisis_ai';
          b.progressMessage = `Menjalankan OCR & penyusunan soal dari foto "${fileMeta.sanitizedName}"...`;
        }
      });

      const imageParts: Part[] = [
        {
          text: `Lakukan OCR yang sangat teliti terhadap foto lembar soal "${fileMeta.sanitizedName}".\nMapel default: ${defaults.subjectId}, Kelas: ${defaults.grade}, Semester: ${defaults.semester}, Topik default: ${defaults.topic}.\nJIKA ada tulisan miring, buram, atau terpotong yang tidak 100% pasti, set extractionStatus="needs_review", needsReview=true, dan tuliskan potongan teks yang diragukan pada uncertainSegments. Jangan mengarang jawaban resmi jika tidak tertera di foto.`,
        },
        {
          inlineData: {
            mimeType: fileMeta.mimeType,
            data: buffer.toString('base64'),
          },
        },
      ];

      const aiRows = await callGeminiWithRetry(imageParts, fileMeta.sanitizedName);
      for (const r of aiRows) {
        allCandidates.push(
          normalizeGeminiQuestion(r, {
            fileName: fileMeta.sanitizedName,
            fileType: fileMeta.sourceMode === 'camera' ? 'camera_photo' : 'image',
            defaultSubjectId: defaults.subjectId,
            defaultGrade: defaults.grade,
            defaultSemester: defaults.semester,
            defaultTopic: defaults.topic,
            validTempAssetIds: new Set(),
            orderIndex: allCandidates.length + 1,
          })
        );
      }
      updatedFilesMeta.push(fileMeta);
    }

    const annotated = annotateDuplicatesAgainstBank(staff.schoolId, allCandidates);

    const finalized = await mutateImportState((state) => {
      const b = state.batches[key];
      if (!b) return null;
      if (updatedFilesMeta.length > 0) b.files = updatedFilesMeta;
      b.tempAssets = discoveredAssets;
      b.candidates = annotated;
      b.status = 'review_required';
      b.progressPercent = 100;
      b.progressStage = 'siap_review';
      b.progressMessage =
        annotated.length > 0
          ? `${annotated.length} kandidat soal berhasil diekstrak dan siap ditinjau guru.`
          : 'Tidak ada soal yang terdeteksi dari berkas yang diunggah.';
      b.stats = computeBatchStats(b);
      b.updatedAt = new Date().toISOString();
      return b;
    });

    if (!finalized) {
      return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
    }
    return { ok: true, batch: finalized };
  } catch (err) {
    const e = err as Error & { status?: number; code?: string };
    const status = typeof e.status === 'number' ? e.status : 500;
    const code = e.code || 'EXTRACTION_FAILED';
    const message = e.message || 'Gagal mengekstrak soal dari berkas.';

    await mutateImportState((state) => {
      const b = state.batches[key];
      if (b) {
        b.status = 'failed';
        b.progressStage = 'gagal';
        b.progressMessage = message;
        b.errorMessage = message;
        b.errorCode = code;
        b.updatedAt = new Date().toISOString();
      }
    });

    return { ok: false, status, code, message };
  }
}

export async function updateImportCandidatesEngine(
  staff: ImportStaffActor,
  batchId: string,
  candidates: ExtractedCandidateRecord[]
): Promise<{ ok: true; batch: ImportBatchStateRecord } | { ok: false; status: number; code: string; message: string }> {
  const key = makeBatchKey(staff.schoolId, batchId);
  const existing = getImportStateSnapshot().batches[key];
  if (!existing) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }
  if (existing.status === 'completed') {
    return {
      ok: false,
      status: 409,
      code: 'BATCH_ALREADY_COMPLETED',
      message: 'Batch yang sudah disimpan tidak dapat diubah lagi.',
    };
  }
  if (!Array.isArray(candidates)) {
    return { ok: false, status: 400, code: 'INVALID_CANDIDATES', message: 'Daftar kandidat soal tidak valid.' };
  }

  const validAssetIds = new Set(existing.tempAssets.map((a) => a.id));
  const sanitized: ExtractedCandidateRecord[] = candidates.map((c, idx) => {
    const type = ALLOWED_QUESTION_TYPES.has(String(c.type)) ? String(c.type) : 'multiple_choice';
    const subjectId = ALLOWED_SUBJECT_IDS.has(String(c.subjectId))
      ? String(c.subjectId)
      : existing.defaultSubjectId;
    const officialKey = typeof c.correctAnswer === 'string' ? c.correctAnswer.trim().slice(0, 2000) : '';
    const prompt = typeof c.prompt === 'string' ? c.prompt.trim().slice(0, 2000) : '';
    const warnings = Array.isArray(c.validationWarnings) ? c.validationWarnings.map(String) : [];

    // Recompute missing key warning dynamically so banner clears once teacher fills official key
    const filteredWarnings = warnings.filter(
      (w) => !w.toLowerCase().includes('kunci jawaban')
    );
    if (!officialKey) {
      filteredWarnings.push('Belum ada kunci jawaban resmi.');
    }

    const tempAssetId =
      c.removeImage === true
        ? undefined
        : typeof c.tempAssetId === 'string' && validAssetIds.has(c.tempAssetId)
          ? c.tempAssetId
          : undefined;

    return {
      ...c,
      id: sanitizeImportId(c.id || `cand_${idx + 1}`),
      orderIndex: idx + 1,
      subjectId,
      grade: (c.grade || existing.defaultGrade).slice(0, 16),
      semester: c.semester === 'Genap' ? 'Genap' : 'Ganjil',
      topic: (c.topic || existing.defaultTopic || 'Umum').slice(0, 200),
      competency: (c.competency || '').slice(0, 300),
      indicator: (c.indicator || '').slice(0, 300),
      type,
      difficulty: c.difficulty === 'mudah' || c.difficulty === 'sulit' ? c.difficulty : 'sedang',
      prompt,
      correctAnswer: officialKey,
      hasExplicitKey: Boolean(officialKey) || Boolean(c.hasExplicitKey),
      aiSuggestionApproved: Boolean(c.aiSuggestionApproved && officialKey),
      weight:
        typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight >= 0 && c.weight <= 100
          ? Math.round(c.weight)
          : 10,
      imageUrl:
        c.removeImage === true
          ? undefined
          : typeof c.imageUrl === 'string' && c.imageUrl.trim()
            ? c.imageUrl.trim().slice(0, 1000)
            : undefined,
      tempAssetId,
      needsReview: Boolean(c.needsReview) || !officialKey || !prompt,
      extractionStatus: !prompt
        ? 'failed'
        : Boolean(c.needsReview) || !officialKey
          ? 'needs_review'
          : 'success',
      validationWarnings: filteredWarnings,
      selectedForSave: Boolean(c.selectedForSave),
    };
  });

  const reannotated = annotateDuplicatesAgainstBank(staff.schoolId, sanitized);

  const updated = await mutateImportState((state) => {
    const b = state.batches[key];
    if (!b) return null;
    b.candidates = reannotated;
    b.status = 'review_required';
    b.stats = computeBatchStats(b);
    b.updatedAt = new Date().toISOString();
    return b;
  });

  return { ok: true, batch: updated! };
}

async function tryUploadTempAssetToFirebaseStorage(
  batchId: string,
  asset: ImportTempAssetRecord,
  schoolId: string,
  idToken?: string
): Promise<{ url?: string; warning?: string }> {
  if (!isFirebaseServerConfigured || !FIREBASE_STORAGE_BUCKET || !idToken) {
    return {
      warning: `Gambar "${asset.fileName}" tidak diunggah otomatis karena Firebase Storage belum aktif atau token server belum tersedia.`,
    };
  }
  try {
    const assetPath = resolveSafeBatchSubFile(batchId, 'assets', asset.storedFileName);
    if (!fs.existsSync(assetPath)) {
      return { warning: `Berkas gambar sementara "${asset.fileName}" sudah kedaluwarsa.` };
    }
    const buf = fs.readFileSync(assetPath);
    if (buf.length > 2 * 1024 * 1024) {
      return {
        warning: `Gambar "${asset.fileName}" melebihi batas 2 MB untuk Bank Soal. Anda dapat mengunggah versi lebih kecil di editor.`,
      };
    }

    const bucket = FIREBASE_STORAGE_BUCKET.replace(/^gs:\/\//, '');
    const safeName = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'soal.png';
    const objectPath = `schools/${schoolId}/public/questions/${Date.now()}_${safeName}`;
    const url = `https://firebasestorage.googleapis.com/v1/b/${encodeURIComponent(
      bucket
    )}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': asset.mimeType,
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      return {
        warning: `Firebase Storage menolak/belum mengaktifkan upload otomatis untuk "${asset.fileName}" (HTTP ${res.status}). Soal tetap disimpan tanpa gambar.`,
      };
    }
    const meta = (await res.json()) as { downloadTokens?: string; name?: string };
    const tokenParam = meta.downloadTokens ? `&token=${encodeURIComponent(meta.downloadTokens)}` : '';
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
      bucket
    )}/o/${encodeURIComponent(meta.name || objectPath)}?alt=media${tokenParam}`;
    return { url: publicUrl };
  } catch {
    return {
      warning: `Gagal mengunggah "${asset.fileName}" ke Firebase Storage. Soal tetap disimpan.`,
    };
  }
}

export async function saveImportBatchToBankEngine(
  staff: ImportStaffActor,
  batchId: string,
  options: { selectedIds?: string[]; skipDuplicates?: boolean } = {}
): Promise<
  | {
      ok: true;
      alreadySaved: boolean;
      batch: ImportBatchStateRecord;
      savedQuestionIds: string[];
      storageWarnings: string[];
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const key = makeBatchKey(staff.schoolId, batchId);

  // Atomic check-and-lock inside mutateImportState for single-flight idempotency
  const lockCheck = await mutateImportState((state) => {
    const b = state.batches[key];
    if (!b) return { found: false as const };
    if (b.status === 'completed') {
      return { found: true as const, alreadySaved: true as const, batch: b };
    }
    if (b.status === 'cancelled') {
      return { found: true as const, cancelled: true as const, batch: b };
    }
    return { found: true as const, alreadySaved: false as const, batch: b };
  });

  if (!lockCheck.found) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }
  if ('cancelled' in lockCheck && lockCheck.cancelled) {
    return { ok: false, status: 409, code: 'BATCH_CANCELLED', message: 'Sesi impor ini telah dibatalkan.' };
  }
  if (lockCheck.alreadySaved) {
    return {
      ok: true,
      alreadySaved: true,
      batch: lockCheck.batch,
      savedQuestionIds: lockCheck.batch.savedQuestionIds,
      storageWarnings: [],
    };
  }

  const batch = lockCheck.batch;
  const selectedIdSet = Array.isArray(options.selectedIds) && options.selectedIds.length > 0
    ? new Set(options.selectedIds)
    : null;

  const toSave = batch.candidates.filter((c) => {
    if (selectedIdSet ? !selectedIdSet.has(c.id) : !c.selectedForSave) return false;
    if (options.skipDuplicates && c.duplicateOfId) return false;
    return Boolean(c.prompt && c.prompt.trim().length > 0);
  });

  if (toSave.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'NO_VALID_QUESTIONS_SELECTED',
      message: 'Tidak ada butir soal valid yang dipilih untuk disimpan ke Bank Soal.',
    };
  }

  const nowIso = new Date().toISOString();
  const savedQuestionIds: string[] = [];
  const savedBankRecords: Array<{
    id: string;
    record: Record<string, unknown>;
  }> = [];
  const storageWarnings: string[] = [];
  const assetById = new Map(batch.tempAssets.map((a) => [a.id, a]));

  for (let i = 0; i < toSave.length; i++) {
    const cand = toSave[i];
    let resolvedImageUrl = cand.removeImage ? undefined : cand.imageUrl;

    if (!resolvedImageUrl && !cand.removeImage && cand.tempAssetId) {
      const asset = assetById.get(cand.tempAssetId);
      if (asset) {
        const uploadRes = await tryUploadTempAssetToFirebaseStorage(
          batchId,
          asset,
          staff.schoolId,
          staff.idToken
        );
        if (uploadRes.url) resolvedImageUrl = uploadRes.url;
        if (uploadRes.warning) storageWarnings.push(uploadRes.warning);
      }
    }

    const payloadObj: Record<string, unknown> = {};
    if (cand.options && cand.options.length > 0) payloadObj.options = cand.options;
    if (resolvedImageUrl) payloadObj.mediaUrl = resolvedImageUrl;
    if (cand.matchLeft && cand.matchLeft.length > 0) payloadObj.matchLeft = cand.matchLeft;
    if (cand.matchRight && cand.matchRight.length > 0) payloadObj.matchRight = cand.matchRight;
    if (cand.orderingItems && cand.orderingItems.length > 0) payloadObj.orderingItems = cand.orderingItems;
    if (cand.dragItems && cand.dragItems.length > 0) payloadObj.dragItems = cand.dragItems;
    if (cand.dragTargets && cand.dragTargets.length > 0) payloadObj.dragTargets = cand.dragTargets;
    if (cand.imageOptions && cand.imageOptions.length > 0) payloadObj.imageOptions = cand.imageOptions;

    // Official key rule: NEVER silently copy aiSuggestedAnswer unless approved or explicitly provided!
    const officialCorrectAnswer = cand.correctAnswer ? cand.correctAnswer.trim() : '';
    const deterministicQuestionId = sanitizeImportId(
      `bank_imp_${batch.id.slice(-8)}_${cand.id.slice(-6)}_${i + 1}`
    );

    const saved = await upsertQuestionBankItemEngine(staff, {
      id: deterministicQuestionId,
      subjectId: cand.subjectId,
      worldId: cand.subjectId,
      grade: cand.grade || batch.defaultGrade,
      semester: cand.semester || batch.defaultSemester,
      topic: cand.topic || batch.defaultTopic || 'Umum',
      competency:
        cand.competency ||
        `Kurikulum Merdeka Kelas ${cand.grade || batch.defaultGrade} (${cand.subjectId})`,
      indicator: cand.indicator || '-',
      type: cand.type,
      difficulty: cand.difficulty || 'sedang',
      prompt: cand.prompt,
      payload: payloadObj,
      correctAnswer: officialCorrectAnswer,
      acceptedVariations: cand.acceptedVariations,
      numericTolerance: cand.numericTolerance,
      rubric: cand.rubric,
      explanation: cand.explanation,
      imageUrl: resolvedImageUrl,
      tags: ['impor-ai', cand.sourceFileType].filter(Boolean),
      weight: cand.weight || 10,
      isActive: true,
      verificationStatus:
        officialCorrectAnswer && !cand.needsReview ? 'VERIFIED' : 'BELUM_DIVERIFIKASI',
      importBatchId: batch.id,
      sourceFileName: cand.sourceFileName,
      sourceFileType: cand.sourceFileType,
      sourcePage: cand.sourcePage,
      sourceQuestionNumber: cand.sourceQuestionNumber,
      extractionStatus: cand.extractionStatus,
      extractionConfidence: cand.extractionConfidence,
      needsReview: Boolean(cand.needsReview || !officialCorrectAnswer),
      importedBy: staff.uid,
      importedAt: nowIso,
    });

    if (saved.ok) {
      savedQuestionIds.push(saved.item.id);
      savedBankRecords.push({
        id: saved.item.id,
        record: {
          id: saved.item.id,
          schoolId: saved.item.schoolId,
          subjectId: saved.item.subjectId,
          grade: saved.item.grade,
          semester: saved.item.semester,
          topic: saved.item.topic,
          competency: saved.item.competency,
          indicator: saved.item.indicator,
          type: saved.item.type,
          difficulty: saved.item.difficulty,
          prompt: saved.item.prompt,
          payload: saved.item.payload,
          correctAnswer: saved.item.correctAnswer,
          ...(saved.item.acceptedVariations?.length
            ? { acceptedVariations: saved.item.acceptedVariations }
            : {}),
          ...(typeof saved.item.numericTolerance === 'number'
            ? { numericTolerance: saved.item.numericTolerance }
            : {}),
          ...(saved.item.rubric ? { rubric: saved.item.rubric } : {}),
          ...(saved.item.explanation ? { explanation: saved.item.explanation } : {}),
          ...(saved.item.imageUrl ? { imageUrl: saved.item.imageUrl } : {}),
          ...(saved.item.tags?.length ? { tags: saved.item.tags } : {}),
          isActive: true,
          weight: saved.item.weight,
          verificationStatus: saved.item.verificationStatus,
          importBatchId: batch.id,
          sourceFileName: cand.sourceFileName,
          sourceFileType: cand.sourceFileType,
          ...(typeof cand.sourcePage === 'number' ? { sourcePage: cand.sourcePage } : {}),
          ...(cand.sourceQuestionNumber
            ? { sourceQuestionNumber: cand.sourceQuestionNumber }
            : {}),
          ...(cand.extractionStatus ? { extractionStatus: cand.extractionStatus } : {}),
          ...(typeof cand.extractionConfidence === 'number'
            ? { extractionConfidence: cand.extractionConfidence }
            : {}),
          needsReview: Boolean(cand.needsReview || !officialCorrectAnswer),
          importedBy: staff.uid,
          importedAt: nowIso,
          ownerId: staff.uid,
        },
      });
    }
  }

  // Mirror to Firestore REST questionBanks & importBatches when authenticated
  if (staff.idToken && isFirebaseServerConfigured && savedBankRecords.length > 0) {
    try {
      const writes: Array<{
        docPath: string;
        mode: 'set' | 'create' | 'update';
        data: Record<string, unknown>;
        updateMaskFields?: string[];
        serverTimestampFields?: string[];
      }> = [];

      for (const entry of savedBankRecords.slice(0, 50)) {
        const existingFs = await fsGetDoc(`questionBanks/${entry.id}`, staff.idToken).catch(() => ({
          exists: false,
        }));
        writes.push(
          existingFs.exists
            ? {
                docPath: `questionBanks/${entry.id}`,
                mode: 'update',
                data: entry.record,
                updateMaskFields: Object.keys(entry.record),
                serverTimestampFields: ['updatedAt'],
              }
            : {
                docPath: `questionBanks/${entry.id}`,
                mode: 'create',
                data: entry.record,
                serverTimestampFields: ['createdAt', 'updatedAt'],
              }
        );
      }

      const existingBatchFs = await fsGetDoc(`importBatches/${batch.id}`, staff.idToken).catch(
        () => ({ exists: false })
      );
      const batchSummaryDoc = {
        id: batch.id,
        schoolId: staff.schoolId,
        ownerId: staff.uid,
        ownerName: batch.ownerName,
        sourceMode: batch.sourceMode,
        defaultSubjectId: batch.defaultSubjectId,
        defaultGrade: batch.defaultGrade,
        defaultSemester: batch.defaultSemester,
        status: 'completed',
        fileNames: batch.files.map((f) => f.sanitizedName).slice(0, 10),
        totalExtracted: batch.candidates.length,
        savedCount: savedQuestionIds.length,
        savedQuestionIds: savedQuestionIds.slice(0, 500),
      };
      writes.push(
        existingBatchFs.exists
          ? {
              docPath: `importBatches/${batch.id}`,
              mode: 'update',
              data: batchSummaryDoc,
              updateMaskFields: Object.keys(batchSummaryDoc),
              serverTimestampFields: ['updatedAt'],
            }
          : {
              docPath: `importBatches/${batch.id}`,
              mode: 'create',
              data: batchSummaryDoc,
              serverTimestampFields: ['createdAt', 'updatedAt'],
            }
      );

      await fsCommitWrites(writes, staff.idToken);
    } catch {
      // Non-fatal Firestore mirror error
    }
  }

  const completedBatch = await mutateImportState((state) => {
    const b = state.batches[key];
    if (!b) return null;
    b.status = 'completed';
    b.progressPercent = 100;
    b.progressStage = 'selesai';
    b.progressMessage = `${savedQuestionIds.length} butir soal berhasil disimpan ke Bank Soal.`;
    b.savedQuestionIds = savedQuestionIds;
    b.completedAt = nowIso;
    b.updatedAt = nowIso;
    b.stats = computeBatchStats(b);
    return b;
  });

  // Clean up raw upload files & temp assets once saved
  cleanupBatchRawUploads(batchId);
  cleanupBatchTempFiles(batchId);

  return {
    ok: true,
    alreadySaved: false,
    batch: completedBatch!,
    savedQuestionIds,
    storageWarnings: Array.from(new Set(storageWarnings)),
  };
}

export async function cancelImportBatchEngine(
  staff: ImportStaffActor,
  batchId: string
): Promise<{ ok: true; batch: ImportBatchStateRecord } | { ok: false; status: number; code: string; message: string }> {
  const key = makeBatchKey(staff.schoolId, batchId);
  const updated = await mutateImportState((state) => {
    const b = state.batches[key];
    if (!b) return null;
    b.status = 'cancelled';
    b.progressStage = 'dibatalkan';
    b.progressMessage = 'Sesi impor dibatalkan oleh guru.';
    b.updatedAt = new Date().toISOString();
    return b;
  });

  if (!updated) {
    return { ok: false, status: 404, code: 'BATCH_NOT_FOUND', message: 'Sesi impor tidak ditemukan.' };
  }

  cleanupBatchTempFiles(batchId);
  return { ok: true, batch: updated };
}

export function getImportBatchEngine(schoolId: string, batchId: string): ImportBatchStateRecord | null {
  const state = getImportStateSnapshot();
  return state.batches[makeBatchKey(schoolId, batchId)] || null;
}

export function listImportBatchesEngine(schoolId: string) {
  const state = getImportStateSnapshot();
  return Object.values(state.batches)
    .filter((b) => b.schoolId === schoolId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((b) => ({
      id: b.id,
      sourceMode: b.sourceMode,
      defaultSubjectId: b.defaultSubjectId,
      defaultGrade: b.defaultGrade,
      defaultSemester: b.defaultSemester,
      defaultTopic: b.defaultTopic,
      status: b.status,
      fileNames: b.files.map((f) => f.sanitizedName),
      stats: computeBatchStats(b),
      savedQuestionIds: b.savedQuestionIds,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      completedAt: b.completedAt,
    }));
}

export function getTempAssetBufferEngine(
  schoolId: string,
  batchId: string,
  assetId: string
): { buffer: Buffer; mimeType: string; fileName: string } | null {
  const batch = getImportBatchEngine(schoolId, batchId);
  if (!batch) return null;
  const asset = batch.tempAssets.find((a) => a.id === sanitizeImportId(assetId));
  if (!asset) return null;
  const filePath = resolveSafeBatchSubFile(batchId, 'assets', asset.storedFileName);
  if (!fs.existsSync(filePath)) return null;
  return {
    buffer: fs.readFileSync(filePath),
    mimeType: asset.mimeType,
    fileName: asset.fileName,
  };
}
