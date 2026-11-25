import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  CopyCheck,
  Edit3,
  Image as ImageIcon,
  Save,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getWorldConfig } from '../../../data/worlds';
import { fetchImportTempAssetBlobUrl } from '../../../services/apiClient';
import type { ExtractedQuestionCandidate, ImportBatchRecord, QuestionType } from '../../../types/psas';

interface ExtractionResultProps {
  batch: ImportBatchRecord;
  isBusy: boolean;
  hasUnsavedChanges: boolean;
  onChangeCandidates: (next: ExtractedQuestionCandidate[]) => void;
  onEditCandidate: (candidate: ExtractedQuestionCandidate) => void;
  onSaveDraft: () => void;
  onProceedToSummary: () => void;
}

type ResultFilter = 'all' | 'needs_review' | 'missing_key' | 'duplicate' | 'failed';

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Pilihan Ganda',
  multiple_select: 'PG Kompleks',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  matching: 'Menjodohkan',
  ordering: 'Mengurutkan',
  drag_drop: 'Drag & Drop',
  image_choice: 'Pilihan Gambar',
  audio: 'Soal Audio',
  illustrated: 'Soal Ilustrasi',
  essay: 'Uraian',
};

const CandidateTempImageThumb: React.FC<{
  batchId: string;
  tempAssetId?: string;
  imageUrl?: string;
  removeImage?: boolean;
}> = ({ batchId, tempAssetId, imageUrl, removeImage }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    async function load() {
      if (removeImage || imageUrl || !tempAssetId) {
        setBlobUrl(null);
        return;
      }
      const url = await fetchImportTempAssetBlobUrl(batchId, tempAssetId);
      if (!active) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      created = url;
      setBlobUrl(url);
    }
    void load();
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [batchId, tempAssetId, imageUrl, removeImage]);

  if (removeImage) return null;
  const src = imageUrl || blobUrl;
  if (!src) return null;

  return (
    <div className="mt-2.5 flex items-center gap-3">
      <img
        src={src}
        alt="Ilustrasi butir soal"
        className="w-24 h-20 object-contain rounded-xl border border-slate-200 bg-slate-50 p-1"
      />
      <span className="text-xs text-slate-500 flex items-center gap-1">
        <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
        Gambar terpasang pada butir soal
      </span>
    </div>
  );
};

export const ExtractionResult: React.FC<ExtractionResultProps> = ({
  batch,
  isBusy,
  hasUnsavedChanges,
  onChangeCandidates,
  onEditCandidate,
  onSaveDraft,
  onProceedToSummary,
}) => {
  const [filter, setFilter] = useState<ResultFilter>('all');

  const candidates = batch.candidates;

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filter === 'needs_review') return c.needsReview || c.extractionStatus === 'needs_review';
      if (filter === 'missing_key') return !c.correctAnswer || !c.correctAnswer.trim();
      if (filter === 'duplicate') return Boolean(c.duplicateOfId);
      if (filter === 'failed') return c.extractionStatus === 'failed';
      return true;
    });
  }, [candidates, filter]);

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selectedForSave && c.extractionStatus !== 'failed').length,
    [candidates]
  );

  const toggleSelect = (id: string) => {
    onChangeCandidates(
      candidates.map((c) => (c.id === id ? { ...c, selectedForSave: !c.selectedForSave } : c))
    );
  };

  const approveAiSuggestion = (id: string) => {
    onChangeCandidates(
      candidates.map((c) => {
        if (c.id !== id || !c.aiSuggestedAnswer) return c;
        return {
          ...c,
          correctAnswer: c.aiSuggestedAnswer,
          hasExplicitKey: true,
          aiSuggestionApproved: true,
          needsReview: false,
          extractionStatus: c.prompt.trim() ? 'success' : c.extractionStatus,
        };
      })
    );
  };

  const moveCandidate = (id: string, direction: -1 | 1) => {
    const idx = candidates.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= candidates.length) return;
    const next = [...candidates];
    const [moved] = next.splice(idx, 1);
    next.splice(swapIdx, 0, moved);
    onChangeCandidates(
      next.map((c, i) => ({
        ...c,
        orderIndex: i + 1,
      }))
    );
  };

  const removeCandidate = (id: string) => {
    const next = candidates
      .filter((c) => c.id !== id)
      .map((c, i) => ({ ...c, orderIndex: i + 1 }));
    onChangeCandidates(next);
  };

  const selectReadyOnly = () => {
    onChangeCandidates(
      candidates.map((c) => ({
        ...c,
        selectedForSave:
          c.extractionStatus !== 'failed' && Boolean(c.prompt.trim()) && !c.duplicateOfId,
      }))
    );
  };

  const selectAllValid = () => {
    onChangeCandidates(
      candidates.map((c) => ({
        ...c,
        selectedForSave: c.extractionStatus !== 'failed' && Boolean(c.prompt.trim()),
      }))
    );
  };

  const clearSelection = () => {
    onChangeCandidates(candidates.map((c) => ({ ...c, selectedForSave: false })));
  };

  return (
    <div className="space-y-5">
      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-slate-500">Total Terbaca</p>
          <p className="font-display text-xl font-bold text-slate-900 mt-0.5">
            {batch.stats.totalExtracted}
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-emerald-800">Siap Disimpan</p>
          <p className="font-display text-xl font-bold text-emerald-900 mt-0.5">
            {batch.stats.readyCount}
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-amber-800">Perlu Review</p>
          <p className="font-display text-xl font-bold text-amber-900 mt-0.5">
            {batch.stats.needsReviewCount}
          </p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-rose-800">Belum Ada Kunci</p>
          <p className="font-display text-xl font-bold text-rose-900 mt-0.5">
            {batch.stats.missingKeyCount}
          </p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-indigo-800">Mirip Bank Soal</p>
          <p className="font-display text-xl font-bold text-indigo-900 mt-0.5">
            {batch.stats.duplicateCount}
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-slate-600">Dipilih Simpan</p>
          <p className="font-display text-xl font-bold text-teal-800 mt-0.5">{selectedCount}</p>
        </div>
      </div>

      {/* Filter & Bulk Action Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `Semua (${candidates.length})` },
              {
                id: 'needs_review',
                label: `Perlu Review (${candidates.filter((c) => c.needsReview || c.extractionStatus === 'needs_review').length})`,
              },
              {
                id: 'missing_key',
                label: `Belum Ada Kunci (${candidates.filter((c) => !c.correctAnswer?.trim()).length})`,
              },
              {
                id: 'duplicate',
                label: `Duplikat (${candidates.filter((c) => Boolean(c.duplicateOfId)).length})`,
              },
              {
                id: 'failed',
                label: `Gagal (${candidates.filter((c) => c.extractionStatus === 'failed').length})`,
              },
            ] as Array<{ id: ResultFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                filter === tab.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={selectReadyOnly}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
          >
            Pilih Siap Non-Duplikat
          </button>
          <button
            type="button"
            onClick={selectAllValid}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
          >
            Pilih Semua Valid
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-600 cursor-pointer"
          >
            Kosongkan
          </button>
        </div>
      </div>

      {/* Candidate List */}
      {filteredCandidates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Tidak ada butir soal hasil ekstrak yang sesuai dengan filter ini.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCandidates.map((item, visibleIdx) => {
            const world = getWorldConfig(item.subjectId);
            const hasOfficialKey = Boolean(item.correctAnswer && item.correctAnswer.trim());
            const isFailed = item.extractionStatus === 'failed';

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition-colors ${
                  item.selectedForSave
                    ? 'border-teal-300'
                    : isFailed
                      ? 'border-rose-200 bg-rose-50/40'
                      : 'border-slate-200 opacity-85'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={item.selectedForSave}
                      disabled={isFailed}
                      onChange={() => toggleSelect(item.id)}
                      className="mt-1 w-4 h-4 rounded text-teal-700 cursor-pointer"
                      aria-label={`Pilih soal nomor ${item.orderIndex}`}
                    />

                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Header metadata line */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        <span className="font-display font-bold text-slate-900">
                          Soal #{item.orderIndex}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-semibold text-teal-700">{world.subjectName}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-700 font-medium">
                          {TYPE_LABELS[item.type] || item.type}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500">
                          {item.sourceFileName}
                          {item.sourcePage ? ` (Hal. ${item.sourcePage})` : ''}
                          {item.sourceQuestionNumber ? ` · No. ${item.sourceQuestionNumber}` : ''}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isFailed
                              ? 'text-rose-700'
                              : item.needsReview
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {isFailed ? (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Gagal
                            </>
                          ) : item.needsReview ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" /> Perlu Review
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Siap (
                              {Math.round(item.extractionConfidence * 100)}%)
                            </>
                          )}
                        </span>
                      </div>

                      {/* Prompt */}
                      <p className="text-sm font-semibold text-slate-900 whitespace-pre-line">
                        {item.prompt || '(Pertanyaan tidak terbaca — klik Edit & Tinjau untuk melengkapi)'}
                      </p>

                      {/* Options preview */}
                      {item.options && item.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {item.options.map((opt, oIdx) => {
                            const isKeyMatch =
                              item.type === 'multiple_select'
                                ? (() => {
                                    try {
                                      const arr = JSON.parse(item.correctAnswer || '[]') as string[];
                                      return Array.isArray(arr) && arr.includes(opt);
                                    } catch {
                                      return false;
                                    }
                                  })()
                                : item.correctAnswer === opt && hasOfficialKey;
                            return (
                              <div
                                key={oIdx}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${
                                  isKeyMatch
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <span className="font-bold text-slate-500">
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                <span className="truncate">{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Attached temp or uploaded image preview */}
                      <CandidateTempImageThumb
                        batchId={batch.id}
                        tempAssetId={item.tempAssetId}
                        imageUrl={item.imageUrl}
                        removeImage={item.removeImage}
                      />

                      {/* Official key vs Separate AI Suggestion */}
                      <div className="pt-1 space-y-1.5">
                        <div className="text-xs flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-700">Kunci Resmi:</span>
                          {hasOfficialKey ? (
                            <span className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              {item.correctAnswer}
                            </span>
                          ) : (
                            <span className="text-rose-700 font-semibold">
                              Belum ada kunci jawaban resmi (tersimpan sebagai BELUM_DIVERIFIKASI)
                            </span>
                          )}
                        </div>

                        {item.aiSuggestedAnswer && (
                          <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-indigo-950 min-w-0">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                              <span>
                                <strong>Saran AI:</strong> {item.aiSuggestedAnswer}
                              </span>
                            </div>
                            {item.aiSuggestionApproved &&
                            item.correctAnswer === item.aiSuggestedAnswer ? (
                              <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Disetujui
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => approveAiSuggestion(item.id)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-semibold cursor-pointer"
                              >
                                Jadikan Kunci Resmi
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Uncertain / warnings / duplicate callouts */}
                      {(item.uncertainSegments.length > 0 ||
                        item.validationWarnings.length > 0 ||
                        item.duplicateOfId) && (
                        <div className="text-xs space-y-1 pt-1">
                          {item.duplicateOfId && (
                            <p className="text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                              <strong>Kemungkinan Duplikat</strong> ({Math.round((item.duplicateSimilarity || 0) * 100)}
                              % mirip soal ID <code className="font-mono">{item.duplicateOfId}</code>): “
                              {item.duplicatePromptPreview}”
                            </p>
                          )}
                          {item.uncertainSegments.length > 0 && (
                            <p className="text-amber-900">
                              <strong>Bagian perlu cek:</strong> {item.uncertainSegments.join(' · ')}
                            </p>
                          )}
                          {item.validationWarnings.length > 0 && (
                            <p className="text-amber-800">{item.validationWarnings.join(' · ')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex lg:flex-col items-center lg:items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditCandidate(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-teal-700" />
                      Edit & Tinjau
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={visibleIdx === 0 && filter === 'all'}
                        onClick={() => moveCandidate(item.id, -1)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                        title="Naikkan urutan"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCandidate(item.id, 1)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Turunkan urutan"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCandidate(item.id)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-700 hover:border-rose-200 cursor-pointer"
                        title="Hapus kandidat ini dari batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Sticky Action Footer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <strong>{selectedCount}</strong> dari {candidates.length} butir soal dipilih untuk masuk ke
          Bank Soal.
          {hasUnsavedChanges && (
            <span className="ml-2 text-amber-700 font-semibold">
              (Ada perubahan review yang belum disinkronkan)
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onSaveDraft}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            Simpan Draft Review
          </button>
          <button
            type="button"
            disabled={isBusy || selectedCount === 0}
            onClick={onProceedToSummary}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
          >
            <CopyCheck className="w-4 h-4" />
            Lanjut Konfirmasi Simpan ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
};
