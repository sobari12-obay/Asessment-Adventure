import React, { useState } from 'react';
import { Eye, Image as ImageIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { QuestionRenderer } from '../QuestionRenderer';
import { uploadQuestionImageToStorage } from '../../lib/firebase';
import { sanitizeId } from '../../services/firestoreService';
import type {
  AssessmentMode,
  DifficultyLevel,
  PublicQuestion,
  QuestionType,
  QuestionWithKey,
  SubjectId,
} from '../../types/psas';

interface QuestionEditorModalProps {
  assessmentId: string;
  subjectId: SubjectId;
  assessmentMode: AssessmentMode;
  ownerId: string;
  nextOrder: number;
  initialQuestion?: QuestionWithKey | null;
  allowSaveToBankToggle?: boolean;
  defaultSaveToBank?: boolean;
  onSave: (params: {
    question: Omit<PublicQuestion, 'createdAt' | 'updatedAt'>;
    key: {
      questionId: string;
      assessmentId: string;
      type: QuestionType;
      correctAnswer: string;
      acceptedVariations?: string[];
      numericTolerance?: number;
      rubric?: string;
      explanation?: string;
      weight: number;
      ownerId: string;
    };
    isNew: boolean;
    saveToBank?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'multiple_choice', label: '1. Pilihan Ganda' },
  { value: 'true_false', label: '2. Benar atau Salah' },
  { value: 'short_answer', label: '3. Isian Singkat' },
  { value: 'matching', label: '4. Menjodohkan' },
  { value: 'ordering', label: '5. Mengurutkan' },
  { value: 'drag_drop', label: '6. Drag and Drop (Kelompokkan)' },
  { value: 'image_choice', label: '7. Pilihan Berdasarkan Gambar' },
  { value: 'audio', label: '8. Audio Question' },
  { value: 'illustrated', label: '9. Soal dengan Ilustrasi' },
  { value: 'multiple_select', label: '10. Pilihan Beberapa Jawaban' },
  { value: 'essay', label: '11. Uraian (Penilaian Manual)' },
];

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  assessmentId,
  subjectId,
  assessmentMode,
  ownerId,
  nextOrder,
  initialQuestion,
  allowSaveToBankToggle = false,
  defaultSaveToBank = false,
  onSave,
  onClose,
}) => {
  const isNew = !initialQuestion;
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState('');
  const [saveToBank, setSaveToBank] = useState(defaultSaveToBank);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [type, setType] = useState<QuestionType>(initialQuestion?.type || 'multiple_choice');
  const [order, setOrder] = useState<number>(initialQuestion?.order || nextOrder);
  const [prompt, setPrompt] = useState(initialQuestion?.prompt || '');
  const [weight, setWeight] = useState<number>(initialQuestion?.weight ?? 10);
  const [topic, setTopic] = useState(initialQuestion?.topic || '');
  const [indicator, setIndicator] = useState(initialQuestion?.indicator || '');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(
    initialQuestion?.difficulty || 'mudah'
  );
  const [mediaUrl, setMediaUrl] = useState(initialQuestion?.mediaUrl || '');
  const [audioUrl, setAudioUrl] = useState(initialQuestion?.audioUrl || '');
  const [audioText, setAudioText] = useState(initialQuestion?.audioText || '');
  const [practiceHint, setPracticeHint] = useState(initialQuestion?.practiceHint || '');
  const [explanation, setExplanation] = useState(initialQuestion?.explanation || '');
  const [rubric, setRubric] = useState(initialQuestion?.rubric || '');
  const [numericTolerance, setNumericTolerance] = useState<number>(
    initialQuestion?.numericTolerance ?? 0
  );
  const [allowPartialScoring, setAllowPartialScoring] = useState<boolean>(
    initialQuestion?.allowPartialScoring ?? false
  );

  // Multiple choice / multi-select options
  const [options, setOptions] = useState<string[]>(
    initialQuestion?.options && initialQuestion.options.length > 0
      ? initialQuestion.options
      : ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D']
  );

  // Short answer variations
  const [variationsText, setVariationsText] = useState(
    (initialQuestion?.acceptedVariations || []).join(', ')
  );

  // Matching pairs
  const [matchPairs, setMatchPairs] = useState<Array<{ left: string; right: string }>>(() => {
    if (initialQuestion?.matchLeft && initialQuestion.matchRight) {
      return initialQuestion.matchLeft.map((l, idx) => ({
        left: l,
        right: initialQuestion.matchRight?.[idx] || '',
      }));
    }
    return [
      { left: 'Item 1', right: 'Pasangan 1' },
      { left: 'Item 2', right: 'Pasangan 2' },
    ];
  });

  // Ordering
  const [orderingItems, setOrderingItems] = useState<string[]>(
    initialQuestion?.orderingItems && initialQuestion.orderingItems.length > 0
      ? initialQuestion.orderingItems
      : ['Langkah Pertama', 'Langkah Kedua', 'Langkah Ketiga']
  );

  // Drag & drop
  const [dragTargets, setDragTargets] = useState<Array<{ id: string; label: string }>>(
    initialQuestion?.dragTargets && initialQuestion.dragTargets.length > 0
      ? initialQuestion.dragTargets
      : [
          { id: 'kelompok_a', label: 'Kelompok A' },
          { id: 'kelompok_b', label: 'Kelompok B' },
        ]
  );
  const [dragItems, setDragItems] = useState<Array<{ id: string; label: string; targetId: string }>>(() => {
    if (initialQuestion?.dragItems && initialQuestion.correctAnswer) {
      try {
        const keyObj = JSON.parse(initialQuestion.correctAnswer) as Record<string, string>;
        return initialQuestion.dragItems.map((it) => ({
          id: it.id,
          label: it.label,
          targetId: keyObj[it.id] || 'kelompok_a',
        }));
      } catch {
        // fallback below
      }
    }
    return [
      { id: 'item_1', label: 'Kartu 1', targetId: 'kelompok_a' },
      { id: 'item_2', label: 'Kartu 2', targetId: 'kelompok_b' },
    ];
  });

  // Image choice
  const [imageOptions, setImageOptions] = useState<
    Array<{ id: string; label: string; motif?: string; imageUrl?: string }>
  >(
    initialQuestion?.imageOptions && initialQuestion.imageOptions.length > 0
      ? initialQuestion.imageOptions
      : [
          { id: 'circle', label: 'Lingkaran', motif: 'circle' },
          { id: 'triangle', label: 'Segitiga', motif: 'triangle' },
          { id: 'square', label: 'Persegi', motif: 'square' },
          { id: 'star', label: 'Bintang', motif: 'star' },
        ]
  );

  // Correct answer state
  const [correctAnswer, setCorrectAnswer] = useState<string>(
    initialQuestion?.correctAnswer || ''
  );
  const [multiCorrect, setMultiCorrect] = useState<string[]>(() => {
    if (initialQuestion?.type === 'multiple_select' && initialQuestion.correctAnswer) {
      try {
        return JSON.parse(initialQuestion.correctAnswer) as string[];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function buildPayload(): {
    question: Omit<PublicQuestion, 'createdAt' | 'updatedAt'>;
    finalCorrectAnswer: string;
  } {
    const qId = initialQuestion?.id || sanitizeId(`q_${assessmentId}_${Date.now()}`);

    let finalCorrect = correctAnswer.trim();
    const baseQuestion: Omit<PublicQuestion, 'createdAt' | 'updatedAt'> = {
      id: qId,
      assessmentId,
      subjectId,
      order,
      type,
      prompt: prompt.trim(),
      weight,
      topic: topic.trim() || undefined,
      indicator: indicator.trim() || undefined,
      difficulty,
      mediaUrl: mediaUrl.trim() || undefined,
      audioUrl: audioUrl.trim() || undefined,
      audioText: audioText.trim() || undefined,
      practiceHint: practiceHint.trim() || undefined,
      numericTolerance: type === 'short_answer' && numericTolerance > 0 ? numericTolerance : undefined,
      allowPartialScoring: type === 'multiple_select' ? allowPartialScoring : undefined,
      isPublished: true,
      ownerId: initialQuestion?.ownerId || ownerId,
    };

    if (type === 'multiple_choice' || type === 'illustrated' || type === 'audio') {
      baseQuestion.options = options.map((o) => o.trim()).filter(Boolean);
      if (!finalCorrect && baseQuestion.options.length > 0) {
        finalCorrect = baseQuestion.options[0];
      }
    } else if (type === 'true_false') {
      finalCorrect = finalCorrect === 'Salah' ? 'Salah' : 'Benar';
    } else if (type === 'multiple_select') {
      baseQuestion.options = options.map((o) => o.trim()).filter(Boolean);
      finalCorrect = JSON.stringify(multiCorrect);
    } else if (type === 'matching') {
      const cleanPairs = matchPairs.filter((p) => p.left.trim() && p.right.trim());
      baseQuestion.matchLeft = cleanPairs.map((p) => p.left.trim());
      // Shuffle right items subtly for display
      baseQuestion.matchRight = [...cleanPairs.map((p) => p.right.trim())].reverse();
      const map: Record<string, string> = {};
      for (const p of cleanPairs) map[p.left.trim()] = p.right.trim();
      finalCorrect = JSON.stringify(map);
    } else if (type === 'ordering') {
      const cleanItems = orderingItems.map((i) => i.trim()).filter(Boolean);
      baseQuestion.orderingItems = [...cleanItems].reverse();
      finalCorrect = JSON.stringify(cleanItems);
    } else if (type === 'drag_drop') {
      baseQuestion.dragTargets = dragTargets.filter((t) => t.label.trim());
      baseQuestion.dragItems = dragItems
        .filter((i) => i.label.trim())
        .map((i) => ({ id: i.id, label: i.label.trim() }));
      const keyMap: Record<string, string> = {};
      for (const i of dragItems) {
        if (i.label.trim()) keyMap[i.id] = i.targetId;
      }
      finalCorrect = JSON.stringify(keyMap);
    } else if (type === 'image_choice') {
      baseQuestion.imageOptions = imageOptions.filter((o) => o.label.trim());
      if (!finalCorrect && baseQuestion.imageOptions.length > 0) {
        finalCorrect = baseQuestion.imageOptions[0].id;
      }
    }

    return { question: baseQuestion, finalCorrectAnswer: finalCorrect };
  }

  async function handleImageFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setIsUploadingImage(true);
    try {
      const uploadedUrl = await uploadQuestionImageToStorage(file);
      setMediaUrl(uploadedUrl);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Gagal mengunggah gambar ke Firebase Storage.'
      );
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!prompt.trim()) {
      setErrorMsg('Teks soal wajib diisi.');
      return;
    }

    const { question, finalCorrectAnswer } = buildPayload();
    if (!finalCorrectAnswer && type !== 'essay') {
      setErrorMsg('Kunci jawaban wajib diisi.');
      return;
    }

    setIsSaving(true);
    try {
      const acceptedVariations = variationsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await onSave({
        question,
        key: {
          questionId: question.id,
          assessmentId,
          type,
          correctAnswer: finalCorrectAnswer || '-',
          acceptedVariations: acceptedVariations.length > 0 ? acceptedVariations : undefined,
          numericTolerance: type === 'short_answer' && numericTolerance > 0 ? numericTolerance : undefined,
          rubric: rubric.trim() || undefined,
          explanation: explanation.trim() || undefined,
          weight,
          ownerId: initialQuestion?.ownerId || ownerId,
        },
        isNew,
        saveToBank: allowSaveToBankToggle ? saveToBank : undefined,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan soal.');
    } finally {
      setIsSaving(false);
    }
  }

  const previewQuestion = buildPayload().question;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {isNew ? 'Tambah Soal Baru' : `Edit Soal #${order}`}
            </h2>
            <p className="text-xs text-slate-500">
              Kunci jawaban disimpan terpisah di koleksi khusus guru.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPreview ? 'Kembali Edit' : 'Pratinjau Siswa'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {showPreview ? (
            <div className="space-y-4">
              <QuestionRenderer
                question={previewQuestion as PublicQuestion}
                questionNumber={order}
                totalQuestions={order}
                answerValue={previewAnswer}
                mode={assessmentMode}
                audioEnabled={true}
                lockedAfterAnswer={false}
                onChangeAnswer={setPreviewAnswer}
              />
            </div>
          ) : (
            <form id="question-editor-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Soal
                  </label>
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as QuestionType);
                      setCorrectAnswer('');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                  >
                    {QUESTION_TYPES.map((qt) => (
                      <option key={qt.value} value={qt.value}>
                        {qt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Urutan
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={order}
                      onChange={(e) => setOrder(Number(e.target.value) || 1)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bobot
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value) || 10)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teks Soal
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  required
                  placeholder="Tuliskan pertanyaan yang jelas dan ramah untuk siswa kelas 3 SD..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {/* Media / Audio Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Gambar Ilustrasi Soal (Opsional — Unggah atau URL)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://... atau unggah gambar"
                      className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-300 bg-teal-50 text-xs font-semibold text-teal-800 hover:bg-teal-100 cursor-pointer whitespace-nowrap">
                      <Upload className="w-3.5 h-3.5" />
                      {isUploadingImage ? 'Mengunggah...' : 'Unggah'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={isUploadingImage}
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setMediaUrl('/src/assets/images/science_butterfly_garden_1795448999476.jpg')
                      }
                      className="px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      Contoh IPAS
                    </button>
                  </div>
                  {uploadError && (
                    <p className="text-xs text-rose-600 font-medium">{uploadError}</p>
                  )}
                  {mediaUrl && (
                    <div className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50">
                      <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <img
                        src={mediaUrl}
                        alt="Pratinjau gambar soal"
                        className="h-12 w-16 object-cover rounded-lg border border-slate-200"
                      />
                      <span className="text-xs text-slate-600 truncate flex-1">{mediaUrl}</span>
                      <button
                        type="button"
                        onClick={() => setMediaUrl('')}
                        className="text-xs text-rose-600 hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </div>

                {type === 'audio' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teks Narasi Suara / URL Audio
                    </label>
                    <input
                      type="text"
                      value={audioText}
                      onChange={(e) => setAudioText(e.target.value)}
                      placeholder="Teks yang dibacakan suara (TTS)..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Type-specific builders */}
              {(type === 'multiple_choice' || type === 'illustrated' || type === 'audio') && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      Pilihan Jawaban (Klik radio untuk menetapkan Kunci Jawaban)
                    </label>
                    <button
                      type="button"
                      onClick={() => setOptions([...options, `Pilihan ${options.length + 1}`])}
                      className="text-xs font-semibold text-teal-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Pilihan
                    </button>
                  </div>
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="mc_correct"
                        checked={correctAnswer === opt && opt.trim() !== ''}
                        onChange={() => setCorrectAnswer(opt)}
                        className="w-4 h-4 accent-teal-700"
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...options];
                          const prevVal = next[idx];
                          next[idx] = e.target.value;
                          setOptions(next);
                          if (correctAnswer === prevVal) setCorrectAnswer(e.target.value);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {type === 'true_false' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Kunci Jawaban
                  </label>
                  <div className="flex gap-4">
                    {['Benar', 'Salah'].map((val) => (
                      <label key={val} className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="radio"
                          name="tf_correct"
                          checked={(correctAnswer || 'Benar') === val}
                          onChange={() => setCorrectAnswer(val)}
                          className="accent-teal-700"
                        />
                        {val}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {type === 'short_answer' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Kunci Jawaban Utama
                      </label>
                      <input
                        type="text"
                        value={correctAnswer}
                        onChange={(e) => setCorrectAnswer(e.target.value)}
                        placeholder="Contoh: Asar atau 25"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Variasi Jawaban Diterima (pisah koma)
                      </label>
                      <input
                        type="text"
                        value={variationsText}
                        onChange={(e) => setVariationsText(e.target.value)}
                        placeholder="Contoh: ashar, shalat asar"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Toleransi Angka (± untuk jawaban numerik, 0 = harus tepat):
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step="0.01"
                      value={numericTolerance}
                      onChange={(e) => setNumericTolerance(Math.max(0, Number(e.target.value) || 0))}
                      className="w-28 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm tabular-nums"
                    />
                  </div>
                </div>
              )}

              {type === 'multiple_select' && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      Pilihan & Centang Semua Jawaban Benar
                    </label>
                    <button
                      type="button"
                      onClick={() => setOptions([...options, `Pilihan ${options.length + 1}`])}
                      className="text-xs font-semibold text-teal-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Pilihan
                    </button>
                  </div>
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={multiCorrect.includes(opt)}
                        onChange={(e) => {
                          if (e.target.checked) setMultiCorrect([...multiCorrect, opt]);
                          else setMultiCorrect(multiCorrect.filter((v) => v !== opt));
                        }}
                        className="w-4 h-4 accent-teal-700"
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...options];
                          next[idx] = e.target.value;
                          setOptions(next);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 pt-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPartialScoring}
                      onChange={(e) => setAllowPartialScoring(e.target.checked)}
                      className="accent-teal-700"
                    />
                    Aktifkan skor sebagian (proporsional jika sebagian pilihan tepat tanpa memilih pengecoh)
                  </label>
                </div>
              )}

              {type === 'matching' && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      Pasangan Menjodohkan (Kiri ↔ Kanan yang Benar)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setMatchPairs([
                          ...matchPairs,
                          { left: `Item ${matchPairs.length + 1}`, right: `Pasangan ${matchPairs.length + 1}` },
                        ])
                      }
                      className="text-xs font-semibold text-teal-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Pasangan
                    </button>
                  </div>
                  {matchPairs.map((pair, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={pair.left}
                        onChange={(e) => {
                          const next = [...matchPairs];
                          next[idx] = { ...next[idx], left: e.target.value };
                          setMatchPairs(next);
                        }}
                        placeholder="Kolom Kiri"
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                      <input
                        type="text"
                        value={pair.right}
                        onChange={(e) => {
                          const next = [...matchPairs];
                          next[idx] = { ...next[idx], right: e.target.value };
                          setMatchPairs(next);
                        }}
                        placeholder="Pasangan Kanan"
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {type === 'ordering' && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      Masukkan Urutan yang BENAR (1 → N)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setOrderingItems([...orderingItems, `Langkah ${orderingItems.length + 1}`])
                      }
                      className="text-xs font-semibold text-teal-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Item
                    </button>
                  </div>
                  {orderingItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 w-6 tabular-nums">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const next = [...orderingItems];
                          next[idx] = e.target.value;
                          setOrderingItems(next);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {type === 'drag_drop' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-slate-800">
                    Kelompok Tujuan & Kartu Drag-and-Drop
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {dragTargets.map((t, idx) => (
                      <input
                        key={t.id}
                        type="text"
                        value={t.label}
                        onChange={(e) => {
                          const next = [...dragTargets];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setDragTargets(next);
                        }}
                        placeholder={`Target ${idx + 1}`}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium"
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {dragItems.map((it, idx) => (
                      <div key={it.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={it.label}
                          onChange={(e) => {
                            const next = [...dragItems];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setDragItems(next);
                          }}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        />
                        <select
                          value={it.targetId}
                          onChange={(e) => {
                            const next = [...dragItems];
                            next[idx] = { ...next[idx], targetId: e.target.value };
                            setDragItems(next);
                          }}
                          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                        >
                          {dragTargets.map((t) => (
                            <option key={t.id} value={t.id}>
                              → {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setDragItems([
                          ...dragItems,
                          {
                            id: `item_${Date.now()}`,
                            label: `Kartu ${dragItems.length + 1}`,
                            targetId: dragTargets[0].id,
                          },
                        ])
                      }
                      className="text-xs font-semibold text-teal-700 cursor-pointer"
                    >
                      + Tambah Kartu
                    </button>
                  </div>
                </div>
              )}

              {type === 'image_choice' && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-slate-800">
                    Pilihan Kartu Visual (Pilih radio untuk Kunci Jawaban)
                  </label>
                  {imageOptions.map((opt, idx) => (
                    <div key={opt.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                          type="radio"
                          name="img_correct"
                          checked={correctAnswer === opt.id}
                          onChange={() => setCorrectAnswer(opt.id)}
                          className="accent-teal-700 shrink-0"
                        />
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => {
                            const next = [...imageOptions];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setImageOptions(next);
                          }}
                          placeholder="Label kartu"
                          className="w-full sm:w-36 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        />
                      </div>
                      <input
                        type="text"
                        value={opt.imageUrl || ''}
                        onChange={(e) => {
                          const next = [...imageOptions];
                          next[idx] = { ...next[idx], imageUrl: e.target.value };
                          setImageOptions(next);
                        }}
                        placeholder="URL gambar (kosongkan untuk bentuk SVG bawaan)"
                        className="flex-1 w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {type === 'essay' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Contoh Jawaban Ideal
                    </label>
                    <input
                      type="text"
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Rubrik Penilaian Guru
                    </label>
                    <textarea
                      rows={2}
                      value={rubric}
                      onChange={(e) => setRubric(e.target.value)}
                      placeholder="Kriteria skor penuh / sebagian untuk penilaian manual..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Metadata & Pedagogical Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Materi
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Misal: Pecahan Sederhana"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Indikator Pencapaian
                  </label>
                  <input
                    type="text"
                    value={indicator}
                    onChange={(e) => setIndicator(e.target.value)}
                    placeholder="Misal: Siswa dapat..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tingkat Kesulitan
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    <option value="mudah">Mudah</option>
                    <option value="sedang">Sedang</option>
                    <option value="sulit">Sulit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Petunjuk (khusus Mode Latihan)
                  </label>
                  <input
                    type="text"
                    value={practiceHint}
                    onChange={(e) => setPracticeHint(e.target.value)}
                    placeholder="Petunjuk ringan untuk siswa..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pembahasan / Penjelasan
                  </label>
                  <input
                    type="text"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Penjelasan konsep jawaban benar..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {allowSaveToBankToggle && isNew && (
                <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-xs font-semibold text-teal-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToBank}
                    onChange={(e) => setSaveToBank(e.target.checked)}
                    className="accent-teal-700"
                  />
                  Simpan juga soal ini ke Bank Soal terpusat agar dapat dipakai ulang di asesmen lain
                </label>
              )}

              {errorMsg && (
                <p className="text-sm text-rose-600 font-medium">{errorMsg}</p>
              )}
            </form>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            form="question-editor-form"
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Soal'}
          </button>
        </div>
      </div>
    </div>
  );
};
