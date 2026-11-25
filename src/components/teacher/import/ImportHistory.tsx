import React from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getWorldConfig } from '../../../data/worlds';
import type { ImportBatchStatus, ImportHistorySummary } from '../../../types/psas';

interface ImportHistoryProps {
  items: ImportHistorySummary[];
  loading: boolean;
  onRefresh: () => void;
  onResumeBatch: (batchId: string) => void;
  onCancelBatch: (batchId: string) => void;
}

const STATUS_LABELS: Record<ImportBatchStatus, { label: string; tone: string }> = {
  uploaded: { label: 'Menunggu Ekstraksi', tone: 'text-slate-700' },
  processing: { label: 'Sedang Diproses', tone: 'text-teal-700' },
  review_required: { label: 'Menunggu Review Guru', tone: 'text-amber-700' },
  completed: { label: 'Selesai Disimpan', tone: 'text-emerald-700' },
  failed: { label: 'Gagal Ekstraksi', tone: 'text-rose-700' },
  cancelled: { label: 'Dibatalkan', tone: 'text-slate-500' },
};

export const ImportHistory: React.FC<ImportHistoryProps> = ({
  items,
  loading,
  onRefresh,
  onResumeBatch,
  onCancelBatch,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-base text-slate-900">Riwayat Impor Soal</h3>
          <p className="text-xs text-slate-500">
            Lanjutkan draft hasil ekstraksi atau pantau sesi impor yang sudah selesai.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Belum ada riwayat sesi impor soal.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {items.map((item) => {
            const world = getWorldConfig(item.defaultSubjectId);
            const statusMeta = STATUS_LABELS[item.status] || {
              label: item.status,
              tone: 'text-slate-600',
            };
            const canResume =
              item.status === 'review_required' ||
              item.status === 'uploaded' ||
              item.status === 'failed';
            const canCancel = item.status !== 'completed' && item.status !== 'cancelled';

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    {item.sourceMode === 'camera' ? (
                      <Camera className="w-5 h-5 text-teal-700" />
                    ) : item.sourceMode === 'photo' ? (
                      <ImageIcon className="w-5 h-5 text-sky-700" />
                    ) : (
                      <FileText className="w-5 h-5 text-teal-700" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900">
                        {item.fileNames.length > 0
                          ? item.fileNames.join(', ')
                          : `Batch ${item.id}`}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={`font-bold ${statusMeta.tone}`}>
                        {item.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {statusMeta.label}
                          </span>
                        ) : item.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> {statusMeta.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {statusMeta.label}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {world.subjectName} · Kelas {item.defaultGrade} · Semester{' '}
                      {item.defaultSemester} · Topik: {item.defaultTopic || 'Umum'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Terbaca: {item.stats.totalExtracted} · Tersimpan:{' '}
                      {item.stats.savedCount} · Dibuat:{' '}
                      {new Date(item.createdAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canResume && (
                    <button
                      type="button"
                      onClick={() => onResumeBatch(item.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Buka / Lanjutkan
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => onCancelBatch(item.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 hover:border-rose-200 text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Batalkan
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
