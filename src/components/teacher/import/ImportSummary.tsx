import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  PlusCircle,
} from 'lucide-react';
import type { ExtractedQuestionCandidate, ImportBatchRecord } from '../../../types/psas';

interface ImportSummaryProps {
  batch: ImportBatchRecord;
  candidates: ExtractedQuestionCandidate[];
  isSaving: boolean;
  saveError: string;
  savedResult: {
    alreadySaved: boolean;
    savedQuestionIds: string[];
    storageWarnings: string[];
  } | null;
  onBackToReview: () => void;
  onConfirmSave: (options: { selectedIds: string[]; skipDuplicates: boolean }) => void;
  onFinishToBank: () => void;
  onStartNewImport: () => void;
}

export const ImportSummary: React.FC<ImportSummaryProps> = ({
  batch,
  candidates,
  isSaving,
  saveError,
  savedResult,
  onBackToReview,
  onConfirmSave,
  onFinishToBank,
  onStartNewImport,
}) => {
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => c.selectedForSave && c.extractionStatus !== 'failed'),
    [candidates]
  );

  const missingKeySelected = useMemo(
    () => selectedCandidates.filter((c) => !c.correctAnswer || !c.correctAnswer.trim()),
    [selectedCandidates]
  );

  const duplicateSelected = useMemo(
    () => selectedCandidates.filter((c) => Boolean(c.duplicateOfId)),
    [selectedCandidates]
  );

  if (savedResult) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-bold text-xl text-slate-900">
              Impor ke Bank Soal Selesai
            </h3>
            <p className="text-sm text-slate-600">
              Sebanyak <strong>{savedResult.savedQuestionIds.length}</strong> butir soal telah
              tersimpan resmi ke Bank Soal PSAS Adventure (ID Batch:{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                {batch.id}
              </code>
              ).
            </p>
            {savedResult.alreadySaved && (
              <p className="text-xs text-teal-800 font-semibold">
                Batch ini sebelumnya sudah tersimpan — sistem mencegah penyimpanan ganda secara otomatis.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-800">Berhasil Masuk Bank Soal</p>
            <p className="font-display text-2xl font-bold text-emerald-950 mt-1">
              {savedResult.savedQuestionIds.length}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600">Dilewati (Duplikat/Tidak Dipilih)</p>
            <p className="font-display text-2xl font-bold text-slate-900 mt-1">
              {Math.max(0, candidates.length - savedResult.savedQuestionIds.length)}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600">Berkas Sumber</p>
            <p className="font-display text-2xl font-bold text-slate-900 mt-1">
              {batch.files.length}
            </p>
          </div>
        </div>

        {savedResult.storageWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Catatan Penyimpanan Gambar Lampiran
            </p>
            {savedResult.storageWarnings.map((w, idx) => (
              <p key={idx}>• {w}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onStartNewImport}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Impor Dokumen Lain
          </button>
          <button
            type="button"
            onClick={onFinishToBank}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <Database className="w-4 h-4" />
            Buka Bank Soal Sekarang
          </button>
        </div>
      </div>
    );
  }

  const effectiveSaveCount = skipDuplicates
    ? selectedCandidates.filter((c) => !c.duplicateOfId).length
    : selectedCandidates.length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
      <div>
        <h3 className="font-display font-bold text-lg text-slate-900">
          Konfirmasi Simpan ke Bank Soal
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Periksa ringkasan akhir sebelum butir soal disimpan permanen ke Bank Soal dan riwayat
          temporer dibersihkan.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-teal-800">Akan Disimpan</p>
          <p className="font-display text-2xl font-bold text-teal-950 mt-1">
            {effectiveSaveCount} soal
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-600">Tidak Dipilih / Gagal</p>
          <p className="font-display text-2xl font-bold text-slate-900 mt-1">
            {candidates.length - selectedCandidates.length} soal
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-800">Tanpa Kunci Resmi</p>
          <p className="font-display text-2xl font-bold text-amber-950 mt-1">
            {missingKeySelected.length} soal
          </p>
        </div>
      </div>

      {missingKeySelected.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">
              {missingKeySelected.length} butir soal terpilih belum memiliki kunci jawaban resmi
            </p>
            <p className="mt-1">
              Soal tersebut tetap dapat disimpan dengan status{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">BELUM_DIVERIFIKASI</code> agar
              dapat dilengkapi di Bank Soal sebelum dipasang ke asesmen PSAS.
            </p>
          </div>
        </div>
      )}

      {duplicateSelected.length > 0 && (
        <label className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-950 cursor-pointer">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-indigo-700"
          />
          <div>
            <p className="font-bold">
              Lewati otomatis {duplicateSelected.length} soal yang terdeteksi mirip dengan Bank Soal
              yang sudah ada
            </p>
            <p className="text-indigo-800 mt-0.5">
              Hilangkan centang ini hanya jika Anda memang sengaja ingin menyimpan versi baru soal
              tersebut.
            </p>
          </div>
        </label>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 font-medium">
          {saveError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          disabled={isSaving}
          onClick={onBackToReview}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Review
        </button>

        <button
          type="button"
          disabled={isSaving || effectiveSaveCount === 0}
          onClick={() =>
            onConfirmSave({
              selectedIds: selectedCandidates.map((c) => c.id),
              skipDuplicates,
            })
          }
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Menyimpan ke Bank Soal...
            </>
          ) : (
            <>
              <Database className="w-4 h-4" />
              Simpan {effectiveSaveCount} Soal ke Bank Soal
            </>
          )}
        </button>
      </div>
    </div>
  );
};
