import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, History, Sparkles, UploadCloud } from 'lucide-react';
import {
  cancelImportBatch,
  createImportBatch,
  extractImportBatch,
  fetchImportBatchDetail,
  fetchImportBatches,
  fetchImportStatus,
  saveImportBatchToBank,
  updateImportBatchQuestions,
  uploadImportFiles,
} from '../../../services/apiClient';
import type {
  ExtractedQuestionCandidate,
  ImportBatchRecord,
  ImportHistorySummary,
  ImportSourceMode,
  SubjectId,
} from '../../../types/psas';
import { ExtractionResult } from './ExtractionResult';
import { FileUploadArea } from './FileUploadArea';
import { ImportHistory } from './ImportHistory';
import { ImportProgress } from './ImportProgress';
import { ImportSummary } from './ImportSummary';
import { QuestionReviewEditor } from './QuestionReviewEditor';

interface ImportQuestionPageProps {
  defaultSubjectId?: SubjectId;
  onBackToBank: () => void;
  onImportSaved: (savedCount: number) => void;
}

type ActiveTab = 'new' | 'history';
type WizardStage = 'setup' | 'processing' | 'review' | 'summary';

export const ImportQuestionPage: React.FC<ImportQuestionPageProps> = ({
  defaultSubjectId = 'matematika',
  onBackToBank,
  onImportSaved,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('new');
  const [stage, setStage] = useState<WizardStage>('setup');

  // Server capability status
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(true);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10 * 1024 * 1024);
  const [maxFilesPerBatch, setMaxFilesPerBatch] = useState<number>(5);

  // Setup state
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>('document');
  const [subjectId, setSubjectId] = useState<SubjectId>(defaultSubjectId);
  const [grade, setGrade] = useState<string>('3');
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
  const [topic, setTopic] = useState<string>('Umum');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Active batch state
  const [batch, setBatch] = useState<ImportBatchRecord | null>(null);
  const [candidates, setCandidates] = useState<ExtractedQuestionCandidate[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<ExtractedQuestionCandidate | null>(null);

  // Operation state
  const [isBusy, setIsBusy] = useState(false);
  const [localStageMessage, setLocalStageMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedResult, setSavedResult] = useState<{
    alreadySaved: boolean;
    savedQuestionIds: string[];
    storageWarnings: string[];
  } | null>(null);

  // History
  const [historyItems, setHistoryItems] = useState<ImportHistorySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadStatusAndHistory = useCallback(async () => {
    try {
      const status = await fetchImportStatus();
      setGeminiConfigured(Boolean(status.geminiConfigured));
      if (status.maxFileSizeBytes) setMaxFileSizeBytes(status.maxFileSizeBytes);
      if (status.maxFilesPerBatch) setMaxFilesPerBatch(status.maxFilesPerBatch);
    } catch {
      // Abaikan jika status gagal sementara
    }
    setHistoryLoading(true);
    try {
      const hist = await fetchImportBatches();
      if (Array.isArray(hist.items)) {
        setHistoryItems(hist.items);
      }
    } catch {
      // Abaikan
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatusAndHistory();
  }, [loadStatusAndHistory]);

  const handleStartUploadAndExtract = async () => {
    if (selectedFiles.length === 0 || isBusy) return;
    setErrorMessage('');
    setSavedResult(null);
    setSaveError('');
    setIsBusy(true);
    setStage('processing');
    setLocalStageMessage('Membuat sesi impor dan memvalidasi berkas...');

    let activeBatchId = '';
    try {
      const created = await createImportBatch({
        sourceMode,
        defaultSubjectId: subjectId,
        defaultGrade: grade,
        defaultSemester: semester,
        defaultTopic: topic.trim() || 'Umum',
      });
      activeBatchId = created.batch.id;
      setBatch(created.batch);

      setLocalStageMessage(`Mengunggah ${selectedFiles.length} berkas ke server...`);
      const uploaded = await uploadImportFiles(activeBatchId, selectedFiles, sourceMode);
      setBatch(uploaded.batch);

      setLocalStageMessage(
        'Mengekstrak teks, tabel, dan gambar dengan AI serta mendeteksi duplikasi...'
      );
      const extracted = await extractImportBatch(activeBatchId);
      setBatch(extracted.batch);
      setCandidates(extracted.batch.candidates || []);
      setHasUnsavedChanges(false);
      setStage('review');
      void loadStatusAndHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses berkas impor.';
      setErrorMessage(msg);
      if (activeBatchId) {
        try {
          const refreshed = await fetchImportBatchDetail(activeBatchId);
          setBatch(refreshed.batch);
        } catch {
          // Abaikan
        }
      } else {
        setStage('setup');
      }
    } finally {
      setIsBusy(false);
      setLocalStageMessage('');
    }
  };

  const handleRetryExtract = async () => {
    if (!batch || isBusy) return;
    setIsBusy(true);
    setErrorMessage('');
    setLocalStageMessage('Mencoba ulang ekstraksi AI pada berkas batch...');
    try {
      const extracted = await extractImportBatch(batch.id);
      setBatch(extracted.batch);
      setCandidates(extracted.batch.candidates || []);
      setHasUnsavedChanges(false);
      setStage('review');
      void loadStatusAndHistory();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mencoba ulang ekstraksi.');
      try {
        const refreshed = await fetchImportBatchDetail(batch.id);
        setBatch(refreshed.batch);
      } catch {
        // Abaikan
      }
    } finally {
      setIsBusy(false);
      setLocalStageMessage('');
    }
  };

  const handleSaveDraftChanges = async (nextCandidates?: ExtractedQuestionCandidate[]) => {
    if (!batch) return false;
    const payload = nextCandidates || candidates;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const res = await updateImportBatchQuestions(batch.id, payload);
      setBatch(res.batch);
      setCandidates(res.batch.candidates || []);
      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan perubahan draft.');
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleProceedToSummary = async () => {
    if (!batch) return;
    if (hasUnsavedChanges) {
      const ok = await handleSaveDraftChanges();
      if (!ok) return;
    }
    setSaveError('');
    setStage('summary');
  };

  const handleConfirmSaveToBank = async (options: {
    selectedIds: string[];
    skipDuplicates: boolean;
  }) => {
    if (!batch || isBusy) return;
    setIsBusy(true);
    setSaveError('');
    try {
      if (hasUnsavedChanges) {
        const synced = await updateImportBatchQuestions(batch.id, candidates);
        setBatch(synced.batch);
        setCandidates(synced.batch.candidates || []);
        setHasUnsavedChanges(false);
      }
      const res = await saveImportBatchToBank(batch.id, options);
      setBatch(res.batch);
      setSavedResult({
        alreadySaved: res.alreadySaved,
        savedQuestionIds: res.savedQuestionIds,
        storageWarnings: res.storageWarnings || [],
      });
      void loadStatusAndHistory();
      onImportSaved(res.savedQuestionIds.length);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan soal ke Bank Soal.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResumeHistoryBatch = async (batchId: string) => {
    setErrorMessage('');
    setSavedResult(null);
    setSaveError('');
    setIsBusy(true);
    try {
      const res = await fetchImportBatchDetail(batchId);
      setBatch(res.batch);
      setCandidates(res.batch.candidates || []);
      setHasUnsavedChanges(false);
      setActiveTab('new');
      if (res.batch.status === 'review_required') {
        setStage('review');
      } else if (res.batch.status === 'completed') {
        setSavedResult({
          alreadySaved: true,
          savedQuestionIds: res.batch.savedQuestionIds || [],
          storageWarnings: [],
        });
        setStage('summary');
      } else {
        setStage('processing');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membuka sesi impor.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    try {
      await cancelImportBatch(batchId);
      if (batch?.id === batchId) {
        setBatch(null);
        setCandidates([]);
        setSelectedFiles([]);
        setStage('setup');
      }
      void loadStatusAndHistory();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membatalkan sesi impor.');
    }
  };

  const resetForNewImport = () => {
    setBatch(null);
    setCandidates([]);
    setSelectedFiles([]);
    setSavedResult(null);
    setSaveError('');
    setErrorMessage('');
    setHasUnsavedChanges(false);
    setStage('setup');
    setActiveTab('new');
  };

  const stepIndex =
    stage === 'setup' ? 1 : stage === 'processing' ? 2 : stage === 'review' ? 3 : 4;

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToBank}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Bank Soal
          </button>
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-700" />
              Impor Soal dengan AI
            </h2>
            <p className="text-xs text-slate-500">
              Ekstrak soal dari Word, PDF, Excel, CSV, foto lembar soal, atau kamera langsung.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              activeTab === 'new'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Impor Baru
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              void loadStatusAndHistory();
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Riwayat ({historyItems.length})
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <ImportHistory
          items={historyItems}
          loading={historyLoading}
          onRefresh={() => void loadStatusAndHistory()}
          onResumeBatch={(id) => void handleResumeHistoryBatch(id)}
          onCancelBatch={(id) => void handleCancelBatch(id)}
        />
      ) : (
        <>
          {/* Stepper Indicator */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { step: 1, title: '1. Sumber & Berkas' },
              { step: 2, title: '2. Ekstraksi AI' },
              { step: 3, title: '3. Preview & Review Guru' },
              { step: 4, title: '4. Simpan ke Bank Soal' },
            ].map((s) => {
              const active = stepIndex === s.step;
              const done = stepIndex > s.step || Boolean(savedResult);
              return (
                <div
                  key={s.step}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    done
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : active
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                  }`}
                >
                  <span>{s.title}</span>
                </div>
              );
            })}
          </div>

          {errorMessage && stage !== 'setup' && stage !== 'processing' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 font-medium">
              {errorMessage}
            </div>
          )}

          {stage === 'setup' && (
            <FileUploadArea
              sourceMode={sourceMode}
              onChangeSourceMode={setSourceMode}
              defaultSubjectId={subjectId}
              onChangeSubjectId={setSubjectId}
              defaultGrade={grade}
              onChangeGrade={setGrade}
              defaultSemester={semester}
              onChangeSemester={setSemester}
              defaultTopic={topic}
              onChangeTopic={setTopic}
              selectedFiles={selectedFiles}
              onChangeFiles={setSelectedFiles}
              geminiConfigured={geminiConfigured}
              maxFileSizeBytes={maxFileSizeBytes}
              maxFilesPerBatch={maxFilesPerBatch}
              isBusy={isBusy}
              errorMessage={errorMessage}
              onStartUploadAndExtract={() => void handleStartUploadAndExtract()}
            />
          )}

          {stage === 'processing' && (
            <ImportProgress
              batch={batch}
              localStageMessage={localStageMessage}
              isBusy={isBusy}
              onRetryExtract={() => void handleRetryExtract()}
              onBackToUpload={() => setStage('setup')}
              onCancelBatch={() => {
                if (batch) void handleCancelBatch(batch.id);
                else setStage('setup');
              }}
            />
          )}

          {stage === 'review' && batch && (
            <ExtractionResult
              batch={{
                ...batch,
                candidates,
                stats: {
                  ...batch.stats,
                  totalExtracted: candidates.length,
                  readyCount: candidates.filter(
                    (c) => c.extractionStatus !== 'failed' && !c.needsReview
                  ).length,
                  needsReviewCount: candidates.filter(
                    (c) => c.needsReview || c.extractionStatus === 'needs_review'
                  ).length,
                  failedCount: candidates.filter((c) => c.extractionStatus === 'failed').length,
                  missingKeyCount: candidates.filter((c) => !c.correctAnswer?.trim()).length,
                  duplicateCount: candidates.filter((c) => Boolean(c.duplicateOfId)).length,
                },
              }}
              isBusy={isBusy}
              hasUnsavedChanges={hasUnsavedChanges}
              onChangeCandidates={(next) => {
                setCandidates(next);
                setHasUnsavedChanges(true);
              }}
              onEditCandidate={(cand) => setEditingCandidate(cand)}
              onSaveDraft={() => void handleSaveDraftChanges()}
              onProceedToSummary={() => void handleProceedToSummary()}
            />
          )}

          {stage === 'summary' && batch && (
            <ImportSummary
              batch={batch}
              candidates={candidates}
              isSaving={isBusy}
              saveError={saveError}
              savedResult={savedResult}
              onBackToReview={() => setStage('review')}
              onConfirmSave={(opts) => void handleConfirmSaveToBank(opts)}
              onFinishToBank={onBackToBank}
              onStartNewImport={resetForNewImport}
            />
          )}

          {editingCandidate && batch && (
            <QuestionReviewEditor
              batchId={batch.id}
              candidate={editingCandidate}
              onClose={() => setEditingCandidate(null)}
              onSaveCandidate={(updated) => {
                const next = candidates.map((c) => (c.id === updated.id ? updated : c));
                setCandidates(next);
                setEditingCandidate(null);
                void handleSaveDraftChanges(next);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
