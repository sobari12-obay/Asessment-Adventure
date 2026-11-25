import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { WORLDS } from '../../../data/worlds';
import type { ImportSourceMode, SubjectId } from '../../../types/psas';

interface FileUploadAreaProps {
  sourceMode: ImportSourceMode;
  onChangeSourceMode: (mode: ImportSourceMode) => void;
  defaultSubjectId: SubjectId;
  onChangeSubjectId: (subjectId: SubjectId) => void;
  defaultGrade: string;
  onChangeGrade: (grade: string) => void;
  defaultSemester: 'Ganjil' | 'Genap';
  onChangeSemester: (sem: 'Ganjil' | 'Genap') => void;
  defaultTopic: string;
  onChangeTopic: (topic: string) => void;
  selectedFiles: File[];
  onChangeFiles: (files: File[]) => void;
  geminiConfigured: boolean;
  maxFileSizeBytes: number;
  maxFilesPerBatch: number;
  isBusy: boolean;
  errorMessage: string;
  onStartUploadAndExtract: () => void;
}

const DOC_ACCEPT =
  '.docx,.pdf,.xlsx,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

const ALLOWED_EXT_LIST = ['.docx', '.pdf', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  sourceMode,
  onChangeSourceMode,
  defaultSubjectId,
  onChangeSubjectId,
  defaultGrade,
  onChangeGrade,
  defaultSemester,
  onChangeSemester,
  defaultTopic,
  onChangeTopic,
  selectedFiles,
  onChangeFiles,
  geminiConfigured,
  maxFileSizeBytes,
  maxFilesPerBatch,
  isBusy,
  errorMessage,
  onStartUploadAndExtract,
}) => {
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [localValidationError, setLocalValidationError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [capturedPreviewUrl]);

  const validateAndAddFiles = (incoming: FileList | File[]) => {
    setLocalValidationError('');
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const next = [...selectedFiles];
    const errors: string[] = [];

    for (const file of list) {
      const ext = getFileExt(file.name);
      if (!ALLOWED_EXT_LIST.includes(ext)) {
        errors.push(`"${file.name}": format tidak didukung (${ext || 'tanpa ekstensi'}).`);
        continue;
      }
      if (file.size <= 0) {
        errors.push(`"${file.name}": file kosong.`);
        continue;
      }
      if (file.size > maxFileSizeBytes) {
        errors.push(
          `"${file.name}": ukuran ${formatBytes(file.size)} melebihi batas ${(
            maxFileSizeBytes /
            (1024 * 1024)
          ).toFixed(0)} MB.`
        );
        continue;
      }
      if (next.length >= maxFilesPerBatch) {
        errors.push(`Maksimal ${maxFilesPerBatch} file dalam satu sesi impor.`);
        break;
      }
      const duplicateSameName = next.some(
        (f) => f.name === file.name && f.size === file.size
      );
      if (!duplicateSameName) {
        next.push(file);
      }
    }

    if (errors.length > 0) {
      setLocalValidationError(errors.join(' '));
    }
    onChangeFiles(next);
  };

  const handleOpenLiveCamera = async () => {
    setCameraError('');
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
      setCapturedFile(null);
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Browser ini tidak mendukung akses kamera langsung. Gunakan tombol "Pilih / Ambil Foto Perangkat" di bawah.'
      );
      return;
    }
    setCameraOpen(true);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Izin kamera ditolak atau tidak tersedia.';
      setCameraError(
        `Kamera tidak dapat diakses (${msg}). Anda tetap dapat memakai tombol unggah foto perangkat.`
      );
      setCameraOpen(false);
    } finally {
      setCameraStarting(false);
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Video kamera belum siap. Tunggu sebentar lalu coba potret lagi.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fileName = `kamera_soal_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        const preview = URL.createObjectURL(blob);
        setCapturedFile(file);
        setCapturedPreviewUrl(preview);
        stopCameraStream();
      },
      'image/jpeg',
      0.92
    );
  };

  const handleConfirmCapturedPhoto = () => {
    if (!capturedFile) return;
    validateAndAddFiles([capturedFile]);
    setCameraOpen(false);
    setCapturedFile(null);
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
  };

  const hasNonSpreadsheetFiles = selectedFiles.some((f) => {
    const ext = getFileExt(f.name);
    return ext !== '.xlsx' && ext !== '.csv';
  });

  return (
    <div className="space-y-6">
      {!geminiConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-950">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">GEMINI_API_KEY Server Belum Terpasang</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Impor file <strong>Excel (.xlsx)</strong> dan <strong>CSV (.csv)</strong> berstruktur tabel
              tetap berfungsi penuh tanpa kunci AI. Untuk mengekstrak dokumen Word (.docx), PDF,
              atau foto soal secara otomatis, administrator perlu menambahkan{' '}
              <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">GEMINI_API_KEY</code> di
              environment server.
            </p>
          </div>
        </div>
      )}

      {/* Tahap A: Pilih Sumber Impor */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">1. Pilih Sumber Soal</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              id: 'document' as ImportSourceMode,
              title: 'Unggah Dokumen',
              desc: 'Microsoft Word (.docx), PDF (teks / scan), Excel (.xlsx), atau CSV',
              icon: FileText,
            },
            {
              id: 'photo' as ImportSourceMode,
              title: 'Unggah Foto Soal',
              desc: 'Foto lembar soal cetak/tulis tangan (.jpg, .jpeg, .png, .webp)',
              icon: ImageIcon,
            },
            {
              id: 'camera' as ImportSourceMode,
              title: 'Ambil Foto Kamera',
              desc: 'Potret langsung lembar soal melalui kamera laptop atau HP',
              icon: Camera,
            },
          ].map((mode) => {
            const Icon = mode.icon;
            const active = sourceMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                disabled={isBusy}
                onClick={() => {
                  onChangeSourceMode(mode.id);
                  if (mode.id !== 'camera') {
                    stopCameraStream();
                    setCameraOpen(false);
                  }
                }}
                className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  active
                    ? 'border-teal-600 bg-teal-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  {active && <CheckCircle2 className="w-5 h-5 text-teal-700" />}
                </div>
                <p className="font-display font-bold text-sm text-slate-900">{mode.title}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{mode.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Default Target Metadata */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          2. Target Awal Bank Soal (Dapat Diubah Per Butir Saat Review)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Mata Pelajaran
            </label>
            <select
              value={defaultSubjectId}
              disabled={isBusy}
              onChange={(e) => onChangeSubjectId(e.target.value as SubjectId)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900"
            >
              {WORLDS.map((w) => (
                <option key={w.id} value={w.id}>
                  Dunia {w.number}: {w.subjectName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Kelas</label>
            <select
              value={defaultGrade}
              disabled={isBusy}
              onChange={(e) => onChangeGrade(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900"
            >
              <option value="3">Kelas 3 SD</option>
              <option value="1">Kelas 1 SD</option>
              <option value="2">Kelas 2 SD</option>
              <option value="4">Kelas 4 SD</option>
              <option value="5">Kelas 5 SD</option>
              <option value="6">Kelas 6 SD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Semester</label>
            <select
              value={defaultSemester}
              disabled={isBusy}
              onChange={(e) =>
                onChangeSemester(e.target.value === 'Genap' ? 'Genap' : 'Ganjil')
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900"
            >
              <option value="Ganjil">Semester Ganjil</option>
              <option value="Genap">Semester Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Topik / Bab Default
            </label>
            <input
              type="text"
              value={defaultTopic}
              disabled={isBusy}
              onChange={(e) => onChangeTopic(e.target.value)}
              placeholder="Contoh: Pecahan Sederhana"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Tahap B: Dropzone or Camera */}
      {sourceMode === 'camera' ? (
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display font-bold text-base">Kamera Pengambil Soal</h4>
              <p className="text-xs text-slate-300">
                Pastikan pencahayaan cukup dan teks soal terlihat jelas di dalam bingkai.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!cameraOpen && (
                <button
                  type="button"
                  onClick={() => void handleOpenLiveCamera()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-bold text-white cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Buka Kamera Live
                </button>
              )}
              <button
                type="button"
                onClick={() => mobileCameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                Pilih / Kamera Perangkat
              </button>
              <input
                ref={mobileCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) validateAndAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {cameraError && (
            <div className="bg-amber-950/70 border border-amber-700 rounded-xl px-4 py-3 text-xs text-amber-200">
              {cameraError}
            </div>
          )}

          {cameraOpen && !capturedPreviewUrl && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black border border-slate-700 max-h-96 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-96 object-contain"
                />
                {cameraStarting && (
                  <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center text-xs">
                    Menghubungkan ke kamera...
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Ambil Foto Soal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setCameraOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Tutup Kamera
                </button>
              </div>
            </div>
          )}

          {capturedPreviewUrl && (
            <div className="space-y-3">
              <img
                src={capturedPreviewUrl}
                alt="Hasil tangkapan kamera"
                className="w-full max-h-96 object-contain rounded-xl border border-slate-700 bg-black"
              />
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirmCapturedPhoto}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Gunakan Foto Ini
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenLiveCamera()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Foto Ulang
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              validateAndAddFiles(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-teal-600 bg-teal-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-teal-400'
          }`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mb-3">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h4 className="font-display font-bold text-base text-slate-900">
            {sourceMode === 'photo'
              ? 'Tarik & Letakkan Foto Soal di Sini'
              : 'Tarik & Letakkan Dokumen Soal di Sini'}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
            {sourceMode === 'photo'
              ? `Mendukung file gambar JPG, JPEG, PNG, dan WEBP (maksimal ${maxFilesPerBatch} file, ${Math.round(
                  maxFileSizeBytes / (1024 * 1024)
                )} MB/file).`
              : `Mendukung Microsoft Word (.docx), PDF digital maupun hasil scan (.pdf), Excel (.xlsx), dan CSV (.csv). Maksimal ${maxFilesPerBatch} file sekaligus.`}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                sourceMode === 'photo'
                  ? photoInputRef.current?.click()
                  : docInputRef.current?.click()
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              {sourceMode === 'photo' ? 'Pilih File Foto' : 'Pilih File Dokumen'}
            </button>
          </div>

          <input
            ref={docInputRef}
            type="file"
            accept={DOC_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) validateAndAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) validateAndAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {(localValidationError || errorMessage) && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
          <span>{localValidationError || errorMessage}</span>
        </div>
      )}

      {/* Selected file queue */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Berkas Siap Diproses ({selectedFiles.length}/{maxFilesPerBatch})
            </h4>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onChangeFiles([])}
              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              Kosongkan Daftar
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {selectedFiles.map((file, idx) => {
              const ext = getFileExt(file.name);
              const isSheet = ext === '.xlsx' || ext === '.csv';
              const isImg = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
              return (
                <div
                  key={`${file.name}_${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      {isSheet ? (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                      ) : isImg ? (
                        <ImageIcon className="w-4 h-4 text-sky-700" />
                      ) : (
                        <FileText className="w-4 h-4 text-teal-700" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {ext.toUpperCase()} · {formatBytes(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      onChangeFiles(selectedFiles.filter((_, i) => i !== idx))
                    }
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Hapus berkas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {hasNonSpreadsheetFiles && !geminiConfigured
                ? 'Peringatan: File Word/PDF/Foto memerlukan GEMINI_API_KEY di server.'
                : 'Setelah diekstrak, seluruh soal akan masuk tahap Review Guru sebelum disimpan.'}
            </p>
            <button
              type="button"
              disabled={isBusy || selectedFiles.length === 0}
              onClick={onStartUploadAndExtract}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              {isBusy ? 'Mengunggah & Memproses...' : 'Unggah & Ekstrak Soal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
