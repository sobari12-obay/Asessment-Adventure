import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Award,
  CheckSquare,
  Compass,
  Flag,
  KeyRound,
  Play,
} from 'lucide-react';
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
  PrimaryButton,
  SecondaryButton,
} from '../adventure';

interface GuidePageProps {
  activeCharacterId: ExplorerCharacterId;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onStartAdventure: () => void;
  onOpenTeacherPortal: () => void;
  onBackHome: () => void;
}

const GUIDE_STEPS = [
  {
    number: '1',
    title: 'Cara Masuk',
    icon: KeyRound,
    accent: 'bg-teal-50 text-teal-700 border-teal-200',
    description:
      'Tekan tombol Mulai Petualangan, pilih Masuk sebagai Siswa, lalu pilih kelasmu, ketik nama lengkap, dan masukkan kode ujian dari Bapak/Ibu Guru.',
    tip: 'Jika ada teman bernama sama di kelasmu, masukkan Nomor Peserta agar sistem mengenali datamu.',
  },
  {
    number: '2',
    title: 'Cara Memilih Dunia',
    icon: Compass,
    accent: 'bg-sky-50 text-sky-700 border-sky-200',
    description:
      'Ada 10 Dunia Mata Pelajaran dari PAI hingga Bahasa Cirebon. Dunia yang sudah dibuka guru bertanda Terbuka dan siap diklik.',
    tip: 'Kamu bisa memilih karakter Raka atau Laras untuk menemani perjalananmu.',
  },
  {
    number: '3',
    title: 'Cara Menjawab Soal',
    icon: CheckSquare,
    accent: 'bg-amber-50 text-amber-700 border-amber-200',
    description:
      'Baca cerita dan pertanyaan dengan tenang. Ketuk pilihan jawaban, hubungkan pasangan gambar, atau ketik jawaban sesuai petunjuk di layar.',
    tip: 'Setiap jawaban langsung tersimpan otomatis meskipun sinyal sempat melemah.',
  },
  {
    number: '4',
    title: 'Cara Berpindah Soal',
    icon: ArrowLeftRight,
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description:
      'Gunakan tombol Lanjut Langkah untuk menuju pos berikutnya, atau tombol Sebelumnya jika ingin membaca ulang soal sebelumnya.',
    tip: 'Kamu juga bisa melihat peta pos berwarna hijau untuk soal yang sudah dijawab.',
  },
  {
    number: '5',
    title: 'Cara Menyelesaikan Misi',
    icon: Award,
    accent: 'bg-rose-50 text-rose-700 border-rose-200',
    description:
      'Terus melangkah melewati setiap checkpoint hingga mencapai pos terakhir. Setiap dunia memberimu artefak dan bintang perjalanan!',
    tip: 'Kerjakan dengan jujur dan teliti, tidak perlu terburu-buru.',
  },
  {
    number: '6',
    title: 'Cara Mengumpulkan Jawaban',
    icon: Flag,
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description:
      'Di pos terakhir, periksa kembali seluruh jawabanmu lalu tekan tombol Selesaikan Misi untuk mengirimkan seluruh jawaban ke guru.',
    tip: 'Setelah selesai, artefak dunia akan otomatis masuk ke Lemari Lencana.',
  },
];

export const GuidePage: React.FC<GuidePageProps> = ({
  activeCharacterId,
  prefs,
  onUpdatePrefs,
  onStartAdventure,
  onOpenTeacherPortal,
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
            { id: 'guide', label: 'Petunjuk', active: true, onClick: () => {} },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
          primaryAction={{ label: 'Masuk Guru', onClick: onOpenTeacherPortal }}
        />

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <BackNavButton label="Kembali ke Halaman Utama" onClick={onBackHome} />
            <span className="text-xs font-semibold text-teal-700 hidden sm:inline">
              {DEFAULT_SCHOOL_NAME} · Panduan Siswa Kelas 3
            </span>
          </div>

          <motion.section
            initial={prefs.reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <div className="bg-white/95 border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6">
              <img
                src="/src/assets/images/world_banner_adventure_1795448997744.jpg"
                alt="Ilustrasi Petualangan 10 Dunia"
                referrerPolicy="no-referrer"
                className="w-full md:w-64 h-44 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
              <div className="space-y-2 text-center md:text-left">
                <p className="text-xs font-semibold text-teal-700">
                  Buku Saku Penjelajah Cilik
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Petunjuk Bermain PSAS Adventure
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Ikuti 6 langkah mudah ini supaya petualanganmu di 10 Dunia berjalan lancar dan menyenangkan!
                </p>
              </div>
            </div>

            <CompanionGuide
              characterId={activeCharacterId}
              message="Baca pelan-pelan ya! Kalau sudah siap, kamu bisa langsung menekan tombol Mulai Petualangan di bawah."
              animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {GUIDE_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.number}
                    className="bg-white/95 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${step.accent}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-mono-tabular text-xs font-bold text-slate-400">
                          Langkah {step.number}
                        </span>
                      </div>

                      <div>
                        <h2 className="font-display text-lg font-bold text-slate-900">
                          {step.title}
                        </h2>
                        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 pt-3 border-t border-slate-100 leading-relaxed">
                      Tips: {step.tip}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Sudah Mengerti Cara Bermainnya?
                </h2>
                <p className="text-sm text-slate-600">
                  Ayo pilih jalur masukmu dan jelajahi dunia mata pelajaran hari ini!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <SecondaryButton onClick={onBackHome} className="w-full sm:w-auto">
                  Kembali ke Beranda
                </SecondaryButton>
                <PrimaryButton onClick={onStartAdventure} className="w-full sm:w-auto">
                  <Play className="w-4 h-4 fill-current" />
                  <span>Mulai Petualangan</span>
                </PrimaryButton>
              </div>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
};
