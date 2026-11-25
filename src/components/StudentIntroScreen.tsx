import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Compass,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { getExplorerCharacter } from '../data/characters';
import { DEFAULT_INTRO_STORY, getWorldConfig } from '../data/worlds';
import type { StudentExamIntroInfo } from '../services/apiClient';
import { DEFAULT_SCHOOL_NAME, type ExplorerCharacterId, type PublicAssessment } from '../types/psas';

interface StudentIntroScreenProps {
  assessment: PublicAssessment;
  examInfo?: StudentExamIntroInfo | null;
  studentName: string;
  gradeClass: string;
  characterId?: ExplorerCharacterId;
  isStarting?: boolean;
  startError?: string;
  onStartAdventure: () => void;
  onBack: () => void;
}

function formatExamTypeLabel(examType?: string, mode?: string): string {
  const val = examType || mode || 'psas';
  if (val === 'latihan') return 'Latihan Mandiri';
  if (val === 'simulasi') return 'Simulasi Ujian';
  if (val === 'ulangan_harian') return 'Ulangan Harian';
  if (val === 'sumatif') return 'Asesmen Sumatif';
  return 'PSAS Resmi';
}

export const StudentIntroScreen: React.FC<StudentIntroScreenProps> = ({
  assessment,
  examInfo,
  studentName,
  gradeClass,
  characterId = 'boy',
  isStarting = false,
  startError = '',
  onStartAdventure,
  onBack,
}) => {
  const world = getWorldConfig(assessment.subjectId);
  const character = getExplorerCharacter(characterId);
  const storyText = examInfo?.introStory || assessment.introStory || DEFAULT_INTRO_STORY;

  const durationMinutes = examInfo?.durationMinutes ?? assessment.durationMinutes ?? 30;
  const questionCount = examInfo?.questionCount ?? assessment.totalQuestions ?? 0;
  const maxAttempts = examInfo?.maxAttempts ?? assessment.maxAttempts ?? 1;
  const attemptNumber = examInfo?.attemptNumber ?? 1;
  const remainingAttempts = examInfo?.remainingAttempts ?? maxAttempts;
  const hasInProgress = Boolean(examInfo?.hasInProgressSession);
  const modeLabel = formatExamTypeLabel(
    examInfo?.examType || assessment.examType,
    examInfo?.mode || assessment.mode
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center p-4 sm:p-6">
      <div className="max-w-4xl mx-auto w-full bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="relative h-48 sm:h-60">
          <img
            src="/src/assets/images/world_banner_adventure_1795448997744.jpg"
            alt={`Gerbang ${world.worldName}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/40 to-transparent flex flex-col justify-end p-6 text-white">
            <p className="text-xs font-semibold text-amber-300">
              {DEFAULT_SCHOOL_NAME} · Dunia {world.number} · {world.subjectName} · {modeLabel}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
              {examInfo?.title || assessment.title || world.worldName}
            </h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/95 text-slate-900 text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Peta
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Student Profile Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <img
                src={character.avatarUrl}
                alt={character.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl object-cover border border-slate-200"
              />
              <div>
                <p className="font-bold text-slate-900">{studentName}</p>
                <p className="text-xs text-slate-500">
                  Kelas {gradeClass} · {character.name} · Pemandu: {world.companionName}
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 tabular-nums">
              <span className="flex items-center gap-1">
                <Compass className="w-4 h-4 text-teal-700" />
                {questionCount} Soal
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-teal-700" />
                {durationMinutes} Menit
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Percobaan ke-{attemptNumber} dari {maxAttempts}
              </span>
            </div>
          </div>

          {/* Story Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <p className="text-slate-800 text-base leading-relaxed whitespace-pre-line">
              {storyText}
            </p>
          </div>

          {/* Calm Exam Instructions for Grade 3 SD */}
          <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-display font-bold text-sm sm:text-base text-teal-950">
              Petunjuk Sebelum Memulai Misi
            </h2>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <span>
                  Kerjakan setiap soal dengan tenang, jujur, dan teliti. Kamu bisa melewati dan
                  menandai soal yang ingin diperiksa ulang.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <span>
                  Setiap jawabanmu langsung tersimpan otomatis. Jika koneksi sempat terputus,
                  jawaban tetap aman di perangkat.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Waktu pengerjaan ({durationMinutes} menit) baru mulai berjalan</strong>{' '}
                  setelah kamu menekan tombol{' '}
                  <strong>{hasInProgress ? 'LANJUTKAN MISI' : 'MULAI MISI'}</strong>.
                </span>
              </li>
              {remainingAttempts <= 0 && !hasInProgress && (
                <li className="flex items-start gap-2 text-rose-700 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Batas kesempatan pengerjaan untuk asesmen ini sudah tercapai ({maxAttempts}x).
                  </span>
                </li>
              )}
            </ul>
          </div>

          {startError && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
              <span>{startError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <p className="text-xs text-slate-500">
              {(examInfo?.mode || assessment.mode) === 'latihan'
                ? 'Mode Latihan: kamu bisa melihat petunjuk belajar dan tidak memengaruhi nilai rapor.'
                : (examInfo?.mode || assessment.mode) === 'simulasi'
                  ? 'Mode Simulasi: untuk berlatih membiasakan diri sebelum PSAS resmi.'
                  : 'Mode Resmi: hasil akan diperiksa guru sesuai ketentuan sekolah.'}
            </p>
            <button
              type="button"
              disabled={isStarting || (remainingAttempts <= 0 && !hasInProgress)}
              onClick={onStartAdventure}
              className={`w-full sm:w-auto px-8 py-4 rounded-2xl ${world.primaryColor} text-white font-display font-bold text-lg hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0`}
            >
              {hasInProgress ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              {isStarting
                ? 'Menyiapkan Misi...'
                : hasInProgress
                  ? 'LANJUTKAN MISI'
                  : 'MULAI MISI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

