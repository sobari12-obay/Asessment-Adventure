import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Compass, KeyRound, Play, School, User } from 'lucide-react';
import { EXPLORER_CHARACTERS } from '../../data/characters';
import { audioEngine } from '../../lib/audioEngine';
import { StudentEntryError } from '../../services/firestoreService';
import {
  DEFAULT_SCHOOL_NAME,
  type AccessibilityPreferences,
  type ClassRoom,
  type ExplorerCharacterId,
} from '../../types/psas';
import {
  AdventureBackdrop,
  AdventureHeader,
  AdventureLoading,
  AdventureNotice,
  BackNavButton,
  CompanionGuide,
  PrimaryButton,
} from '../adventure';

export interface StudentEntrySubmitPayload {
  classId: string;
  gradeClass: string;
  studentName: string;
  examCode: string;
  participantNumber?: string;
  characterId: ExplorerCharacterId;
}

interface StudentLoginPageProps {
  classes: ClassRoom[];
  activeCharacterId: ExplorerCharacterId;
  initialWorldContext?: {
    worldTitle?: string;
    subjectName?: string;
    identityMode?: string;
  } | null;
  initialExamCode?: string;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onChangeCharacter: (id: ExplorerCharacterId) => void;
  onSubmitStudentEntry: (payload: StudentEntrySubmitPayload) => Promise<void>;
  onBack: () => void;
  onBackHome: () => void;
  onOpenGuide: () => void;
  onOpenTeacherPortal: () => void;
}

export const StudentLoginPage: React.FC<StudentLoginPageProps> = ({
  classes,
  activeCharacterId,
  initialWorldContext,
  initialExamCode = '',
  prefs,
  onUpdatePrefs,
  onChangeCharacter,
  onSubmitStudentEntry,
  onBack,
  onBackHome,
  onOpenGuide,
  onOpenTeacherPortal,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [studentName, setStudentName] = useState('');
  const [examCode, setExamCode] = useState(initialExamCode);
  const [participantNumber, setParticipantNumber] = useState('');
  const [requiresParticipantNumber, setRequiresParticipantNumber] = useState(false);
  const [showOptionalParticipant, setShowOptionalParticipant] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    if (classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    let active = true;
    async function checkBackend() {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('Backend unavailable');
        const data = (await res.json()) as { status?: string };
        if (active) {
          setBackendStatus(data?.status === 'ok' ? 'online' : 'offline');
        }
      } catch {
        if (active) setBackendStatus('offline');
      }
    }
    void checkBackend();
    return () => {
      active = false;
    };
  }, []);

  const classOptions = useMemo(() => classes, [classes]);

  const resolvedClassObj = useMemo(
    () => classOptions.find((c) => c.id === selectedClassId) || classOptions[0] || null,
    [classOptions, selectedClassId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEntryError('');

    if (backendStatus !== 'online') {
      setEntryError(
        'Layanan validasi backend belum aktif atau sedang offline. Kamu belum dapat masuk ke ujian sungguhan.'
      );
      return;
    }

    const cleanName = studentName.trim();
    const cleanCode = examCode.trim().toUpperCase();
    const cleanPart = participantNumber.trim();

    if (!resolvedClassObj) {
      setEntryError('Pilih kelasmu terlebih dahulu ya, Penjelajah!');
      return;
    }
    if (cleanName.length < 2) {
      setEntryError('Tuliskan nama lengkapmu minimal 2 huruf terlebih dahulu ya!');
      return;
    }
    if (cleanCode.length < 2) {
      setEntryError('Masukkan kode ujian dari gurumu (contoh: PAI3, MTK3).');
      return;
    }
    if (requiresParticipantNumber && !cleanPart) {
      setEntryError('Masukkan Nomor Peserta kamu sebagai pembeda karena ada nama yang sama di kelas ini!');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitStudentEntry({
        classId: resolvedClassObj.id,
        gradeClass: resolvedClassObj.name,
        studentName: cleanName,
        examCode: cleanCode,
        participantNumber: cleanPart || undefined,
        characterId: activeCharacterId,
      });
    } catch (err) {
      if (err instanceof StudentEntryError && err.requiresParticipantNumber) {
        setRequiresParticipantNumber(true);
      }
      if (err instanceof TypeError) {
        setBackendStatus('offline');
        setEntryError(
          'Tidak dapat terhubung ke server validasi ujian. Pastikan koneksi internet dan server backend aktif.'
        );
      } else {
        setEntryError(
          err instanceof Error
            ? err.message
            : 'Belum bisa masuk ke portal. Periksa kembali kelas, nama, dan kode ujianmu ya.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`min-h-screen relative flex flex-col text-slate-900 ${
        prefs.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <AdventureBackdrop animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion} variant="portal" />

      <div className="relative z-10 flex-1 flex flex-col">
        <AdventureHeader
          onLogoClick={onBackHome}
          navItems={[
            { id: 'home', label: 'Beranda', onClick: onBackHome },
            { id: 'guide', label: 'Petunjuk', onClick: onOpenGuide },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
          primaryAction={{ label: 'Masuk Guru', onClick: onOpenTeacherPortal }}
        />

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackNavButton label="Kembali" onClick={onBack} />
            <span className="text-xs font-semibold text-teal-700">
              {initialWorldContext?.worldTitle
                ? `${initialWorldContext.subjectName} · ${initialWorldContext.worldTitle}`
                : `${DEFAULT_SCHOOL_NAME} · Portal Siswa`}
            </span>
          </div>

          <motion.section
            initial={prefs.reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6"
          >
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold text-teal-700">
                {DEFAULT_SCHOOL_NAME} · Verifikasi Penjelajah Cilik
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-balance">
                Siap Memulai Petualangan?
              </h1>
              <p className="text-sm text-slate-600 max-w-xl mx-auto">
                Pilih karakter penjelajah, pilih kelasmu, lalu ketik nama lengkap dan kode ujian dari gurumu.
              </p>
            </div>

            {backendStatus === 'offline' && (
              <AdventureNotice
                variant="warning"
                title="Integrasi Validasi Backend Belum Aktif"
                message="Server validasi masuk siswa sedang tidak terjangkau. Sistem tidak akan membuat masuk palsu. Coba muat ulang setelah server aktif kembali."
              />
            )}

            {classes.length === 0 && (
              <AdventureNotice
                variant="info"
                title="Menunggu Data Kelas Sekolah"
                message="Data kelas & soal di Firestore belum diinisialisasi oleh guru. Jika guru belum mengaktifkan portal, kode ujian belum dapat diverifikasi."
              />
            )}

            <CompanionGuide
              characterId={activeCharacterId}
              message="Tidak perlu terburu-buru! Pastikan ejaan nama lengkapmu benar, dan tanyakan kode ujian ke Bapak/Ibu Guru jika belum tahu."
              animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion}
            />

            {isSubmitting ? (
              <AdventureLoading
                label="Memeriksa Identitas & Kode Ujian..."
                sublabel="Kompas sedang mencocokkan namamu dan membuka gerbang dunia."
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Character Selector */}
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">
                    1. Pilih Karakter Penjelajahmu
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXPLORER_CHARACTERS.map((char) => {
                      const selected = char.id === activeCharacterId;
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => {
                            audioEngine.playSelect();
                            onChangeCharacter(char.id);
                          }}
                          className={`min-h-[64px] p-3.5 rounded-2xl border-2 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                            selected
                              ? 'border-teal-600 bg-teal-50/70'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <img
                            src={char.avatarUrl}
                            alt={char.name}
                            referrerPolicy="no-referrer"
                            className={`w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 ${
                              selected && prefs.animationsEnabled && !prefs.reducedMotion
                                ? 'animate-float-slow'
                                : ''
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-display font-bold text-sm text-slate-900">
                              {char.name}
                            </p>
                            <p className="text-xs text-slate-600 truncate">{char.title}</p>
                          </div>
                          {selected && <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Class + Name + Code Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="student-class" className="block text-sm font-bold text-slate-800 mb-1.5">
                      2. Kelas
                    </label>
                    <div className="relative">
                      <School className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        id="student-class"
                        value={resolvedClassObj?.id || ''}
                        disabled={classOptions.length === 0}
                        onChange={(e) => {
                          setSelectedClassId(e.target.value);
                          setRequiresParticipantNumber(false);
                          setEntryError('');
                        }}
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {classOptions.length === 0 ? (
                          <option value="">Belum ada kelas aktif dari sekolah</option>
                        ) : (
                          classOptions.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              Kelas {cls.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="student-exam-code" className="block text-sm font-bold text-slate-800 mb-1.5">
                      3. Kode Ujian dari Guru
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="student-exam-code"
                        type="text"
                        value={examCode}
                        onChange={(e) => {
                          setExamCode(e.target.value.toUpperCase());
                          setEntryError('');
                        }}
                        placeholder="Contoh: PAI3, MTK3"
                        required
                        autoComplete="off"
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-white text-sm font-bold uppercase tracking-wide text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="student-full-name" className="block text-sm font-bold text-slate-800 mb-1.5">
                    4. Nama Lengkap Siswa
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="student-full-name"
                      type="text"
                      value={studentName}
                      onChange={(e) => {
                        setStudentName(e.target.value);
                        setRequiresParticipantNumber(false);
                        setEntryError('');
                      }}
                      placeholder="Ketik nama lengkapmu sesuai absen..."
                      required
                      className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                {requiresParticipantNumber ||
                showOptionalParticipant ||
                participantNumber.length > 0 ||
                initialWorldContext?.identityMode === 'roster_verify' ? (
                  <div>
                    <label
                      htmlFor="student-participant-number"
                      className="block text-sm font-bold text-slate-800 mb-1.5"
                    >
                      5. Nomor Peserta{' '}
                      <span className="font-normal text-slate-500">
                        {requiresParticipantNumber
                          ? '(Wajib diisi karena ada nama yang sama di kelas ini)'
                          : '(Isi jika diminta atau untuk membedakan nama sama)'}
                      </span>
                    </label>
                    <div className="relative">
                      <Compass className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="student-participant-number"
                        type="text"
                        value={participantNumber}
                        onChange={(e) => {
                          setParticipantNumber(e.target.value);
                          setEntryError('');
                        }}
                        placeholder="Contoh: PSAS-3A-04"
                        required={requiresParticipantNumber}
                        className={`w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl border text-sm font-medium focus:outline-none ${
                          requiresParticipantNumber
                            ? 'border-amber-500 bg-amber-50 focus:border-amber-600'
                            : 'border-slate-300 bg-white focus:border-teal-600'
                        }`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowOptionalParticipant(true)}
                      className="text-xs font-semibold text-teal-700 hover:underline py-1 cursor-pointer"
                    >
                      + Punya Nomor Peserta Pembeda?
                    </button>
                  </div>
                )}

                {entryError && (
                  <AdventureNotice
                    variant={requiresParticipantNumber ? 'warning' : 'error'}
                    title={requiresParticipantNumber ? 'Butuh Nomor Peserta' : 'Periksa Data Masuk'}
                    message={entryError}
                  />
                )}

                <PrimaryButton
                  type="submit"
                  fullWidth
                  disabled={backendStatus === 'offline' || classOptions.length === 0 || isSubmitting}
                  className="py-3.5 text-base"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>MASUK KE PETUALANGAN</span>
                </PrimaryButton>
              </form>
            )}
          </motion.section>
        </main>
      </div>
    </div>
  );
};
