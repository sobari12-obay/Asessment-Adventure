import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  HelpCircle,
  ImageOff,
  Lightbulb,
  Link2,
  Play,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { audioEngine } from '../lib/audioEngine';
import { ShapeMotifSvg } from './WorldVisuals';
import type { AssessmentMode, PublicQuestion } from '../types/psas';

interface QuestionRendererProps {
  question: PublicQuestion;
  questionNumber: number;
  totalQuestions: number;
  answerValue: string;
  mode: AssessmentMode;
  audioEnabled: boolean;
  lockedAfterAnswer: boolean;
  onChangeAnswer: (nextValue: string) => void;
}

function safeParse<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeMediaUrl(raw?: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/src/assets/') || trimmed.startsWith('/assets/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionNumber,
  totalQuestions,
  answerValue,
  mode,
  audioEnabled,
  lockedAfterAnswer,
  onChangeAnswer,
}) => {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showPracticeCheck, setShowPracticeCheck] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const [failedOptionImageIds, setFailedOptionImageIds] = useState<Record<string, boolean>>({});
  const speechTimeoutRef = useRef<number | null>(null);

  const safeMediaUrl = useMemo(() => sanitizeMediaUrl(question.mediaUrl), [question.mediaUrl]);
  const safeAudioUrl = useMemo(() => sanitizeMediaUrl(question.audioUrl), [question.audioUrl]);

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current !== null) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      audioEngine.stopSpeech();
    };
  }, []);

  const isDisabled = lockedAfterAnswer && answerValue.trim() !== '';

  const typeLabelMap: Record<string, string> = {
    multiple_choice: 'Pilihan Ganda',
    true_false: 'Benar atau Salah',
    short_answer: 'Isian Singkat',
    matching: 'Menjodohkan',
    ordering: 'Mengurutkan',
    drag_drop: 'Kelompokkan (Drag & Drop)',
    image_choice: 'Pilihan Gambar',
    audio: 'Tantangan Audio',
    illustrated: 'Soal Bergambar',
    multiple_select: 'Pilih Lebih dari Satu',
    essay: 'Uraian',
  };

  function handleSpeak(text: string) {
    if (speechTimeoutRef.current !== null) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    if (isSpeaking) {
      audioEngine.stopSpeech();
      setIsSpeaking(false);
      return;
    }
    const lang = question.subjectId === 'bahasa_inggris' ? 'en-US' : 'id-ID';
    setIsSpeaking(true);
    audioEngine.speak(text, lang);
    speechTimeoutRef.current = window.setTimeout(
      () => setIsSpeaking(false),
      Math.min(8000, Math.max(2500, text.length * 65))
    );
  }

  // --- Matching state ---
  const matchingMap = useMemo(
    () => safeParse<Record<string, string>>(answerValue, {}),
    [answerValue]
  );

  function handleSelectMatchLeft(item: string) {
    if (isDisabled) return;
    audioEngine.playSelect();
    setSelectedLeft(selectedLeft === item ? null : item);
  }

  function handleSelectMatchRight(rightItem: string) {
    if (isDisabled || !selectedLeft) return;
    audioEngine.playSelect();
    const next = { ...matchingMap, [selectedLeft]: rightItem };
    onChangeAnswer(JSON.stringify(next));
    setSelectedLeft(null);
  }

  function handleClearMatch(leftItem: string) {
    if (isDisabled) return;
    const next = { ...matchingMap };
    delete next[leftItem];
    onChangeAnswer(Object.keys(next).length > 0 ? JSON.stringify(next) : '');
  }

  // --- Ordering state ---
  const currentOrder = useMemo(() => {
    const parsed = safeParse<string[]>(answerValue, []);
    if (parsed.length > 0) return parsed;
    return question.orderingItems || [];
  }, [answerValue, question.orderingItems]);

  function moveOrderItem(index: number, direction: -1 | 1) {
    if (isDisabled) return;
    const next = [...currentOrder];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    audioEngine.playSelect();
    onChangeAnswer(JSON.stringify(next));
  }

  // --- Drag & Drop state ---
  const dragMap = useMemo(
    () => safeParse<Record<string, string>>(answerValue, {}),
    [answerValue]
  );

  function assignDragItem(itemId: string, targetId: string) {
    if (isDisabled) return;
    audioEngine.playSelect();
    const next = { ...dragMap, [itemId]: targetId };
    onChangeAnswer(JSON.stringify(next));
    setActiveDragItem(null);
  }

  function unassignDragItem(itemId: string) {
    if (isDisabled) return;
    const next = { ...dragMap };
    delete next[itemId];
    onChangeAnswer(Object.keys(next).length > 0 ? JSON.stringify(next) : '');
  }

  // --- Multi-select state ---
  const selectedMulti = useMemo(
    () => safeParse<string[]>(answerValue, []),
    [answerValue]
  );

  function toggleMultiOption(opt: string) {
    if (isDisabled) return;
    audioEngine.playSelect();
    const exists = selectedMulti.includes(opt);
    const next = exists
      ? selectedMulti.filter((item) => item !== opt)
      : [...selectedMulti, opt];
    onChangeAnswer(next.length > 0 ? JSON.stringify(next) : '');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-8 space-y-6">
      {/* Header Metadata (Unboxed Clean Typography) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="text-slate-900 font-bold tabular-nums">
            Soal {questionNumber} dari {totalQuestions}
          </span>
          <span aria-hidden="true">·</span>
          <span>{typeLabelMap[question.type] || question.type}</span>
          {question.topic && (
            <>
              <span aria-hidden="true">·</span>
              <span>{question.topic}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {audioEnabled && (
            <button
              type="button"
              onClick={() => handleSpeak(question.prompt)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              {isSpeaking ? <Square className="w-3.5 h-3.5 text-rose-600" /> : <Volume2 className="w-3.5 h-3.5 text-teal-700" />}
              {isSpeaking ? 'Hentikan Suara' : 'Bacakan Soal'}
            </button>
          )}
          {mode === 'latihan' && question.practiceHint && (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-800 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Petunjuk
            </button>
          )}
        </div>
      </div>

      {/* Practice Hint Box (Latihan Mode only) */}
      {mode === 'latihan' && showHint && question.practiceHint && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-900">
          <Lightbulb className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p>{question.practiceHint}</p>
        </div>
      )}

      {/* Illustration Media */}
      {safeMediaUrl && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 max-w-xl mx-auto">
          {mediaLoadError ? (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <ImageOff className="w-6 h-6 text-slate-400" />
              <span>Ilustrasi gambar tidak dapat dimuat.</span>
            </div>
          ) : (
            <img
              src={safeMediaUrl}
              alt="Ilustrasi soal"
              referrerPolicy="no-referrer"
              onError={() => setMediaLoadError(true)}
              className="w-full max-h-72 object-contain mx-auto"
            />
          )}
        </div>
      )}

      {/* Audio Question Player */}
      {question.type === 'audio' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Pemutar Audio Tantangan</p>
              <p className="text-xs text-slate-600">Klik tombol Putar untuk mendengarkan petunjuk suara.</p>
            </div>
          </div>

          {safeAudioUrl ? (
            <audio controls src={safeAudioUrl} className="max-w-xs" />
          ) : (
            <button
              type="button"
              onClick={() => handleSpeak(question.audioText || question.prompt)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Putar Suara
            </button>
          )}
        </div>
      )}

      {/* Question Prompt */}
      <div className="text-lg sm:text-xl font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
        {question.prompt}
      </div>

      {/* Answer Input by Question Type */}
      {(question.type === 'multiple_choice' ||
        question.type === 'illustrated' ||
        question.type === 'audio') && (
        <div className="grid grid-cols-1 gap-3">
          {(question.options || []).map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const selected = answerValue === opt;
            return (
              <button
                key={`${opt}-${idx}`}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  audioEngine.playSelect();
                  onChangeAnswer(opt);
                }}
                className={`w-full min-h-[56px] text-left px-4 py-3.5 rounded-2xl border-2 transition-all flex items-center gap-4 cursor-pointer disabled:cursor-not-allowed ${
                  selected
                    ? 'border-teal-600 bg-teal-50 text-slate-900'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-xl font-display font-bold text-sm flex items-center justify-center shrink-0 ${
                    selected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {letter}
                </span>
                <span className="text-base font-medium flex-1">{opt}</span>
                {selected && <Check className="w-5 h-5 text-teal-700 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'true_false' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {['Benar', 'Salah'].map((choice) => {
            const selected = answerValue === choice;
            return (
              <button
                key={choice}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  audioEngine.playSelect();
                  onChangeAnswer(choice);
                }}
                className={`min-h-[72px] p-5 rounded-2xl border-2 font-display text-lg font-bold transition-all flex items-center justify-center gap-3 cursor-pointer ${
                  selected
                    ? choice === 'Benar'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                {choice === 'Benar' ? (
                  <Check className="w-6 h-6 text-emerald-600" />
                ) : (
                  <X className="w-6 h-6 text-amber-600" />
                )}
                {choice}
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'short_answer' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500">
            Ketik jawaban singkatmu di kotak bawah ini:
          </label>
          <input
            type="text"
            value={answerValue}
            disabled={isDisabled}
            onChange={(e) => onChangeAnswer(e.target.value)}
            placeholder="Ketik jawaban di sini..."
            className="w-full px-5 py-4 rounded-2xl border-2 border-slate-300 focus:border-teal-600 focus:outline-none text-lg font-semibold text-slate-900 bg-slate-50 focus:bg-white"
          />
        </div>
      )}

      {question.type === 'essay' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500">
            Tuliskan jawabanmu dengan kalimat yang rapi dan jelas:
          </label>
          <textarea
            rows={4}
            value={answerValue}
            disabled={isDisabled}
            onChange={(e) => onChangeAnswer(e.target.value)}
            placeholder="Tulis jawaban uraianmu di sini..."
            className="w-full px-5 py-4 rounded-2xl border-2 border-slate-300 focus:border-teal-600 focus:outline-none text-base text-slate-900 bg-slate-50 focus:bg-white leading-relaxed"
          />
        </div>
      )}

      {question.type === 'multiple_select' && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-500">
            Kamu dapat memilih lebih dari satu jawaban yang benar:
          </p>
          <div className="grid grid-cols-1 gap-3">
            {(question.options || []).map((opt, idx) => {
              const checked = selectedMulti.includes(opt);
              return (
                <button
                  key={`${opt}-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => toggleMultiOption(opt)}
                  className={`w-full min-h-[54px] text-left px-4 py-3.5 rounded-2xl border-2 transition-all flex items-center gap-3.5 cursor-pointer ${
                    checked
                      ? 'border-teal-600 bg-teal-50 text-slate-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      checked
                        ? 'bg-teal-700 border-teal-700 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="w-4 h-4" />}
                  </div>
                  <span className="text-base font-medium">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {question.type === 'image_choice' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(question.imageOptions || []).map((imgOpt) => {
            const selected = answerValue === imgOpt.id;
            const safeOptImg = sanitizeMediaUrl(imgOpt.imageUrl);
            const showFallback = !safeOptImg || failedOptionImageIds[imgOpt.id];
            return (
              <button
                key={imgOpt.id}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  audioEngine.playSelect();
                  onChangeAnswer(imgOpt.id);
                }}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 cursor-pointer ${
                  selected
                    ? 'border-teal-600 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {!showFallback ? (
                  <img
                    src={safeOptImg}
                    alt={imgOpt.label}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedOptionImageIds((prev) => ({ ...prev, [imgOpt.id]: true }))
                    }
                    className="w-24 h-20 object-contain rounded-lg"
                  />
                ) : (
                  <ShapeMotifSvg motif={imgOpt.motif} label={imgOpt.label} />
                )}
                <span className="font-semibold text-sm text-slate-900">{imgOpt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'matching' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500">
            Ketuk satu kartu di kiri, lalu ketuk pasangannya di kanan untuk menghubungkan:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2.5">
              {(question.matchLeft || []).map((leftItem) => {
                const isSelected = selectedLeft === leftItem;
                const pairedRight = matchingMap[leftItem];
                return (
                  <div
                    key={leftItem}
                    className={`p-3.5 rounded-2xl border-2 flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50'
                        : pairedRight
                          ? 'border-teal-500 bg-teal-50/60'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSelectMatchLeft(leftItem)}
                      className="text-left flex-1 font-semibold text-sm text-slate-900 cursor-pointer"
                    >
                      {leftItem}
                      {pairedRight && (
                        <span className="block text-xs font-normal text-teal-800 mt-1">
                          → {pairedRight}
                        </span>
                      )}
                    </button>
                    {pairedRight && !isDisabled && (
                      <button
                        type="button"
                        onClick={() => handleClearMatch(leftItem)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Lepas pasangan"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2.5">
              {(question.matchRight || []).map((rightItem) => {
                const isUsed = Object.values(matchingMap).includes(rightItem);
                return (
                  <button
                    key={rightItem}
                    type="button"
                    disabled={isDisabled || !selectedLeft}
                    onClick={() => handleSelectMatchRight(rightItem)}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                      selectedLeft
                        ? 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer'
                        : isUsed
                          ? 'border-teal-300 bg-teal-50/40 text-slate-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span>{rightItem}</span>
                    <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {question.type === 'ordering' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500">
            Gunakan tombol panah atas/bawah untuk menyusun urutan yang tepat:
          </p>
          <div className="space-y-2.5">
            {currentOrder.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 font-display font-bold text-sm flex items-center justify-center text-slate-700 tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-base text-slate-900">{item}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isDisabled || idx === 0}
                    onClick={() => moveOrderItem(idx, -1)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    aria-label="Naikkan urutan"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isDisabled || idx === currentOrder.length - 1}
                    onClick={() => moveOrderItem(idx, 1)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    aria-label="Turunkan urutan"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {answerValue.trim() === '' && currentOrder.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeAnswer(JSON.stringify(currentOrder))}
              className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
            >
              Simpan urutan ini sebagai jawabanku
            </button>
          )}
        </div>
      )}

      {question.type === 'drag_drop' && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-500">
            Seret kartu ke kotak kelompok, atau ketuk kartu lalu ketuk kotak tujuan:
          </p>

          {/* Unassigned Cards */}
          <div className="flex flex-wrap gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 min-h-[60px]">
            {(question.dragItems || [])
              .filter((item) => !dragMap[item.id])
              .map((item) => {
                const isSelected = activeDragItem === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    draggable={!isDisabled}
                    onDragStart={() => setActiveDragItem(item.id)}
                    onClick={() => {
                      if (!isDisabled) {
                        audioEngine.playSelect();
                        setActiveDragItem(isSelected ? null : item.id);
                      }
                    }}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-sm border-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-100 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-teal-500'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            {(question.dragItems || []).every((item) => Boolean(dragMap[item.id])) && (
              <span className="text-xs text-slate-500 self-center">
                Semua kartu sudah dimasukkan ke dalam kelompok!
              </span>
            )}
          </div>

          {/* Target Buckets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(question.dragTargets || []).map((target) => {
              const itemsInTarget = (question.dragItems || []).filter(
                (i) => dragMap[i.id] === target.id
              );
              return (
                <div
                  key={target.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (activeDragItem) assignDragItem(activeDragItem, target.id);
                  }}
                  onClick={() => {
                    if (activeDragItem) assignDragItem(activeDragItem, target.id);
                  }}
                  className={`p-4 rounded-2xl border-2 min-h-[130px] transition-colors ${
                    activeDragItem
                      ? 'border-teal-500 bg-teal-50/50 cursor-pointer'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="font-display font-bold text-sm text-slate-900 mb-3">
                    {target.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {itemsInTarget.map((it) => (
                      <span
                        key={it.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-100 text-teal-900 text-xs font-semibold"
                      >
                        {it.label}
                        {!isDisabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              unassignDragItem(it.id);
                            }}
                            className="hover:text-rose-700 cursor-pointer"
                            aria-label="Keluarkan"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Latihan Mode Feedback Toggle (NEVER rendered in PSAS mode) */}
      {mode === 'latihan' && answerValue.trim() !== '' && (
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <button
            type="button"
            onClick={() => setShowPracticeCheck((v) => !v)}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
          >
            {showPracticeCheck ? 'Tutup Pembahasan' : 'Lihat Pembahasan Latihan'}
          </button>

          {showPracticeCheck && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 space-y-1">
              {question.practiceKey && (
                <p className="font-bold">Jawaban Acuan: {question.practiceKey}</p>
              )}
              {question.practiceExplanation && <p>{question.practiceExplanation}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
