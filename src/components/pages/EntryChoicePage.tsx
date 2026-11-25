import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Backpack, GraduationCap } from 'lucide-react';
import { EXPLORER_CHARACTERS } from '../../data/characters';
import { audioEngine } from '../../lib/audioEngine';
import {
  DEFAULT_SCHOOL_NAME,
  type AccessibilityPreferences,
  type ExplorerCharacterId,
} from '../../types/psas';
import {
  AdventureBackdrop,
  AdventureHeader,
  BackNavButton,
  CompanionGuide,
} from '../adventure';

interface EntryChoicePageProps {
  activeCharacterId: ExplorerCharacterId;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onChooseStudent: () => void;
  onChooseTeacher: () => void;
  onOpenGuide: () => void;
  onBackHome: () => void;
}

export const EntryChoicePage: React.FC<EntryChoicePageProps> = ({
  activeCharacterId,
  prefs,
  onUpdatePrefs,
  onChooseStudent,
  onChooseTeacher,
  onOpenGuide,
  onBackHome,
}) => {
  return (
    <div
      className={`min-h-screen relative flex flex-col text-slate-900 ${
        prefs.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <AdventureBackdrop animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion} />

      <div className="relative z-10 flex-1 flex flex-col">
        <AdventureHeader
          onLogoClick={onBackHome}
          navItems={[
            { id: 'home', label: 'Beranda', onClick: onBackHome },
            { id: 'guide', label: 'Petunjuk', onClick: onOpenGuide },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
          primaryAction={{ label: 'Masuk Guru', onClick: onChooseTeacher }}
        />

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <BackNavButton label="Kembali ke Halaman Utama" onClick={onBackHome} />
            <span className="text-xs font-semibold text-teal-700 hidden sm:inline">
              {DEFAULT_SCHOOL_NAME} · Pilih Jalur Masuk
            </span>
          </div>

          <motion.section
            initial={prefs.reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <p className="text-xs font-semibold text-teal-700">
                {DEFAULT_SCHOOL_NAME} · Gerbang Utama PSAS Adventure
              </p>
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance">
                Pilih Jalur Masukmu
              </h1>
              <p className="text-sm sm:text-base text-slate-600">
                Apakah kamu seorang Penjelajah Cilik yang siap bertualang, atau Bapak/Ibu Guru yang mengelola dunia asesmen?
              </p>
            </div>

            <CompanionGuide
              characterId={activeCharacterId}
              message="Halo! Pilih Masuk sebagai Siswa untuk memulai petualangan di 10 dunia, atau Masuk sebagai Guru untuk membuka ruang pengelolaan kelas."
              animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
              {/* Choice 1: Masuk Sebagai Siswa */}
              <button
                type="button"
                onClick={() => {
                  audioEngine.playSelect();
                  onChooseStudent();
                }}
                className="group bg-white border-2 border-teal-200 hover:border-teal-600 rounded-3xl p-6 sm:p-7 text-left flex flex-col justify-between gap-5 shadow-xs hover:shadow-md active:scale-[0.99] transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                      <Backpack className="w-7 h-7" />
                    </div>
                    <div className="flex -space-x-3">
                      {EXPLORER_CHARACTERS.map((char) => (
                        <img
                          key={char.id}
                          src={char.avatarUrl}
                          alt={char.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-xs"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-teal-700">Untuk Siswa Kelas 3 SD</p>
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                      MASUK SEBAGAI SISWA
                    </h2>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                      Pilih kelasmu, tulis namamu, dan masukkan kode ujian dari guru untuk membuka gerbang 10 Dunia Penjelajah Cilik.
                    </p>
                  </div>
                </div>

                <div className="min-h-[46px] px-5 py-3 rounded-2xl bg-teal-700 text-white font-display font-bold text-sm sm:text-base flex items-center justify-between group-hover:bg-teal-800 transition-colors">
                  <span>Buka Gerbang Siswa</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Choice 2: Masuk Sebagai Guru */}
              <button
                type="button"
                onClick={() => {
                  audioEngine.playSelect();
                  onChooseTeacher();
                }}
                className="group bg-white border-2 border-slate-200 hover:border-amber-500 rounded-3xl p-6 sm:p-7 text-left flex flex-col justify-between gap-5 shadow-xs hover:shadow-md active:scale-[0.99] transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <GraduationCap className="w-7 h-7" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-amber-700">Untuk Pendidik & Admin Sekolah</p>
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                      MASUK SEBAGAI GURU
                    </h2>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                      Masuk dengan akun terverifikasi Firebase Authentication untuk mengatur 10 dunia, bank soal, daftar peserta, dan laporan nilai.
                    </p>
                  </div>
                </div>

                <div className="min-h-[46px] px-5 py-3 rounded-2xl bg-slate-900 text-white font-display font-bold text-sm sm:text-base flex items-center justify-between group-hover:bg-slate-800 transition-colors">
                  <span>Buka Login Guru</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
};
