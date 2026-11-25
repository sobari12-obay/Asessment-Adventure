import React from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { ImportBatchRecord } from '../../../types/psas';

interface ImportProgressProps {
  batch: ImportBatchRecord | null;
  localStageMessage?: string;
  isBusy: boolean;
  onRetryExtract: () => void;
  onBackToUpload: () => void;
  onCancelBatch: () => void;
}

export const ImportProgress: React.FC<ImportProgressProps> = ({
  batch,
  localStageMessage,
  isBusy,
  onRetryExtract,
  onBackToUpload,
  onCancelBatch,
}) => {
  const isFailed = batch?.status === 'failed';
  const progress = batch?.progressPercent ?? (isBusy ? 45 : 15);
  const activeStage = batch?.progressStage || 'validasi_berkas';
  const message = localStageMessage || batch?.progressMessage || 'Memproses dokumen...';

  const stages = [
    { key: 'validasi_berkas', label: 'Validasi & Unggah Berkas' },
    { key: 'ekstraksi_konten', label: 'Ekstraksi Teks, Tabel & Media' },
    { key: 'analisis_ai', label: 'Analisis Gemini AI & Deteksi Duplikat' },
    { key: 'siap_review', label: 'Siap Tinjau Guru' },
  ];

  const currentIdx = Math.max(
    0,
    stages.findIndex((s) => s.key === activeStage)
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isFailed
                ? 'bg-rose-100 text-rose-700'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            {isFailed ? (
              <XCircle className="w-6 h-6" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin" />
            )}
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900">
              {isFailed ? 'Proses Ekstraksi Memerlukan Perhatian' : 'Memproses Soal Anda'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">{message}</p>
          </div>
        </div>
        <span className="text-sm font-bold text-teal-800 tabular-nums">{progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isFailed ? 'bg-rose-500' : 'bg-teal-600'
          }`}
          style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
        />
      </div>

      {/* Stages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stages.map((st, idx) => {
          const done = !isFailed && idx < currentIdx;
          const current = !isFailed && idx === currentIdx;
          return (
            <div
              key={st.key}
              className={`rounded-xl border p-3 flex items-center gap-2.5 text-xs ${
                done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 font-semibold'
                  : current
                    ? 'border-teal-300 bg-teal-50 text-teal-950 font-bold'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : current ? (
                <Loader2 className="w-4 h-4 text-teal-700 animate-spin shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-slate-300 inline-block shrink-0" />
              )}
              <span>{st.label}</span>
            </div>
          );
        })}
      </div>

      {/* Uploaded file list */}
      {batch && batch.files.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold text-slate-700">Berkas Dalam Sesi Ini:</p>
          <div className="flex flex-wrap gap-2">
            {batch.files.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                {f.sanitizedName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error detail & recovery actions */}
      {isFailed && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-rose-900">
            <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Ekstraksi Gagal ({batch?.errorCode || 'ERROR'})</p>
              <p className="text-xs leading-relaxed">
                {batch?.errorMessage || 'Terjadi kendala saat mengekstrak berkas.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetryExtract}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Coba Ekstrak Ulang
            </button>
            <button
              type="button"
              onClick={onBackToUpload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              Ganti / Unggah Berkas Lain
            </button>
          </div>
        </div>
      )}

      {!isFailed && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancelBatch}
            className="text-xs font-semibold text-slate-500 hover:text-rose-700 cursor-pointer"
          >
            Batalkan Proses
          </button>
        </div>
      )}
    </div>
  );
};
