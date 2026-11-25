import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { WORLDS } from '../../../data/worlds';
import { uploadQuestionImageToStorage } from '../../../lib/firebase';
import { fetchImportTempAssetBlobUrl } from '../../../services/apiClient';
import type {
  DifficultyLevel,
  ExtractedQuestionCandidate,
  QuestionType,
  SubjectId,
} from '../../../types/psas';

interface QuestionReviewEditorProps {
  batchId: string;
  candidate: ExtractedQuestionCandidate;
  onSaveCandidate: (updated: ExtractedQuestionCandidate) => void;
  onClose: () => void;
}

const EDITABLE_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'multiple_choice', label: 'Pilihan Ganda' },
  { value: 'multiple_select', label: 'PG Kompleks (Banyak Jawaban)' },
  { value: 'true_false', label: 'Benar / Salah' },
  { value: 'short_answer', label: 'Isian Singkat' },
  { value: 'matching', label: 'Menjodohkan' },
  { value: 'ordering', label: 'Mengurutkan' },
  { value: 'illustrated', label: 'Soal Ilustrasi' },
  { value: 'essay', label: 'Uraian (Penilaian Manual)' },
];

export const QuestionReviewEditor: React.FC<QuestionReviewEditorProps> = ({
  batchId,
  candidate,
  onSaveCandidate,
  onClose,
}) => {
  const [draft, setDraft] = useState<ExtractedQuestionCandidate>({
    ...candidate,
    options: candidate.options ? [...candidate.options] : ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'],
    matchLeft: candidate.matchLeft ? [...candidate.matchLeft] : undefined,
    matchRight: candidate.matchRight ? [...candidate.matchRight] : undefined,
    orderingItems: candidate.orderingItems ? [...candidate.orderingItems] : undefined,
    uncertainSegments: [...(candidate.uncertainSegments || [])],
    validationWarnings: [...(candidate.validationWarnings || [])],
  });

  const [assetBlobUrl, setAssetBlobUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    async function loadAsset() {
      if (!draft.tempAssetId || draft.removeImage || draft.imageUrl) {
        setAssetBlobUrl(null);
        return;
      }
      const url = await fetchImportTempAssetBlobUrl(batchId, draft.tempAssetId);
      if (!active) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      createdUrl = url;
      setAssetBlobUrl(url);
    }
    void loadAsset();
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [batchId, draft.tempAssetId, draft.removeImage, draft.imageUrl]);

  const previewSrc = draft.removeImage ? '' : draft.imageUrl || assetBlobUrl || '';

  const handleUploadNewImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    setUploadingImage(true);
    try {
      const url = await uploadQuestionImageToStorage(file);
      setDraft((prev) => ({
        ...prev,
        imageUrl: url,
        tempAssetId: undefined,
        removeImage: false,
      }));
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Gagal mengunggah gambar pengganti.'
      );
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const toggleMultiCorrectOption = (opt: string) => {
    let current: string[] = [];
    try {
      const parsed = JSON.parse(draft.correctAnswer || '[]') as unknown;
      if (Array.isArray(parsed)) current = parsed.map(String);
    } catch {
      current = [];
    }
    const next = current.includes(opt)
      ? current.filter((item) => item !== opt)
      : [...current, opt];
    setDraft((prev) => ({
      ...prev,
      correctAnswer: JSON.stringify(next),
      hasExplicitKey: next.length > 0,
    }));
  };

  let multiSelectChosen: string[] = [];
  if (draft.type === 'multiple_select' && draft.correctAnswer) {
    try {
      const parsed = JSON.parse(draft.correctAnswer) as unknown;
      if (Array.isArray(parsed)) multiSelectChosen = parsed.map(String);
    } catch {
      multiSelectChosen = [];
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions =
      draft.type === 'multiple_choice' ||
      draft.type === 'multiple_select' ||
      draft.type === 'illustrated'
        ? (draft.options || []).map((o) => o.trim()).filter(Boolean)
        : undefined;

    const cleanKey = draft.correctAnswer.trim();
    const nextNeedsReview = draft.needsReview && Boolean(cleanKey) ? false : draft.needsReview || !cleanKey;

    onSaveCandidate({
      ...draft,
      prompt: draft.prompt.trim(),
      options: cleanOptions,
      correctAnswer: cleanKey,
      hasExplicitKey: Boolean(cleanKey),
      needsReview: nextNeedsReview,
      extractionStatus: !draft.prompt.trim()
        ? 'failed'
        : nextNeedsReview
          ? 'needs_review'
          : 'success',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900">
              Review & Edit Butir Soal #{draft.orderIndex}
            </h3>
            <p className="text-xs text-slate-500">
              Sumber: {draft.sourceFileName}
              {draft.sourcePage ? ` · Hal. ${draft.sourcePage}` : ''}
              {draft.sourceQuestionNumber ? ` · No. Asli ${draft.sourceQuestionNumber}` : ''}
              {' · '}Keyakinan Baca {Math.round((draft.extractionConfidence || 0) * 100)}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Uncertain / OCR warning banner */}
          {(draft.uncertainSegments.length > 0 || draft.validationWarnings.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                Catatan Pemeriksaan OCR & Validasi
              </p>
              {draft.validationWarnings.map((w, i) => (
                <p key={`w_${i}`}>• {w}</p>
              ))}
              {draft.uncertainSegments.length > 0 && (
                <p>
                  <span className="font-semibold">Teks/bagian perlu cek ulang:</span>{' '}
                  {draft.uncertainSegments.map((seg, i) => (
                    <mark
                      key={`seg_${i}`}
                      className="bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded mx-0.5"
                    >
                      {seg}
                    </mark>
                  ))}
                </p>
              )}
            </div>
          )}

          {/* Metadata row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mapel</label>
              <select
                value={draft.subjectId}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, subjectId: e.target.value as SubjectId }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                {WORLDS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.subjectName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipe Soal</label>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, type: e.target.value as QuestionType }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                {EDITABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Kesulitan</label>
              <select
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    difficulty: e.target.value as DifficultyLevel,
                  }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                <option value="mudah">Mudah</option>
                <option value="sedang">Sedang</option>
                <option value="sulit">Sulit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Bobot Skor</label>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.weight}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, weight: Number(e.target.value) || 10 }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Teks Pertanyaan Soal
            </label>
            <textarea
              rows={3}
              required
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Options for MCQ / Illustrated / Multiple Select */}
          {(draft.type === 'multiple_choice' ||
            draft.type === 'multiple_select' ||
            draft.type === 'illustrated') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Pilihan Jawaban (Klik opsi untuk menjadikannya Kunci Jawaban Resmi)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      options: [...(prev.options || []), `Pilihan ${(prev.options?.length || 0) + 1}`],
                    }))
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Opsi
                </button>
              </div>
              <div className="space-y-2">
                {(draft.options || []).map((opt, idx) => {
                  const isOfficial =
                    draft.type === 'multiple_select'
                      ? multiSelectChosen.includes(opt)
                      : draft.correctAnswer === opt && Boolean(opt.trim());
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (draft.type === 'multiple_select') {
                            toggleMultiCorrectOption(opt);
                          } else {
                            setDraft((prev) => ({
                              ...prev,
                              correctAnswer: opt,
                              hasExplicitKey: Boolean(opt.trim()),
                            }));
                          }
                        }}
                        className={`w-8 h-8 rounded-lg text-xs font-bold shrink-0 flex items-center justify-center border cursor-pointer ${
                          isOfficial
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-50 border-slate-300 text-slate-600 hover:border-emerald-400'
                        }`}
                        title="Jadikan kunci jawaban resmi"
                      >
                        {isOfficial ? <Check className="w-4 h-4" /> : String.fromCharCode(65 + idx)}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setDraft((prev) => {
                            const updatedOpts = [...(prev.options || [])];
                            const oldVal = updatedOpts[idx];
                            updatedOpts[idx] = nextVal;
                            const nextKey =
                              prev.type !== 'multiple_select' && prev.correctAnswer === oldVal
                                ? nextVal
                                : prev.correctAnswer;
                            return { ...prev, options: updatedOpts, correctAnswer: nextKey };
                          });
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                      {(draft.options?.length || 0) > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              options: (prev.options || []).filter((_, i) => i !== idx),
                            }))
                          }
                          className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* True / False Official Key */}
          {draft.type === 'true_false' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Kunci Jawaban Resmi (Benar / Salah)
              </label>
              <div className="flex gap-2">
                {['Benar', 'Salah'].map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        correctAnswer: choice,
                        hasExplicitKey: true,
                      }))
                    }
                    className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                      draft.correctAnswer === choice
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Official Correct Answer Box */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Kunci Jawaban Resmi Guru
                {!draft.correctAnswer.trim() && (
                  <span className="ml-2 text-rose-700 font-semibold">
                    (Kosong — belum ditetapkan)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={draft.correctAnswer}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    correctAnswer: e.target.value,
                    hasExplicitKey: Boolean(e.target.value.trim()),
                  }))
                }
                placeholder="Isi kunci jawaban resmi atau setujui saran AI di bawah"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>

            {/* Separate AI Suggestion Card (never mixed silently with official key) */}
            {draft.aiSuggestedAnswer && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                    <Sparkles className="w-4 h-4 text-indigo-700" />
                    Saran Jawaban AI (Terpisah dari Kunci Resmi)
                  </div>
                  {draft.aiSuggestionApproved && draft.correctAnswer === draft.aiSuggestedAnswer ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sudah Disetujui Menjadi Kunci Resmi
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          correctAnswer: prev.aiSuggestedAnswer || '',
                          hasExplicitKey: true,
                          aiSuggestionApproved: true,
                        }))
                      }
                      className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Gunakan Saran AI sebagai Kunci Resmi
                    </button>
                  )}
                </div>
                <p className="text-xs text-indigo-900 font-semibold">
                  Saran: {draft.aiSuggestedAnswer}
                </p>
                {draft.aiSuggestionNote && (
                  <p className="text-xs text-indigo-800">{draft.aiSuggestionNote}</p>
                )}
              </div>
            )}
          </div>

          {/* Image attachment review */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-teal-700" />
                Gambar Soal (Opsional)
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingImage ? 'Mengunggah...' : 'Ganti / Unggah Gambar'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(e) => void handleUploadNewImage(e)}
                  />
                </label>
                {previewSrc && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        imageUrl: undefined,
                        tempAssetId: undefined,
                        removeImage: true,
                      }))
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Gambar
                  </button>
                )}
              </div>
            </div>

            {imageError && <p className="text-xs text-rose-700">{imageError}</p>}

            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Lampiran soal hasil ekstrak"
                className="max-h-52 rounded-xl border border-slate-200 bg-white object-contain"
              />
            ) : (
              <p className="text-xs text-slate-500">Tidak ada gambar terlampir pada butir soal ini.</p>
            )}
          </div>

          {/* Topic, indicator, explanation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Topik / Bab</label>
              <input
                type="text"
                value={draft.topic}
                onChange={(e) => setDraft((prev) => ({ ...prev, topic: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Indikator</label>
              <input
                type="text"
                value={draft.indicator}
                onChange={(e) => setDraft((prev) => ({ ...prev, indicator: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Pembahasan / Rubrik (Opsional)
            </label>
            <textarea
              rows={2}
              value={draft.type === 'essay' ? draft.rubric || '' : draft.explanation || ''}
              onChange={(e) => {
                const val = e.target.value;
                setDraft((prev) =>
                  prev.type === 'essay'
                    ? { ...prev, rubric: val }
                    : { ...prev, explanation: val }
                );
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!draft.needsReview}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, needsReview: !e.target.checked }))
              }
              className="w-4 h-4 rounded text-teal-700"
            />
            Tandai butir ini sudah diperiksa guru (siap disimpan sebagai VERIFIED jika ada kunci)
          </label>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            Simpan Perubahan Butir
          </button>
        </div>
      </form>
    </div>
  );
};
