import {
  getAdventureStateSnapshot,
  getGamificationConfigForSchool,
  makeCheckpointProgressKey,
  makeProfileKey,
  makeStudentBadgeKey,
  makeWorldOverrideKey,
  makeWorldProgressKey,
  mutateAdventureState,
  type AdventureEventRecord,
  type AdventureProfileRecord,
  type AdventureStoreState,
  type AdventureWorldStatus,
  type BadgeRuleConfig,
  type BagStyleId,
  type CheckpointProgressRecord,
  type CheckpointType,
  type CustomCheckpointRecord,
  type GamificationConfig,
  type OutfitThemeId,
  type ShoeStyleId,
  type StudentBadgeRecord,
  type WorldOverrideRecord,
  type WorldProgressRecord,
  type XpSourceType,
  type XpTransactionRecord,
} from './adventureStore.js';
import { fsCommitWrites, fsListCollection, fsRunEqualityQuery } from './firestoreRest.js';

export interface LevelThreshold {
  level: number;
  title: string;
  minXp: number;
  nextMinXp: number | null;
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, title: 'Penjelajah Pemula', minXp: 0, nextMinXp: 100 },
  { level: 2, title: 'Penjelajah Muda', minXp: 100, nextMinXp: 250 },
  { level: 3, title: 'Penjelajah Aktif', minXp: 250, nextMinXp: 450 },
  { level: 4, title: 'Penjelajah Hebat', minXp: 450, nextMinXp: 700 },
  { level: 5, title: 'Petualang Cerdas', minXp: 700, nextMinXp: 1000 },
  { level: 6, title: 'Petualang Tangguh', minXp: 1000, nextMinXp: 1400 },
  { level: 7, title: 'Penjelajah Andal', minXp: 1400, nextMinXp: 1800 },
  { level: 8, title: 'Penjelajah Istimewa', minXp: 1800, nextMinXp: 2300 },
  { level: 9, title: 'Master Petualangan', minXp: 2300, nextMinXp: 2900 },
  { level: 10, title: 'Legenda Penjelajah', minXp: 2900, nextMinXp: null },
];

export interface ComputedLevelInfo {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpForLevelSpan: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export function computeLevelInfo(rawXp: number): ComputedLevelInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(rawXp) ? rawXp : 0));
  let current = LEVEL_THRESHOLDS[0];
  for (const row of LEVEL_THRESHOLDS) {
    if (totalXp >= row.minXp) {
      current = row;
    }
  }
  if (current.nextMinXp === null) {
    return {
      level: current.level,
      title: current.title,
      totalXp,
      currentLevelMinXp: current.minXp,
      nextLevelXp: null,
      xpIntoLevel: totalXp - current.minXp,
      xpForLevelSpan: 0,
      xpToNextLevel: 0,
      progressPercent: 100,
    };
  }
  const span = current.nextMinXp - current.minXp;
  const into = totalXp - current.minXp;
  return {
    level: current.level,
    title: current.title,
    totalXp,
    currentLevelMinXp: current.minXp,
    nextLevelXp: current.nextMinXp,
    xpIntoLevel: into,
    xpForLevelSpan: span,
    xpToNextLevel: Math.max(0, current.nextMinXp - totalXp),
    progressPercent: span > 0 ? Math.min(100, Math.max(0, Math.round((into / span) * 100))) : 100,
  };
}

export interface BadgeCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string;
  category: 'milestone' | 'world' | 'consistency';
  iconKey: string;
  targetWorldId?: string;
  order: number;
  targetCount?: number;
  xpThreshold?: number;
  isActive?: boolean;
}

export const BADGE_CATALOG: BadgeCatalogItem[] = [
  {
    id: 'penjelajah_pertama',
    code: 'PENJELAJAH_PERTAMA',
    name: 'Penjelajah Pertama',
    description: 'Memilih karakter petualang dan menjejakkan kaki di Base Camp untuk pertama kali.',
    category: 'milestone',
    iconKey: 'compass',
    order: 1,
  },
  {
    id: 'si_pemberani',
    code: 'SI_PEMBERANI',
    name: 'Si Pemberani',
    description: 'Berani memulai dan menyelesaikan checkpoint petualangan pertamamu.',
    category: 'milestone',
    iconKey: 'shield',
    order: 2,
  },
  {
    id: 'penjelajah_konsisten',
    code: 'PENJELAJAH_KONSISTEN',
    name: 'Penjelajah Konsisten',
    description: 'Terus bersemangat menjelajahi 3 dunia berbeda atau hadir di 2 hari petualangan.',
    category: 'consistency',
    iconKey: 'flame',
    order: 3,
  },
  {
    id: 'sahabat_alam',
    code: 'SAHABAT_ALAM',
    name: 'Sahabat Alam',
    description: 'Menyelesaikan seluruh pos ekspedisi di Dunia IPAS (Ekspedisi Alam).',
    category: 'world',
    iconKey: 'leaf',
    targetWorldId: 'ipas',
    order: 4,
  },
  {
    id: 'ahli_angka',
    code: 'AHLI_ANGKA',
    name: 'Ahli Angka',
    description: 'Memecahkan semua pos rahasia di Dunia Matematika (Pulau Angka).',
    category: 'world',
    iconKey: 'calculator',
    targetWorldId: 'matematika',
    order: 5,
  },
  {
    id: 'pencinta_kata',
    code: 'PENCINTA_KATA',
    name: 'Pencinta Kata',
    description: 'Menuntaskan seluruh jembatan cerita di Dunia Bahasa Indonesia (Hutan Kata).',
    category: 'world',
    iconKey: 'book',
    targetWorldId: 'bahasa_indonesia',
    order: 6,
  },
  {
    id: 'seniman_cilik',
    code: 'SENIMAN_CILIK',
    name: 'Seniman Cilik',
    description: 'Menyelesaikan seluruh pos warna dan karya di Dunia Seni Rupa (Galeri Kreativitas).',
    category: 'world',
    iconKey: 'palette',
    targetWorldId: 'seni_rupa',
    order: 7,
  },
  {
    id: 'bintang_kebaikan',
    code: 'BINTANG_KEBAIKAN',
    name: 'Bintang Kebaikan',
    description: 'Menyelesaikan Dunia PAI (Negeri Cahaya Kebaikan) atau Pendidikan Pancasila (Negeri Sahabat).',
    category: 'world',
    iconKey: 'sparkles',
    targetWorldId: 'pai',
    order: 8,
  },
  {
    id: 'english_explorer',
    code: 'ENGLISH_EXPLORER',
    name: 'English Explorer',
    description: 'Menjelajahi dan menuntaskan seluruh pos di Dunia Bahasa Inggris (English Quest).',
    category: 'world',
    iconKey: 'globe',
    targetWorldId: 'bahasa_inggris',
    order: 9,
  },
  {
    id: 'budaya_nusantara',
    code: 'BUDAYA_NUSANTARA',
    name: 'Budaya Nusantara',
    description: 'Menyelesaikan pos warisan daerah di Dunia Bahasa Sunda atau Bahasa Cirebon.',
    category: 'world',
    iconKey: 'landmark',
    targetWorldId: 'bahasa_sunda',
    order: 10,
  },
  {
    id: 'penjelajah_5_dunia',
    code: 'PENJELAJAH_5_DUNIA',
    name: 'Penjelajah 5 Dunia',
    description: 'Berhasil menyelesaikan ekspedisi di minimal 5 dunia berbeda.',
    category: 'milestone',
    iconKey: 'award',
    order: 11,
  },
  {
    id: 'penjelajah_10_dunia',
    code: 'PENJELAJAH_10_DUNIA',
    name: 'Penjelajah 10 Dunia',
    description: 'Luar biasa! Menuntaskan ekspedisi di seluruh 10 dunia Penjelajah Cilik.',
    category: 'milestone',
    iconKey: 'crown',
    order: 12,
  },
];

export interface WorldCatalogEntry {
  id: string;
  number: number;
  subjectId: string;
  subjectName: string;
  worldName: string;
  portalName: string;
  zoneTheme: string;
  themeSummary: string;
  companionName: string;
  artifactName: string;
  defaultAvailable: boolean;
  defaultScheduleLabel: string;
  defaultAvailabilityReason: string;
}

export const WORLD_ADVENTURE_CATALOG: WorldCatalogEntry[] = [
  {
    id: 'pai',
    number: 1,
    subjectId: 'pai',
    subjectName: 'PAI',
    worldName: 'NEGERI CAHAYA KEBAIKAN',
    portalName: 'Portal Cahaya',
    zoneTheme: 'taman_cahaya',
    themeSummary: 'Taman kebaikan, masjid ramah anak, bintang, dan lentera nilai-nilai mulia.',
    companionName: 'Kak Rayyan',
    artifactName: 'Lentera Cahaya',
    defaultAvailable: true,
    defaultScheduleLabel: 'Terbuka · Gelombang 1',
    defaultAvailabilityReason: 'Terbuka untuk seluruh penjelajah kelas 3 SDN Pekiringan.',
  },
  {
    id: 'pancasila',
    number: 2,
    subjectId: 'pancasila',
    subjectName: 'Pendidikan Pancasila',
    worldName: 'NEGERI SAHABAT',
    portalName: 'Desa Sahabat',
    zoneTheme: 'desa_sahabat',
    themeSummary: 'Persahabatan, gotong royong di sekolah, kehidupan masyarakat, dan nilai Pancasila.',
    companionName: 'Kak Bintang',
    artifactName: 'Medali Gotong Royong',
    defaultAvailable: true,
    defaultScheduleLabel: 'Terbuka · Gelombang 1',
    defaultAvailabilityReason: 'Terbuka untuk seluruh penjelajah kelas 3 SDN Pekiringan.',
  },
  {
    id: 'bahasa_indonesia',
    number: 3,
    subjectId: 'bahasa_indonesia',
    subjectName: 'Bahasa Indonesia',
    worldName: 'HUTAN KATA',
    portalName: 'Hutan Kata',
    zoneTheme: 'hutan_kata',
    themeSummary: 'Hutan buku, pohon kata, jembatan kalimat, perpustakaan ajaib, dan hewan pembantu.',
    companionName: 'Kancil Pustaka',
    artifactName: 'Pena Pustaka Ajaib',
    defaultAvailable: true,
    defaultScheduleLabel: 'Terbuka · Gelombang 1',
    defaultAvailabilityReason: 'Terbuka untuk seluruh penjelajah kelas 3 SDN Pekiringan.',
  },
  {
    id: 'matematika',
    number: 4,
    subjectId: 'matematika',
    subjectName: 'Matematika',
    worldName: 'PULAU ANGKA',
    portalName: 'Pulau Angka',
    zoneTheme: 'pulau_angka',
    themeSummary: 'Jembatan angka, gua bilangan, pintu kode rahasia, dan peti harta karun.',
    companionName: 'Kapten Hitung',
    artifactName: 'Kompas Bilangan Emas',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Gelombang 2',
    defaultAvailabilityReason: 'Menunggu jadwal pembukaan Pulau Angka oleh Bapak/Ibu Guru.',
  },
  {
    id: 'ipas',
    number: 5,
    subjectId: 'ipas',
    subjectName: 'IPAS',
    worldName: 'EKSPEDISI ALAM',
    portalName: 'Ekspedisi Alam',
    zoneTheme: 'ekspedisi_alam',
    themeSummary: 'Hutan tropis, hewan, tumbuhan, sungai, gunung, dan pengamatan alam sekitar.',
    companionName: 'Peneliti Nara',
    artifactName: 'Kaca Pembesar Alam',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Gelombang 2',
    defaultAvailabilityReason: 'Gerbang Ekspedisi Alam dibuka sesuai jadwal kelas oleh guru.',
  },
  {
    id: 'seni_rupa',
    number: 6,
    subjectId: 'seni_rupa',
    subjectName: 'Seni Rupa',
    worldName: 'GALERI KREATIVITAS',
    portalName: 'Galeri Kreativitas',
    zoneTheme: 'galeri_kreativitas',
    themeSummary: 'Studio seni, kanvas, kuas, warna, bentuk geometris, tekstur, dan pola karya.',
    companionName: 'Maestro Rupa',
    artifactName: 'Kuas Pelangi',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Gelombang 3',
    defaultAvailabilityReason: 'Menunggu aktivasi portal Galeri Kreativitas oleh guru kelas.',
  },
  {
    id: 'pjok',
    number: 7,
    subjectId: 'pjok',
    subjectName: 'PJOK',
    worldName: 'ARENA GERAK CERIA',
    portalName: 'Arena Gerak Ceria',
    zoneTheme: 'arena_gerak',
    themeSummary: 'Lapangan cerah, lintasan, permainan olahraga, kesehatan, kebugaran, dan keselamatan.',
    companionName: 'Coach Bima',
    artifactName: 'Sepatu Kencana',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Gelombang 3',
    defaultAvailabilityReason: 'Portal Arena Gerak Ceria belum diaktifkan guru pada sesi ini.',
  },
  {
    id: 'bahasa_inggris',
    number: 8,
    subjectId: 'bahasa_inggris',
    subjectName: 'Bahasa Inggris',
    worldName: 'ENGLISH QUEST',
    portalName: 'English Quest',
    zoneTheme: 'english_quest',
    themeSummary: 'English village, alphabet tree, vocabulary island, animal world, dan dialog sederhana.',
    companionName: 'Buddy Owl',
    artifactName: 'Golden Owl Key',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Gelombang 4',
    defaultAvailabilityReason: 'Menunggu pembukaan gerbang English Quest oleh guru.',
  },
  {
    id: 'bahasa_sunda',
    number: 9,
    subjectId: 'bahasa_sunda',
    subjectName: 'Bahasa Sunda',
    worldName: 'LEMBUR PANGUMBARAAN',
    portalName: 'Lembur Pangumbaraan',
    zoneTheme: 'lembur_sunda',
    themeSummary: 'Lembur asri, rumah tradisional, sawah, gunung, serta kosakata dan budaya Sunda.',
    companionName: 'Kang Galuh',
    artifactName: 'Angklung Pusaka',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Muatan Lokal',
    defaultAvailabilityReason: 'Portal Lembur Pangumbaraan dibuka sesuai jadwal muatan lokal.',
  },
  {
    id: 'bahasa_cirebon',
    number: 10,
    subjectId: 'bahasa_cirebon',
    subjectName: 'Bahasa Cirebon',
    worldName: 'JELAJAH TANAH CIREBON',
    portalName: 'Jelajah Tanah Cirebon',
    zoneTheme: 'tanah_cirebon',
    themeSummary: 'Keraton, motif Batik Mega Mendung, lingkungan Cirebon, dan kearifan lokal sesuai materi sekolah.',
    companionName: 'Nyi Sekar',
    artifactName: 'Awan Mega Mendung',
    defaultAvailable: false,
    defaultScheduleLabel: 'Jadwal Guru · Muatan Lokal',
    defaultAvailabilityReason: 'Menunggu pembukaan jadwal Bahasa Cirebon oleh Bapak/Ibu Guru.',
  },
];

export interface WorldCheckpointDefinition {
  id: string;
  schoolId: string;
  worldId: string;
  order: number;
  title: string;
  storyIntro: string;
  storyOutro: string;
  challengePrompt: string;
  challengeOptions: string[];
  helpfulHint: string;
  checkpointType: CheckpointType;
  xpReward: number;
  isActive: boolean;
}

const WORLD_CHECKPOINT_SCRIPTS: Record<
  string,
  Array<{
    title: string;
    type: CheckpointType;
    xp: number;
    intro: string;
    prompt: string;
    options: string[];
    hint: string;
    outro: string;
  }>
> = {
  pai: [
    {
      title: 'Gerbang Lentera Salam',
      type: 'story',
      xp: 20,
      intro: 'Kak Rayyan menyambutmu di halaman taman bercahaya dengan senyum ramah.',
      prompt: 'Saat bertemu teman atau guru di pagi hari, sikap baik apa yang paling indah dilakukan?',
      options: ['Mengucapkan salam dengan ramah', 'Berjalan menunduk tanpa menyapa', 'Diam saja sambil berlari'],
      hint: 'Salam dan senyum menyebarkan cahaya kebaikan di sekolah!',
      outro: 'Lentera pertama menyala hangat! Kamu siap melangkah ke pos berikutnya.',
    },
    {
      title: 'Taman Kejujuran & Berbagi',
      type: 'exploration',
      xp: 25,
      intro: 'Di tengah taman terdapat kotak temuan barang milik teman yang terjatuh.',
      prompt: 'Jika menemukan pensil milik teman di kelas, langkah penjelajah yang jujur adalah...',
      options: ['Mengembalikan kepada pemilik atau guru', 'Menyimpannya di tas sendiri', 'Membiarkannya di lantai'],
      hint: 'Kejujuran membuat hati tenang dan dipercaya teman.',
      outro: 'Hebat! Cahaya taman semakin terang berkat sikap jujurmu.',
    },
    {
      title: 'Menara Bintang Kebaikan',
      type: 'mission_gate',
      xp: 30,
      intro: 'Kamu tiba di puncak menara tempat Lentera Cahaya bersinar paling terang.',
      prompt: 'Sebelum membuka gerbang misi PSAS PAI, mari siapkan hati yang...',
      options: ['Tenang, berdoa, dan berusaha jujur', 'Terburu-buru dan panik', 'Mengeluh sebelum mencoba'],
      hint: 'Berdoa dan tenang membantu kita berpikir jernih!',
      outro: 'Pos Puncak Negeri Cahaya Kebaikan tuntas! Artefak Lentera Cahaya bersinar untukmu.',
    },
  ],
  pancasila: [
    {
      title: 'Gapura Desa Sahabat',
      type: 'story',
      xp: 20,
      intro: 'Kak Bintang mengajakmu melihat papan persahabatan di Balai Desa Sahabat.',
      prompt: 'Meski teman di kelas memiliki hobi dan asal yang berbeda, kita sebaiknya...',
      options: ['Tetap rukun dan saling menghargai', 'Hanya bermain dengan satu teman', 'Mengejek perbedaan teman'],
      hint: 'Bhinneka Tunggal Ika berarti berbeda-beda tetap satu jua.',
      outro: 'Gapura Desa Sahabat terbuka lebar menyambut semangat persatuanmu!',
    },
    {
      title: 'Jembatan Gotong Royong',
      type: 'exploration',
      xp: 25,
      intro: 'Warga desa sedang memperbaiki taman sekolah bersama-sama agar cepat rapi.',
      prompt: 'Pekerjaan piket kelas yang berat akan terasa ringan bila dikerjakan dengan...',
      options: ['Gotong royong bersama teman regu', 'Menunggu satu orang saja', 'Menunda sampai pulang sekolah'],
      hint: 'Berat sama dipikul, ringan sama dijinjing!',
      outro: 'Jembatan kayu tersambung kuat berkat semangat kerja sama!',
    },
    {
      title: 'Balai Musyawarah Bintang',
      type: 'mission_gate',
      xp: 30,
      intro: 'Di balai desa, teman-teman sedang menentukan permainan kelas secara adil.',
      prompt: 'Cara terbaik mengambil keputusan bersama di kelas adalah melalui...',
      options: ['Musyawarah dengan mendengarkan semua pendapat', 'Memaksakan keinginan sendiri', 'Bertengkar menentukan pilihan'],
      hint: 'Sila ke-4 mengajarkan musyawarah yang bijaksana.',
      outro: 'Luar biasa! Seluruh pos Negeri Sahabat telah kamu jelajahi.',
    },
  ],
  bahasa_indonesia: [
    {
      title: 'Gerbang Pohon Aksara',
      type: 'story',
      xp: 20,
      intro: 'Kancil Pustaka menunjukkan daun-daun kata yang berkilau di tepi hutan.',
      prompt: 'Agar mudah memahami isi bacaan atau petunjuk misi, kita perlu...',
      options: ['Membaca kalimat demi kalimat dengan teliti', 'Langsung melompati semua teks', 'Hanya melihat halaman terakhir'],
      hint: 'Membaca dengan tenang membuat petunjuk cerita terasa jelas!',
      outro: 'Daun aksara membuka jalan setapak menuju jembatan sungai kata.',
    },
    {
      title: 'Jembatan Kalimat Rapi',
      type: 'exploration',
      xp: 25,
      intro: 'Beberapa papan jembatan bertuliskan kalimat sapaan dan tanda baca.',
      prompt: 'Kalimat berita yang selesai diucapkan biasanya diakhiri dengan tanda...',
      options: ['Tanda titik (.)', 'Tanda tanya (?) di tengah kata', 'Tidak perlu tanda apa pun'],
      hint: 'Tanda titik menandakan akhir kalimat berita dengan rapi.',
      outro: 'Tap! Papan jembatan terpasang sempurna untuk dilewati.',
    },
    {
      title: 'Perpustakaan Puncak Rimba',
      type: 'mission_gate',
      xp: 30,
      intro: 'Kamu berdiri di depan pintu Perpustakaan Ajaib berisi buku-buku kisah Nusantara.',
      prompt: 'Informasi utama yang diceritakan dalam sebuah paragraf disebut...',
      options: ['Ide pokok atau gagasan utama', 'Judul sampul belakang', 'Nomor halaman buku'],
      hint: 'Ide pokok adalah inti cerita yang dibahas di paragraf.',
      outro: 'Pena Pustaka Ajaib berpendar! Ekspedisi Hutan Kata berhasil diselesaikan.',
    },
  ],
  matematika: [
    {
      title: 'Dermaga Kode Bilangan',
      type: 'story',
      xp: 20,
      intro: 'Kapten Hitung memeriksa kompas angka sebelum kapal berlabuh ke Pulau Angka.',
      prompt: 'Perhatikan pola bilangan: 10, 20, 30, ... Angka berikutnya pada jembatan adalah?',
      options: ['40', '35', '50'],
      hint: 'Setiap langkah bertambah 10 satuan!',
      outro: 'Kode dermaga cocok! Kapal penjelajah merapat ke pulau.',
    },
    {
      title: 'Gua Pengukuran Cermat',
      type: 'exploration',
      xp: 25,
      intro: 'Di dinding gua terukir tanda ukuran panjang dan jam dinding petualangan.',
      prompt: 'Untuk mengukur panjang pensil di meja belajar, alat ukur yang paling sesuai adalah...',
      options: ['Penggaris berskala sentimeter', 'Timbangan berat badan', 'Termometer suhu'],
      hint: 'Penggaris membantu mengukur panjang benda kecil dengan tepat.',
      outro: 'Pintu gua batu terbuka perlahan menuju ruang harta karun!',
    },
    {
      title: 'Peti Kompas Bilangan Emas',
      type: 'mission_gate',
      xp: 30,
      intro: 'Peti harta karun Matematika membutuhkan ketelitian berhitung tenang.',
      prompt: 'Jika 4 kotak masing-masing berisi 5 bintang, jumlah seluruh bintang adalah...',
      options: ['20 bintang', '9 bintang', '15 bintang'],
      hint: '4 kelompok dikalikan 5 bintang per kotak = 5 + 5 + 5 + 5.',
      outro: 'Krak! Peti terbuka dan Kompas Bilangan Emas menyala untukmu.',
    },
  ],
  ipas: [
    {
      title: 'Pos Pengamatan Tumbuhan',
      type: 'story',
      xp: 20,
      intro: 'Peneliti Nara mengajakmu meneliti daun hijau dan akar pohon di hutan tropis.',
      prompt: 'Bagian tumbuhan yang bertugas menyerap air dan mineral dari dalam tanah adalah...',
      options: ['Akar', 'Kelopak bunga', 'Biji kering'],
      hint: 'Bagian ini tumbuh menjalar ke dalam tanah untuk menguatkan pohon.',
      outro: 'Catatan pengamatan pertama tersimpan rapi di buku lapangan!',
    },
    {
      title: 'Lembah Daur Hidup',
      type: 'exploration',
      xp: 25,
      intro: 'Di tepi sungai jernih terlihat kupu-kupu dan katak beraktivitas di alam.',
      prompt: 'Untuk menjaga sungai dan hutan tetap bersih, tindakan penjelajah alam adalah...',
      options: ['Membuang sampah pada tempatnya', 'Membuang plastik ke aliran sungai', 'Memetik semua bunga liar'],
      hint: 'Menjaga kebersihan membuat hewan dan tumbuhan tumbuh sehat.',
      outro: 'Lembah terasa segar dan kicau burung menyambut langkahmu.',
    },
    {
      title: 'Puncak Kaca Pembesar',
      type: 'mission_gate',
      xp: 30,
      intro: 'Dari puncak bukit, kamu dapat mengamati wujud benda padat, cair, dan gas.',
      prompt: 'Air minum di dalam botol merupakan contoh benda berwujud...',
      options: ['Cair', 'Padat keras', 'Logam magnet'],
      hint: 'Benda cair mengalir dan mengikuti bentuk wadahnya.',
      outro: 'Kaca Pembesar Alam aktif! Seluruh pos Ekspedisi Alam tuntas.',
    },
  ],
  seni_rupa: [
    {
      title: 'Sudut Warna Primer',
      type: 'story',
      xp: 20,
      intro: 'Maestro Rupa menyiapkan palet cat warna-warni di studio cerah.',
      prompt: 'Jika warna merah dan kuning dicampur merata di palet, akan lahir warna...',
      options: ['Jingga / Oranye', 'Hitam pekat', 'Biru laut'],
      hint: 'Warna matahari senja yang hangat!',
      outro: 'Kanvas pertama dipenuhi warna cerah yang ceria!',
    },
    {
      title: 'Jejak Garis & Tekstur',
      type: 'exploration',
      xp: 25,
      intro: 'Di meja karya terdapat kertas bergelombang, kapas lembut, dan batu halus.',
      prompt: 'Kesan kasar atau halusnya permukaan suatu benda disebut...',
      options: ['Tekstur', 'Volume suara', 'Kecepatan gerak'],
      hint: 'Kita mengenal tekstur dengan meraba dan mengamati permukaan.',
      outro: 'Kolase bentuk dan teksturmu terlihat menawan di galeri!',
    },
    {
      title: 'Panggung Kuas Pelangi',
      type: 'mission_gate',
      xp: 30,
      intro: 'Saatnya menyusun pola hias dekoratif untuk gerbang Galeri Kreativitas.',
      prompt: 'Pola berulang seperti lingkaran-segitiga-lingkaran-segitiga membentuk...',
      options: ['Irama pola gambar yang teratur', 'Coretan acak tanpa bentuk', 'Angka perkalian'],
      hint: 'Pengulangan bentuk secara teratur membuat motif batik dan hiasan indah.',
      outro: 'Kuas Pelangi bersinar! Galeri Kreativitas selesai dijelajahi.',
    },
  ],
  pjok: [
    {
      title: 'Lintasan Pemanasan Pagi',
      type: 'story',
      xp: 20,
      intro: 'Coach Bima meniup peluit ceria di lapangan rumput yang segar.',
      prompt: 'Sebelum berolahraga lari atau senam, kita wajib melakukan pemanasan agar...',
      options: ['Otot siap bergerak dan terhindar dari cedera', 'Tubuh langsung kelelahan', 'Sepatu menjadi cepat kotor'],
      hint: 'Pemanasan melenturkan sendi dan menyiapkan tubuh dengan aman.',
      outro: 'Tubuh terasa bugar! Kamu siap melangkah ke pos gerak berikutnya.',
    },
    {
      title: 'Pos Gerak Lokomotor',
      type: 'exploration',
      xp: 25,
      intro: 'Terdapat lintasan lompat tali dan lari zig-zag penuh bendera warna.',
      prompt: 'Contoh gerak berpindah tempat (lokomotor) saat bermain di lapangan adalah...',
      options: ['Berjalan, berlari, dan melompat', 'Berdiri diam di tempat', 'Duduk membaca buku'],
      hint: 'Lokomotor berarti tubuh kita berpindah dari satu titik ke titik lain.',
      outro: 'Lompatan tangkas! Coach Bima memberi acungan jempol.',
    },
    {
      title: 'Podium Sportivitas',
      type: 'mission_gate',
      xp: 30,
      intro: 'Permainan beregu baru saja usai dengan penuh semangat kebersamaan.',
      prompt: 'Sikap sportif saat bermain olahraga bersama teman berarti...',
      options: ['Bermain jujur, taat aturan, dan menghormati teman', 'Marah jika tim kalah', 'Curang agar cepat menang'],
      hint: 'Kebersamaan dan kejujuran lebih berharga dari skor semata.',
      outro: 'Sepatu Kencana menyala! Arena Gerak Ceria selesai ditaklukkan.',
    },
  ],
  bahasa_inggris: [
    {
      title: 'Welcome Gate of English Village',
      type: 'story',
      xp: 20,
      intro: 'Buddy Owl waves cheerfully from the Alphabet Tree at the village entrance.',
      prompt: 'How do you greet your teacher politely in the morning in English?',
      options: ['Good morning, Teacher!', 'Good night, see you tomorrow!', 'Goodbye now!'],
      hint: 'Morning artinya pagi hari!',
      outro: 'Awesome! Buddy Owl hoots happily and opens the Alphabet Path.',
    },
    {
      title: 'Animal & Color Meadow',
      type: 'exploration',
      xp: 25,
      intro: 'You see colorful birds, cats, and apples around the cozy English garden.',
      prompt: 'Which word matches the color of the bright blue sky?',
      options: ['Blue', 'Yellow', 'Green'],
      hint: 'Sky = langit cerah!',
      outro: 'Great job! Your English Explorer notebook shines brighter.',
    },
    {
      title: 'Golden Owl Tower',
      type: 'mission_gate',
      xp: 30,
      intro: 'You have reached the top of English Quest Tower where the Golden Key rests.',
      prompt: 'If a friend says "Thank you for helping me!", the polite reply is...',
      options: ['You are welcome!', 'Never mind, go away', 'Good afternoon'],
      hint: 'Sama-sama dalam Bahasa Inggris adalah "You are welcome".',
      outro: 'Golden Owl Key unlocked! English Quest adventure is complete!',
    },
  ],
  bahasa_sunda: [
    {
      title: 'Gerbang Lembur Asri',
      type: 'story',
      xp: 20,
      intro: 'Kang Galuh mapag di lawang lembur nu pinuh ku tatangkalan héjo.',
      prompt: 'Nalika pendak sareng ibu/bapa guru isuk-isuk, sapaan sopan dina basa Sunda nyaéta...',
      options: ['Wilujeng énjing, Ibu/Bapa', 'Wilujeng wengi', 'Hatur nuhun baé'],
      hint: 'Énjing hartina isuk atanapi pagi.',
      outro: 'Saé pisan! Lawang Lembur Pangumbaraan kabuka kalayan hégar.',
    },
    {
      title: 'Sawah & Paribasa Lembur',
      type: 'exploration',
      xp: 25,
      intro: 'Sora suling jeung angklung kadéngé lembut ti saung tengah sawah.',
      prompt: 'Alat musik tradisional Sunda nu dijieun tina awi jeung digeterkeun nyaéta...',
      options: ['Angklung', 'Piano listrik', 'Gitar baja'],
      hint: 'Alat musik ieu ogé jadi artefak utama di dunia Lembur Pangumbaraan!',
      outro: 'Nada angklung ngalir éndah marengan léngkah anjeun.',
    },
    {
      title: 'Pendopo Angklung Pusaka',
      type: 'mission_gate',
      xp: 30,
      intro: 'Anjeun nepi ka pendopo luhur tempat Angklung Pusaka disimpen.',
      prompt: 'Nalika dipasihan pitulung ku réréncangan, urang kudu ngucapkeun...',
      options: ['Hatur nuhun', 'Punten teu hoyong', 'Mangga indit'],
      hint: 'Hatur nuhun hartina terima kasih.',
      outro: 'Hébat! Angklung Pusaka geus kacandak kalayan sampurna.',
    },
  ],
  bahasa_cirebon: [
    {
      title: 'Gapura Keraton Mega Mendung',
      type: 'story',
      xp: 20,
      intro: 'Nyi Sekar menyambut ramah di gapura bercorak awan biru Mega Mendung.',
      prompt: 'Motif batik khas daerah Cirebon yang berbentuk awan berarak disebut...',
      options: ['Batik Mega Mendung', 'Batik Parang Lereng', 'Songket Palembang'],
      hint: 'Namanya sama dengan artefak kebanggaan dunia Tanah Cirebon!',
      outro: 'Leres pisan! Gapura Keraton membuka jalan menuju taman budaya.',
    },
    {
      title: 'Taman Kosakata Basa Cirebon',
      type: 'exploration',
      xp: 25,
      intro: 'Di taman terdapat papan kata unggah-ungguh basa Cirebon sehari-hari.',
      prompt: 'Untuk bertanya dengan sopan kepada orang yang lebih tua atau guru, kita memakai sikap...',
      options: ['Bahasa yang halus dan sopan', 'Berteriak keras', 'Membelakangi pembicara'],
      hint: 'Unggah-ungguh membuat percakapan menjadi rukun dan hormat.',
      outro: 'Pinter! Penjelajah cilik berhasil menjaga kearifan bahasa daerah.',
    },
    {
      title: 'Balai Awan Mega Mendung',
      type: 'mission_gate',
      xp: 30,
      intro: 'Kamu tiba di balai akhir penjelajahan Tanah Cirebon yang sejuk dan asri.',
      prompt: 'Mengucap terima kasih dengan sopan setelah dibantu teman menunjukkan sikap...',
      options: ['Menghargai kebaikan teman', 'Sombong', 'Acuh tak acuh'],
      hint: 'Rasa syukur dan terima kasih menjaga persahabatan tetap erat.',
      outro: 'Awan Mega Mendung bersinar! Jelajah Tanah Cirebon tuntas.',
    },
  ],
};

export function buildDefaultCheckpointsForWorld(
  worldId: string,
  schoolId = 'sdn_pekiringan'
): WorldCheckpointDefinition[] {
  const scripts = WORLD_CHECKPOINT_SCRIPTS[worldId] || WORLD_CHECKPOINT_SCRIPTS.pai;
  return scripts.map((item, idx) => ({
    id: `cp_${worldId}_${idx + 1}`,
    schoolId,
    worldId,
    order: idx + 1,
    title: item.title,
    storyIntro: item.intro,
    storyOutro: item.outro,
    challengePrompt: item.prompt,
    challengeOptions: item.options,
    helpfulHint: item.hint,
    checkpointType: item.type,
    xpReward: item.xp,
    isActive: true,
  }));
}

export const DEFAULT_CHECKPOINTS: WorldCheckpointDefinition[] = WORLD_ADVENTURE_CATALOG.flatMap(
  (w) => buildDefaultCheckpointsForWorld(w.id)
);

export interface StudentActorContext {
  schoolId: string;
  studentId: string;
  studentName: string;
  classId: string;
  gradeClass: string;
  characterId: 'boy' | 'girl';
  subjectId?: string;
  assessmentId?: string;
  participantNumber?: string;
}

export interface AdventureCelebrationDelta {
  xpGranted: number;
  previousTotalXp: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  newLevelTitle: string;
  leveledUp: boolean;
  unlockedBadges: StudentBadgeRecord[];
  reason?: string;
  completedWorldId?: string;
  completedWorldName?: string;
  milestoneReached?: string;
}

export interface ResolvedWorldSummary {
  id: string;
  number: number;
  subjectId: string;
  subjectName: string;
  worldName: string;
  portalName: string;
  zoneTheme: string;
  themeSummary: string;
  companionName: string;
  artifactName: string;
  isAvailable: boolean;
  availabilityReason: string;
  scheduleLabel: string;
  status: AdventureWorldStatus;
  progressPercent: number;
  xpEarned: number;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  hasActiveAssessment: boolean;
  activeAssessmentId?: string;
  configSource: 'firestore' | 'teacher_override' | 'default_catalog';
  relatedBadgeId?: string;
  relatedBadgeName?: string;
  relatedBadgeEarned?: boolean;
  openedAt?: string;
  completedAt?: string;
}

export interface ResolvedCheckpointItem extends WorldCheckpointDefinition {
  status: 'terkunci' | 'terbuka' | 'sedang_dikerjakan' | 'selesai';
  xpAwarded: number;
  startedAt?: string;
  completedAt?: string;
}

const VALID_OUTFITS = new Set<OutfitThemeId>([
  'rimba_emerald',
  'langit_biru',
  'mentari_emas',
  'senja_merah',
]);
const VALID_BAGS = new Set<BagStyleId>(['ransel_kompas', 'tas_peta', 'tas_bintang']);
const VALID_SHOES = new Set<ShoeStyleId>(['sepatu_rimba', 'sepatu_kilat']);

function getLocalDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getAllStudentWorldProgress(
  state: AdventureStoreState,
  schoolId: string,
  studentId: string
): WorldProgressRecord[] {
  return Object.values(state.worldProgress).filter(
    (wp) => wp.schoolId === schoolId && wp.studentId === studentId
  );
}

function getAllStudentCheckpointProgress(
  state: AdventureStoreState,
  schoolId: string,
  studentId: string
): CheckpointProgressRecord[] {
  return Object.values(state.checkpointProgress).filter(
    (cp) => cp.schoolId === schoolId && cp.studentId === studentId
  );
}

function getAllStudentBadges(
  state: AdventureStoreState,
  schoolId: string,
  studentId: string
): StudentBadgeRecord[] {
  return Object.values(state.studentBadges).filter(
    (sb) => sb.schoolId === schoolId && sb.studentId === studentId
  );
}

function createOrGetProfileInState(
  state: AdventureStoreState,
  actor: StudentActorContext,
  nowIso: string
): AdventureProfileRecord {
  const key = makeProfileKey(actor.schoolId, actor.studentId);
  const existing = state.profiles[key];
  const today = getLocalDateKey();

  if (existing) {
    existing.displayName = actor.studentName || existing.displayName;
    existing.classId = actor.classId || existing.classId;
    existing.gradeClass = actor.gradeClass || existing.gradeClass;
    if (!existing.activeDays.includes(today)) {
      existing.activeDays.push(today);
      existing.activeDaysCount = existing.activeDays.length;
    }
    existing.lastActivityDate = today;
    existing.updatedAt = nowIso;
    return existing;
  }

  const levelInfo = computeLevelInfo(0);
  const created: AdventureProfileRecord = {
    id: key,
    schoolId: actor.schoolId,
    studentId: actor.studentId,
    classId: actor.classId,
    gradeClass: actor.gradeClass,
    displayName: actor.studentName,
    characterId: actor.characterId === 'girl' ? 'girl' : 'boy',
    characterSelected: false,
    outfitTheme: 'rimba_emerald',
    bagStyle: 'ransel_kompas',
    shoeStyle: 'sepatu_rimba',
    accentColor: '#0F766E',
    totalXp: 0,
    level: levelInfo.level,
    levelTitle: levelInfo.title,
    worldsExploredCount: 0,
    worldsCompletedCount: 0,
    checkpointsCompletedCount: 0,
    badgesEarnedCount: 0,
    activeDays: [today],
    activeDaysCount: 1,
    lastActivityDate: today,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  state.profiles[key] = created;
  return created;
}

function pushEventIfUnique(state: AdventureStoreState, evt: AdventureEventRecord): void {
  if (state.adventureEvents.some((e) => e.eventId === evt.eventId)) return;
  state.adventureEvents.push(evt);
  if (state.adventureEvents.length > 5000) {
    state.adventureEvents = state.adventureEvents.slice(-5000);
  }
}

function applyIdempotentXp(
  state: AdventureStoreState,
  profile: AdventureProfileRecord,
  params: {
    transactionId: string;
    sourceType: XpSourceType;
    sourceRefId: string;
    worldId?: string;
    amount: number;
    description: string;
    nowIso: string;
  }
): {
  granted: number;
  previousTotalXp: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
} {
  const prevXp = profile.totalXp;
  const prevLevel = profile.level;

  if (state.xpTransactions[params.transactionId]) {
    return {
      granted: 0,
      previousTotalXp: prevXp,
      newTotalXp: prevXp,
      previousLevel: prevLevel,
      newLevel: prevLevel,
      leveledUp: false,
    };
  }

  const cleanAmount = Math.max(0, Math.min(100, Math.round(params.amount)));
  const nextXp = prevXp + cleanAmount;
  const nextInfo = computeLevelInfo(nextXp);

  const tx: XpTransactionRecord = {
    transactionId: params.transactionId,
    schoolId: profile.schoolId,
    studentId: profile.studentId,
    sourceType: params.sourceType,
    sourceRefId: params.sourceRefId,
    ...(params.worldId ? { worldId: params.worldId } : {}),
    amount: cleanAmount,
    previousTotalXp: prevXp,
    newTotalXp: nextXp,
    previousLevel: prevLevel,
    newLevel: nextInfo.level,
    description: params.description.slice(0, 240),
    createdAt: params.nowIso,
  };
  state.xpTransactions[params.transactionId] = tx;

  profile.totalXp = nextXp;
  profile.level = nextInfo.level;
  profile.levelTitle = nextInfo.title;
  profile.updatedAt = params.nowIso;

  pushEventIfUnique(state, {
    eventId: `evt_xp_${params.transactionId}`,
    schoolId: profile.schoolId,
    studentId: profile.studentId,
    eventType: 'XPGranted',
    ...(params.worldId ? { worldId: params.worldId } : {}),
    xpAmount: cleanAmount,
    levelAfter: nextInfo.level,
    detail: params.description,
    createdAt: params.nowIso,
  });

  const leveledUp = nextInfo.level > prevLevel;
  if (leveledUp) {
    pushEventIfUnique(state, {
      eventId: `evt_lvl_${profile.schoolId}_${profile.studentId}_lv${nextInfo.level}`,
      schoolId: profile.schoolId,
      studentId: profile.studentId,
      eventType: 'LevelUp',
      levelAfter: nextInfo.level,
      detail: `Naik ke Level ${nextInfo.level}: ${nextInfo.title}`,
      createdAt: params.nowIso,
    });
  }

  return {
    granted: cleanAmount,
    previousTotalXp: prevXp,
    newTotalXp: nextXp,
    previousLevel: prevLevel,
    newLevel: nextInfo.level,
    leveledUp,
  };
}

const DEFAULT_BADGE_TARGETS: Record<string, number> = {
  si_pemberani: 1,
  penjelajah_konsisten: 3,
  penjelajah_5_dunia: 5,
  penjelajah_10_dunia: 10,
};

function findRelatedBadgeForWorld(
  catalog: Array<BadgeCatalogItem & { isActive: boolean }>,
  worldId: string
): BadgeCatalogItem | undefined {
  if (worldId === 'pancasila') {
    return catalog.find((b) => b.id === 'bintang_kebaikan');
  }
  if (worldId === 'bahasa_cirebon') {
    return catalog.find((b) => b.id === 'budaya_nusantara');
  }
  return catalog.find((b) => b.targetWorldId === worldId);
}

export function getEffectiveBadgeCatalog(
  state: AdventureStoreState,
  schoolId: string
): Array<BadgeCatalogItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }> {
  const cfg = getGamificationConfigForSchool(state, schoolId);
  return BADGE_CATALOG.map((item) => {
    const ov = cfg.badgeOverrides?.[item.id];
    return {
      ...item,
      name: typeof ov?.name === 'string' && ov.name.trim() ? ov.name.trim() : item.name,
      description:
        typeof ov?.description === 'string' && ov.description.trim()
          ? ov.description.trim()
          : item.description,
      targetCount:
        typeof ov?.targetCount === 'number' && ov.targetCount >= 1
          ? Math.round(ov.targetCount)
          : DEFAULT_BADGE_TARGETS[item.id],
      xpThreshold:
        typeof ov?.xpThreshold === 'number' && ov.xpThreshold >= 0
          ? Math.round(ov.xpThreshold)
          : undefined,
      isActive: ov?.isActive !== false,
    };
  });
}

function evaluateAndAwardBadges(
  state: AdventureStoreState,
  profile: AdventureProfileRecord,
  nowIso: string
): StudentBadgeRecord[] {
  const worldProgs = getAllStudentWorldProgress(state, profile.schoolId, profile.studentId);
  const cpProgs = getAllStudentCheckpointProgress(state, profile.schoolId, profile.studentId);
  const effectiveCatalog = getEffectiveBadgeCatalog(state, profile.schoolId);

  const completedWorldIds = new Set(
    worldProgs.filter((wp) => wp.status === 'selesai').map((wp) => wp.worldId)
  );
  const exploredWorldsCount = worldProgs.filter(
    (wp) => wp.status === 'sedang_dijelajahi' || wp.status === 'selesai'
  ).length;
  const completedCpCount = cpProgs.filter((cp) => cp.status === 'selesai').length;

  profile.worldsExploredCount = exploredWorldsCount;
  profile.worldsCompletedCount = completedWorldIds.size;
  profile.checkpointsCompletedCount = completedCpCount;

  const isEligible = (meta: BadgeCatalogItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }) => {
    if (!meta.isActive) return false;
    if (typeof meta.xpThreshold === 'number' && meta.xpThreshold > 0 && profile.totalXp < meta.xpThreshold) {
      return false;
    }
    switch (meta.id) {
      case 'penjelajah_pertama':
        return Boolean(profile.characterSelected);
      case 'si_pemberani':
        return completedCpCount >= (meta.targetCount ?? 1);
      case 'penjelajah_konsisten':
        return profile.activeDaysCount >= 2 || exploredWorldsCount >= (meta.targetCount ?? 3);
      case 'sahabat_alam':
        return completedWorldIds.has('ipas');
      case 'ahli_angka':
        return completedWorldIds.has('matematika');
      case 'pencinta_kata':
        return completedWorldIds.has('bahasa_indonesia');
      case 'seniman_cilik':
        return completedWorldIds.has('seni_rupa');
      case 'bintang_kebaikan':
        return completedWorldIds.has('pai') || completedWorldIds.has('pancasila');
      case 'english_explorer':
        return completedWorldIds.has('bahasa_inggris');
      case 'budaya_nusantara':
        return completedWorldIds.has('bahasa_sunda') || completedWorldIds.has('bahasa_cirebon');
      case 'penjelajah_5_dunia':
        return completedWorldIds.size >= (meta.targetCount ?? 5);
      case 'penjelajah_10_dunia':
        return completedWorldIds.size >= (meta.targetCount ?? 10);
      default:
        return false;
    }
  };

  const newlyUnlocked: StudentBadgeRecord[] = [];
  for (const meta of effectiveCatalog) {
    if (!isEligible(meta)) continue;
    const key = makeStudentBadgeKey(profile.schoolId, profile.studentId, meta.id);
    if (state.studentBadges[key]) continue;

    const eventId = `evt_badge_${key}`;
    const record: StudentBadgeRecord = {
      id: key,
      schoolId: profile.schoolId,
      studentId: profile.studentId,
      badgeId: meta.id,
      badgeName: meta.name,
      badgeCategory: meta.category,
      ...(meta.targetWorldId ? { worldId: meta.targetWorldId } : {}),
      eventId,
      earnedAt: nowIso,
    };
    state.studentBadges[key] = record;
    newlyUnlocked.push(record);

    pushEventIfUnique(state, {
      eventId,
      schoolId: profile.schoolId,
      studentId: profile.studentId,
      eventType: 'BadgeEarned',
      ...(meta.targetWorldId ? { worldId: meta.targetWorldId } : {}),
      badgeId: meta.id,
      detail: `Membuka Lencana "${meta.name}"`,
      createdAt: nowIso,
    });
  }

  profile.badgesEarnedCount = getAllStudentBadges(state, profile.schoolId, profile.studentId).length;
  return newlyUnlocked;
}

export async function loadDynamicCatalogContext(
  schoolId: string,
  options: { staffIdToken?: string; studentSubjectId?: string } = {}
): Promise<{
  worlds: Array<{
    entry: WorldCatalogEntry;
    isAvailable: boolean;
    availabilityReason: string;
    scheduleLabel: string;
    hasActiveAssessment: boolean;
    activeAssessmentId?: string;
    configSource: 'firestore' | 'teacher_override' | 'default_catalog';
  }>;
  checkpointsByWorld: Map<string, WorldCheckpointDefinition[]>;
}> {
  const snapshot = getAdventureStateSnapshot();

  const [fsWorlds, fsCheckpoints, fsPublicAssessments] = await Promise.all([
    fsListCollection<Record<string, unknown>>('adventureWorlds', { idToken: options.staffIdToken }).catch(
      () => []
    ),
    fsListCollection<Record<string, unknown>>('checkpoints', { idToken: options.staffIdToken }).catch(
      () => []
    ),
    fsRunEqualityQuery<Record<string, unknown>>('publicAssessments', [
      { field: 'status', value: 'active' },
    ]).catch(() => []),
  ]);

  const fsWorldMap = new Map<string, Record<string, unknown>>();
  for (const doc of fsWorlds) {
    if (typeof doc.id === 'string' && (!doc.schoolId || doc.schoolId === schoolId)) {
      fsWorldMap.set(doc.id, doc);
    }
  }

  const activeAssessmentBySubject = new Map<string, string>();
  for (const asm of fsPublicAssessments) {
    if (
      typeof asm.id === 'string' &&
      typeof asm.subjectId === 'string' &&
      asm.isLocked !== true &&
      (!asm.schoolId || asm.schoolId === schoolId)
    ) {
      if (!activeAssessmentBySubject.has(asm.subjectId)) {
        activeAssessmentBySubject.set(asm.subjectId, asm.id);
      }
    }
  }

  const worlds = WORLD_ADVENTURE_CATALOG.map((entry) => {
    const fsDoc = fsWorldMap.get(entry.id);
    const override = snapshot.worldOverrides[makeWorldOverrideKey(schoolId, entry.id)];
    const activeAssessmentId = activeAssessmentBySubject.get(entry.id);
    const hasActiveAssessment = Boolean(activeAssessmentId);
    const isLoggedIntoThisSubject = options.studentSubjectId === entry.id;

    let isAvailable = entry.defaultAvailable || hasActiveAssessment || isLoggedIntoThisSubject;
    let availabilityReason = hasActiveAssessment
      ? 'Asesmen aktif dibuka oleh Bapak/Ibu Guru.'
      : isLoggedIntoThisSubject
        ? 'Portal dunia aktif untuk sesi belajarmu hari ini.'
        : entry.defaultAvailabilityReason;
    let scheduleLabel = entry.defaultScheduleLabel;
    let configSource: 'firestore' | 'teacher_override' | 'default_catalog' = 'default_catalog';

    if (fsDoc && typeof fsDoc.isAvailable === 'boolean') {
      isAvailable = fsDoc.isAvailable || hasActiveAssessment || isLoggedIntoThisSubject;
      availabilityReason =
        typeof fsDoc.availabilityReason === 'string' && fsDoc.availabilityReason.trim()
          ? fsDoc.availabilityReason
          : isAvailable
            ? 'Dibuka oleh pengaturan guru di Firestore.'
            : entry.defaultAvailabilityReason;
      scheduleLabel =
        typeof fsDoc.scheduleLabel === 'string' && fsDoc.scheduleLabel.trim()
          ? fsDoc.scheduleLabel
          : scheduleLabel;
      configSource = 'firestore';
    }

    if (override) {
      // Teacher explicit toggle takes immediate authoritative precedence
      isAvailable = override.isAvailable;
      availabilityReason =
        override.availabilityReason ||
        (override.isAvailable
          ? 'Dibuka oleh pengaturan guru SDN Pekiringan.'
          : 'Ditutup sementara oleh pengaturan guru SDN Pekiringan.');
      scheduleLabel = override.scheduleLabel || scheduleLabel;
      configSource = 'teacher_override';
    }

    return {
      entry,
      isAvailable,
      availabilityReason,
      scheduleLabel,
      hasActiveAssessment,
      activeAssessmentId,
      configSource,
    };
  });

  // Merge checkpoints: default catalog + Firestore + teacher custom overrides
  const checkpointsByWorld = new Map<string, WorldCheckpointDefinition[]>();
  for (const entry of WORLD_ADVENTURE_CATALOG) {
    const defaults = buildDefaultCheckpointsForWorld(entry.id, schoolId);
    const map = new Map<string, WorldCheckpointDefinition>();
    for (const cp of defaults) map.set(cp.id, cp);

    for (const fsCp of fsCheckpoints) {
      if (
        typeof fsCp.id === 'string' &&
        fsCp.worldId === entry.id &&
        fsCp.isActive !== false &&
        (!fsCp.schoolId || fsCp.schoolId === schoolId)
      ) {
        const existing = map.get(fsCp.id);
        map.set(fsCp.id, {
          id: fsCp.id,
          schoolId,
          worldId: entry.id,
          order: typeof fsCp.order === 'number' ? fsCp.order : existing?.order || 99,
          title: typeof fsCp.title === 'string' ? fsCp.title : existing?.title || 'Pos Petualangan',
          storyIntro:
            typeof fsCp.storyIntro === 'string'
              ? fsCp.storyIntro
              : existing?.storyIntro || 'Mari jelajahi pos petualangan ini!',
          storyOutro: existing?.storyOutro || 'Hebat! Kamu menyelesaikan pos ini dengan tenang.',
          challengePrompt:
            existing?.challengePrompt || 'Langkah baik apa yang ingin kamu lakukan di pos ini?',
          challengeOptions: existing?.challengeOptions || [
            'Membaca petunjuk dengan cermat',
            'Tetap tenang dan teliti',
          ],
          helpfulHint: existing?.helpfulHint || 'Tidak ada pengurangan poin saat berlatih.',
          checkpointType:
            fsCp.checkpointType === 'story' ||
            fsCp.checkpointType === 'exploration' ||
            fsCp.checkpointType === 'mission_gate'
              ? fsCp.checkpointType
              : existing?.checkpointType || 'exploration',
          xpReward:
            typeof fsCp.xpReward === 'number'
              ? Math.max(5, Math.min(50, Math.round(fsCp.xpReward)))
              : existing?.xpReward || 25,
          isActive: true,
        });
      }
    }

    for (const custom of Object.values(snapshot.customCheckpoints)) {
      if (custom.schoolId === schoolId && custom.worldId === entry.id) {
        if (!custom.isActive) {
          map.delete(custom.id);
        } else {
          map.set(custom.id, {
            id: custom.id,
            schoolId: custom.schoolId,
            worldId: custom.worldId,
            order: custom.order,
            title: custom.title,
            storyIntro: custom.storyIntro,
            storyOutro: custom.storyOutro,
            challengePrompt: custom.challengePrompt,
            challengeOptions: custom.challengeOptions,
            helpfulHint: custom.helpfulHint,
            checkpointType: custom.checkpointType,
            xpReward: Math.max(5, Math.min(50, Math.round(custom.xpReward))),
            isActive: true,
          });
        }
      }
    }

    checkpointsByWorld.set(
      entry.id,
      Array.from(map.values()).sort((a, b) => a.order - b.order)
    );
  }

  return { worlds, checkpointsByWorld };
}

export async function ensureStudentProfileOnLogin(actor: StudentActorContext): Promise<AdventureProfileRecord> {
  const nowIso = new Date().toISOString();
  return mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    return { ...profile };
  });
}

export async function getStudentAdventureCharacter(
  actor: StudentActorContext
): Promise<AdventureProfileRecord> {
  const nowIso = new Date().toISOString();
  return mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    return { ...profile };
  });
}

export async function saveStudentAdventureCharacter(
  actor: StudentActorContext,
  input: {
    characterId?: unknown;
    outfitTheme?: unknown;
    bagStyle?: unknown;
    shoeStyle?: unknown;
    accentColor?: unknown;
    nickname?: unknown;
  }
): Promise<{ profile: AdventureProfileRecord; celebration: AdventureCelebrationDelta }> {
  const nowIso = new Date().toISOString();
  return mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const prevXp = profile.totalXp;
    const prevLevel = profile.level;

    const charId: 'boy' | 'girl' =
      input.characterId === 'girl' ? 'girl' : input.characterId === 'boy' ? 'boy' : profile.characterId;
    profile.characterId = charId;
    profile.characterSelected = true;

    if (typeof input.outfitTheme === 'string' && VALID_OUTFITS.has(input.outfitTheme as OutfitThemeId)) {
      profile.outfitTheme = input.outfitTheme as OutfitThemeId;
    }
    if (typeof input.bagStyle === 'string' && VALID_BAGS.has(input.bagStyle as BagStyleId)) {
      profile.bagStyle = input.bagStyle as BagStyleId;
    }
    if (typeof input.shoeStyle === 'string' && VALID_SHOES.has(input.shoeStyle as ShoeStyleId)) {
      profile.shoeStyle = input.shoeStyle as ShoeStyleId;
    }
    if (typeof input.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.accentColor.trim())) {
      profile.accentColor = input.accentColor.trim();
    }
    if (typeof input.nickname === 'string') {
      const cleanedNick = input.nickname.trim().replace(/[<>]/g, '').slice(0, 32);
      if (cleanedNick) {
        profile.nickname = cleanedNick;
      } else {
        delete profile.nickname;
      }
    }
    profile.updatedAt = nowIso;

    pushEventIfUnique(state, {
      eventId: `evt_char_${profile.schoolId}_${profile.studentId}_first`,
      schoolId: profile.schoolId,
      studentId: profile.studentId,
      eventType: 'CharacterSelected',
      detail: `Memilih karakter ${charId === 'girl' ? 'Laras Penjelajah' : 'Raka Penjelajah'}`,
      createdAt: nowIso,
    });

    const cfg = getGamificationConfigForSchool(state, actor.schoolId);

    const charXp = applyIdempotentXp(state, profile, {
      transactionId: `tx_${profile.schoolId}_${profile.studentId}_char_select`,
      sourceType: 'CharacterSelected',
      sourceRefId: charId,
      amount: cfg.xpCharacterSelect,
      description: 'Hadiah memilih karakter penjelajah untuk pertama kali',
      nowIso,
    });

    const baseXp = applyIdempotentXp(state, profile, {
      transactionId: `tx_${profile.schoolId}_${profile.studentId}_basecamp_first`,
      sourceType: 'BaseCampVisited',
      sourceRefId: 'basecamp',
      amount: cfg.xpBaseCampVisit,
      description: 'Hadiah tiba di Base Camp Penjelajah untuk pertama kali',
      nowIso,
    });

    pushEventIfUnique(state, {
      eventId: `evt_basecamp_${profile.schoolId}_${profile.studentId}_first`,
      schoolId: profile.schoolId,
      studentId: profile.studentId,
      eventType: 'BaseCampVisited',
      detail: 'Masuk ke Base Camp Penjelajah',
      createdAt: nowIso,
    });

    const unlockedBadges = evaluateAndAwardBadges(state, profile, nowIso);
    const totalGranted = charXp.granted + baseXp.granted;

    return {
      profile: { ...profile },
      celebration: {
        xpGranted: totalGranted,
        previousTotalXp: prevXp,
        newTotalXp: profile.totalXp,
        previousLevel: prevLevel,
        newLevel: profile.level,
        newLevelTitle: profile.levelTitle,
        leveledUp: profile.level > prevLevel,
        unlockedBadges,
        reason: totalGranted > 0 ? 'Karakter siap dan Base Camp terbuka!' : 'Tampilan karakter diperbarui.',
      },
    };
  });
}

export async function buildStudentBaseCampPayload(actor: StudentActorContext): Promise<{
  profile: AdventureProfileRecord;
  levelInfo: ComputedLevelInfo;
  worlds: ResolvedWorldSummary[];
  badges: Array<BadgeCatalogItem & { earned: boolean; earnedAt?: string }>;
  recentXpHistory: XpTransactionRecord[];
  recentEvents: AdventureEventRecord[];
  celebration: AdventureCelebrationDelta | null;
}> {
  const catalog = await loadDynamicCatalogContext(actor.schoolId, {
    studentSubjectId: actor.subjectId,
  });
  const nowIso = new Date().toISOString();

  const mutationResult = await mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const prevXp = profile.totalXp;
    const prevLevel = profile.level;

    const cfg = getGamificationConfigForSchool(state, actor.schoolId);
    const effectiveCatalog = getEffectiveBadgeCatalog(state, actor.schoolId);

    let celebration: AdventureCelebrationDelta | null = null;
    if (profile.characterSelected) {
      const visitXp = applyIdempotentXp(state, profile, {
        transactionId: `tx_${profile.schoolId}_${profile.studentId}_basecamp_first`,
        sourceType: 'BaseCampVisited',
        sourceRefId: 'basecamp',
        amount: cfg.xpBaseCampVisit,
        description: 'Hadiah kunjungan pertama ke Base Camp Penjelajah',
        nowIso,
      });

      pushEventIfUnique(state, {
        eventId: `evt_basecamp_${profile.schoolId}_${profile.studentId}_first`,
        schoolId: profile.schoolId,
        studentId: profile.studentId,
        eventType: 'BaseCampVisited',
        detail: 'Mengunjungi Base Camp Penjelajah',
        createdAt: nowIso,
      });

      const unlockedBadges = evaluateAndAwardBadges(state, profile, nowIso);
      if (visitXp.granted > 0 || unlockedBadges.length > 0 || profile.level > prevLevel) {
        celebration = {
          xpGranted: visitXp.granted,
          previousTotalXp: prevXp,
          newTotalXp: profile.totalXp,
          previousLevel: prevLevel,
          newLevel: profile.level,
          newLevelTitle: profile.levelTitle,
          leveledUp: profile.level > prevLevel,
          unlockedBadges,
          reason: 'Selamat datang di Base Camp!',
        };
      }
    }

    const earnedBadgeMap = new Map<string, StudentBadgeRecord>();
    for (const sb of getAllStudentBadges(state, profile.schoolId, profile.studentId)) {
      earnedBadgeMap.set(sb.badgeId, sb);
    }

    const worldProgressMap = new Map<string, WorldProgressRecord>();
    for (const wp of getAllStudentWorldProgress(state, profile.schoolId, profile.studentId)) {
      worldProgressMap.set(wp.worldId, wp);
    }

    const worlds: ResolvedWorldSummary[] = catalog.worlds.map((item) => {
      const wp = worldProgressMap.get(item.entry.id);
      const cps = catalog.checkpointsByWorld.get(item.entry.id) || [];
      let status: AdventureWorldStatus = item.isAvailable ? 'tersedia' : 'belum_tersedia';
      if (wp) {
        if (wp.status === 'selesai') status = 'selesai';
        else if (wp.status === 'sedang_dijelajahi') status = 'sedang_dijelajahi';
        else status = item.isAvailable ? 'tersedia' : 'belum_tersedia';
      }
      const relBadge = findRelatedBadgeForWorld(effectiveCatalog, item.entry.id);
      return {
        id: item.entry.id,
        number: item.entry.number,
        subjectId: item.entry.subjectId,
        subjectName: item.entry.subjectName,
        worldName: item.entry.worldName,
        portalName: item.entry.portalName,
        zoneTheme: item.entry.zoneTheme,
        themeSummary: item.entry.themeSummary,
        companionName: item.entry.companionName,
        artifactName: item.entry.artifactName,
        isAvailable: item.isAvailable,
        availabilityReason: item.availabilityReason,
        scheduleLabel: item.scheduleLabel,
        status,
        progressPercent: wp?.progressPercent || 0,
        xpEarned: wp?.xpEarned || 0,
        checkpointsCompleted: wp?.checkpointsCompleted || 0,
        checkpointsTotal: cps.length,
        hasActiveAssessment: item.hasActiveAssessment,
        activeAssessmentId: item.activeAssessmentId,
        configSource: item.configSource,
        ...(relBadge
          ? {
              relatedBadgeId: relBadge.id,
              relatedBadgeName: relBadge.name,
              relatedBadgeEarned: earnedBadgeMap.has(relBadge.id),
            }
          : {}),
        ...(wp?.openedAt ? { openedAt: wp.openedAt } : {}),
        ...(wp?.completedAt ? { completedAt: wp.completedAt } : {}),
      };
    });

    const badges = effectiveCatalog
      .filter((b) => b.isActive || earnedBadgeMap.has(b.id))
      .map((b) => {
        const earned = earnedBadgeMap.get(b.id);
        return {
          ...b,
          earned: Boolean(earned),
          earnedAt: earned?.earnedAt,
        };
      });

    const recentXpHistory = Object.values(state.xpTransactions)
      .filter((tx) => tx.schoolId === profile.schoolId && tx.studentId === profile.studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);

    const recentEvents = state.adventureEvents
      .filter((ev) => ev.schoolId === profile.schoolId && ev.studentId === profile.studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);

    return {
      profile: { ...profile },
      levelInfo: computeLevelInfo(profile.totalXp),
      worlds,
      badges,
      recentXpHistory,
      recentEvents,
      celebration,
    };
  });

  return mutationResult;
}

export async function getWorldDetailForStudent(
  actor: StudentActorContext,
  worldId: string
): Promise<
  | {
      ok: true;
      world: ResolvedWorldSummary;
      checkpoints: ResolvedCheckpointItem[];
      profile: AdventureProfileRecord;
      levelInfo: ComputedLevelInfo;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const catalog = await loadDynamicCatalogContext(actor.schoolId, {
    studentSubjectId: actor.subjectId,
  });
  const target = catalog.worlds.find((w) => w.entry.id === worldId);
  if (!target) {
    return { ok: false, status: 404, code: 'WORLD_NOT_FOUND', message: 'Dunia tidak ditemukan.' };
  }

  const cps = catalog.checkpointsByWorld.get(worldId) || [];
  const state = getAdventureStateSnapshot();
  const nowIso = new Date().toISOString();
  const profile =
    state.profiles[makeProfileKey(actor.schoolId, actor.studentId)] ||
    (await ensureStudentProfileOnLogin(actor));
  const wp = state.worldProgress[makeWorldProgressKey(actor.schoolId, actor.studentId, worldId)];

  let status: AdventureWorldStatus = target.isAvailable ? 'tersedia' : 'belum_tersedia';
  if (wp) {
    if (wp.status === 'selesai') status = 'selesai';
    else if (wp.status === 'sedang_dijelajahi') status = 'sedang_dijelajahi';
  }

  const checkpoints: ResolvedCheckpointItem[] = cps.map((cp) => {
    const cpProg =
      state.checkpointProgress[makeCheckpointProgressKey(actor.schoolId, actor.studentId, cp.id)];
    const cpStatus: ResolvedCheckpointItem['status'] = !target.isAvailable
      ? 'terkunci'
      : cpProg?.status || 'terbuka';
    return {
      ...cp,
      status: cpStatus,
      xpAwarded: cpProg?.xpAwarded || 0,
      startedAt: cpProg?.startedAt,
      completedAt: cpProg?.completedAt,
    };
  });

  const effectiveCatalog = getEffectiveBadgeCatalog(state, actor.schoolId);
  const relBadge = findRelatedBadgeForWorld(effectiveCatalog, target.entry.id);
  const earnedBadge = relBadge
    ? state.studentBadges[makeStudentBadgeKey(actor.schoolId, actor.studentId, relBadge.id)]
    : undefined;

  void nowIso;
  return {
    ok: true,
    world: {
      id: target.entry.id,
      number: target.entry.number,
      subjectId: target.entry.subjectId,
      subjectName: target.entry.subjectName,
      worldName: target.entry.worldName,
      portalName: target.entry.portalName,
      zoneTheme: target.entry.zoneTheme,
      themeSummary: target.entry.themeSummary,
      companionName: target.entry.companionName,
      artifactName: target.entry.artifactName,
      isAvailable: target.isAvailable,
      availabilityReason: target.availabilityReason,
      scheduleLabel: target.scheduleLabel,
      status,
      progressPercent: wp?.progressPercent || 0,
      xpEarned: wp?.xpEarned || 0,
      checkpointsCompleted: wp?.checkpointsCompleted || 0,
      checkpointsTotal: cps.length,
      hasActiveAssessment: target.hasActiveAssessment,
      activeAssessmentId: target.activeAssessmentId,
      configSource: target.configSource,
      ...(relBadge
        ? {
            relatedBadgeId: relBadge.id,
            relatedBadgeName: relBadge.name,
            relatedBadgeEarned: Boolean(earnedBadge),
          }
        : {}),
      ...(wp?.openedAt ? { openedAt: wp.openedAt } : {}),
      ...(wp?.completedAt ? { completedAt: wp.completedAt } : {}),
    },
    checkpoints,
    profile: { ...profile },
    levelInfo: computeLevelInfo(profile.totalXp),
  };
}

export async function openWorldForStudent(
  actor: StudentActorContext,
  worldId: string
): Promise<
  | {
      ok: true;
      world: ResolvedWorldSummary;
      checkpoints: ResolvedCheckpointItem[];
      profile: AdventureProfileRecord;
      levelInfo: ComputedLevelInfo;
      celebration: AdventureCelebrationDelta;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const catalog = await loadDynamicCatalogContext(actor.schoolId, {
    studentSubjectId: actor.subjectId,
  });
  const target = catalog.worlds.find((w) => w.entry.id === worldId);
  if (!target) {
    return { ok: false, status: 404, code: 'WORLD_NOT_FOUND', message: 'Dunia petualangan tidak ditemukan.' };
  }
  if (!target.isAvailable) {
    return {
      ok: false,
      status: 403,
      code: 'WORLD_UNAVAILABLE',
      message: target.availabilityReason || 'Dunia ini belum dibuka oleh Bapak/Ibu Guru.',
    };
  }

  const cps = catalog.checkpointsByWorld.get(worldId) || [];
  const nowIso = new Date().toISOString();

  const res = await mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const prevXp = profile.totalXp;
    const prevLevel = profile.level;

    const wpKey = makeWorldProgressKey(actor.schoolId, actor.studentId, worldId);
    let wp = state.worldProgress[wpKey];
    if (!wp) {
      wp = {
        id: wpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId,
        status: 'sedang_dijelajahi',
        progressPercent: 0,
        xpEarned: 0,
        checkpointsCompleted: 0,
        checkpointsTotal: cps.length,
        openedAt: nowIso,
        updatedAt: nowIso,
      };
      state.worldProgress[wpKey] = wp;
    } else if (wp.status === 'tersedia' || wp.status === 'belum_tersedia') {
      wp.status = 'sedang_dijelajahi';
      wp.checkpointsTotal = cps.length;
      if (!wp.openedAt) wp.openedAt = nowIso;
      wp.updatedAt = nowIso;
    }

    profile.lastWorldId = worldId;
    profile.updatedAt = nowIso;

    const cfg = getGamificationConfigForSchool(state, actor.schoolId);
    const xpRes = applyIdempotentXp(state, profile, {
      transactionId: `tx_${actor.schoolId}_${actor.studentId}_world_open_${worldId}`,
      sourceType: 'WorldOpened',
      sourceRefId: worldId,
      worldId,
      amount: cfg.xpWorldOpen,
      description: `Membuka gerbang ${target.entry.worldName}`,
      nowIso,
    });
    if (xpRes.granted > 0) {
      wp.xpEarned += xpRes.granted;
    }

    pushEventIfUnique(state, {
      eventId: `evt_world_open_${actor.schoolId}_${actor.studentId}_${worldId}`,
      schoolId: actor.schoolId,
      studentId: actor.studentId,
      eventType: 'WorldOpened',
      worldId,
      detail: `Memasuki ${target.entry.worldName}`,
      createdAt: nowIso,
    });

    const unlockedBadges = evaluateAndAwardBadges(state, profile, nowIso);
    const effectiveCatalog = getEffectiveBadgeCatalog(state, actor.schoolId);
    const relBadge = findRelatedBadgeForWorld(effectiveCatalog, target.entry.id);
    const earnedBadge = relBadge
      ? state.studentBadges[makeStudentBadgeKey(actor.schoolId, actor.studentId, relBadge.id)]
      : undefined;

    const checkpoints: ResolvedCheckpointItem[] = cps.map((cp) => {
      const cpProg =
        state.checkpointProgress[makeCheckpointProgressKey(actor.schoolId, actor.studentId, cp.id)];
      return {
        ...cp,
        status: cpProg?.status || 'terbuka',
        xpAwarded: cpProg?.xpAwarded || 0,
        startedAt: cpProg?.startedAt,
        completedAt: cpProg?.completedAt,
      };
    });

    return {
      world: {
        id: target.entry.id,
        number: target.entry.number,
        subjectId: target.entry.subjectId,
        subjectName: target.entry.subjectName,
        worldName: target.entry.worldName,
        portalName: target.entry.portalName,
        zoneTheme: target.entry.zoneTheme,
        themeSummary: target.entry.themeSummary,
        companionName: target.entry.companionName,
        artifactName: target.entry.artifactName,
        isAvailable: target.isAvailable,
        availabilityReason: target.availabilityReason,
        scheduleLabel: target.scheduleLabel,
        status: wp.status,
        progressPercent: wp.progressPercent,
        xpEarned: wp.xpEarned,
        checkpointsCompleted: wp.checkpointsCompleted,
        checkpointsTotal: cps.length,
        hasActiveAssessment: target.hasActiveAssessment,
        activeAssessmentId: target.activeAssessmentId,
        configSource: target.configSource,
        ...(relBadge
          ? {
              relatedBadgeId: relBadge.id,
              relatedBadgeName: relBadge.name,
              relatedBadgeEarned: Boolean(earnedBadge),
            }
          : {}),
        ...(wp.openedAt ? { openedAt: wp.openedAt } : {}),
        ...(wp.completedAt ? { completedAt: wp.completedAt } : {}),
      },
      checkpoints,
      profile: { ...profile },
      levelInfo: computeLevelInfo(profile.totalXp),
      celebration: {
        xpGranted: xpRes.granted,
        previousTotalXp: prevXp,
        newTotalXp: profile.totalXp,
        previousLevel: prevLevel,
        newLevel: profile.level,
        newLevelTitle: profile.levelTitle,
        leveledUp: profile.level > prevLevel,
        unlockedBadges,
        reason:
          xpRes.granted > 0
            ? `Gerbang ${target.entry.worldName} terbuka!`
            : `Melanjutkan jelajah di ${target.entry.worldName}.`,
      },
    };
  });

  return { ok: true, ...res };
}

function findCheckpointInCatalog(
  checkpointsByWorld: Map<string, WorldCheckpointDefinition[]>,
  checkpointId: string
): WorldCheckpointDefinition | null {
  for (const list of checkpointsByWorld.values()) {
    const found = list.find((c) => c.id === checkpointId);
    if (found) return found;
  }
  return null;
}

export async function startCheckpointForStudent(
  actor: StudentActorContext,
  checkpointId: string
): Promise<
  | {
      ok: true;
      checkpoint: ResolvedCheckpointItem;
      profile: AdventureProfileRecord;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const catalog = await loadDynamicCatalogContext(actor.schoolId, {
    studentSubjectId: actor.subjectId,
  });
  const cpDef = findCheckpointInCatalog(catalog.checkpointsByWorld, checkpointId);
  if (!cpDef) {
    return { ok: false, status: 404, code: 'CHECKPOINT_NOT_FOUND', message: 'Pos checkpoint tidak ditemukan.' };
  }

  const worldMeta = catalog.worlds.find((w) => w.entry.id === cpDef.worldId);
  if (!worldMeta || !worldMeta.isAvailable) {
    return {
      ok: false,
      status: 403,
      code: 'WORLD_UNAVAILABLE',
      message: worldMeta?.availabilityReason || 'Dunia untuk checkpoint ini belum dibuka oleh guru.',
    };
  }

  const nowIso = new Date().toISOString();
  const worldCps = catalog.checkpointsByWorld.get(cpDef.worldId) || [];

  const result = await mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const cpKey = makeCheckpointProgressKey(actor.schoolId, actor.studentId, cpDef.id);
    let cpProg = state.checkpointProgress[cpKey];
    if (!cpProg) {
      cpProg = {
        id: cpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId: cpDef.worldId,
        checkpointId: cpDef.id,
        status: 'sedang_dikerjakan',
        xpAwarded: 0,
        startedAt: nowIso,
        updatedAt: nowIso,
      };
      state.checkpointProgress[cpKey] = cpProg;
    } else if (cpProg.status === 'terbuka') {
      cpProg.status = 'sedang_dikerjakan';
      cpProg.startedAt = cpProg.startedAt || nowIso;
      cpProg.updatedAt = nowIso;
    }

    const wpKey = makeWorldProgressKey(actor.schoolId, actor.studentId, cpDef.worldId);
    if (!state.worldProgress[wpKey]) {
      state.worldProgress[wpKey] = {
        id: wpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId: cpDef.worldId,
        status: 'sedang_dijelajahi',
        progressPercent: 0,
        xpEarned: 0,
        checkpointsCompleted: 0,
        checkpointsTotal: worldCps.length,
        lastCheckpointId: cpDef.id,
        openedAt: nowIso,
        updatedAt: nowIso,
      };
    } else {
      state.worldProgress[wpKey].lastCheckpointId = cpDef.id;
      if (state.worldProgress[wpKey].status !== 'selesai') {
        state.worldProgress[wpKey].status = 'sedang_dijelajahi';
      }
      state.worldProgress[wpKey].updatedAt = nowIso;
    }

    profile.lastWorldId = cpDef.worldId;
    profile.updatedAt = nowIso;

    pushEventIfUnique(state, {
      eventId: `evt_cp_open_${actor.schoolId}_${actor.studentId}_${cpDef.id}`,
      schoolId: actor.schoolId,
      studentId: actor.studentId,
      eventType: 'CheckpointOpened',
      worldId: cpDef.worldId,
      checkpointId: cpDef.id,
      detail: `Membuka pos "${cpDef.title}" di ${worldMeta.entry.worldName}`,
      createdAt: nowIso,
    });

    return {
      checkpoint: {
        ...cpDef,
        status: cpProg.status,
        xpAwarded: cpProg.xpAwarded,
        startedAt: cpProg.startedAt,
        completedAt: cpProg.completedAt,
      },
      profile: { ...profile },
    };
  });

  return { ok: true, ...result };
}

export async function completeCheckpointForStudent(
  actor: StudentActorContext,
  checkpointId: string
): Promise<
  | {
      ok: true;
      checkpoint: ResolvedCheckpointItem;
      world: ResolvedWorldSummary;
      profile: AdventureProfileRecord;
      levelInfo: ComputedLevelInfo;
      celebration: AdventureCelebrationDelta;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const catalog = await loadDynamicCatalogContext(actor.schoolId, {
    studentSubjectId: actor.subjectId,
  });
  const cpDef = findCheckpointInCatalog(catalog.checkpointsByWorld, checkpointId);
  if (!cpDef) {
    return { ok: false, status: 404, code: 'CHECKPOINT_NOT_FOUND', message: 'Pos checkpoint tidak ditemukan.' };
  }

  const worldMeta = catalog.worlds.find((w) => w.entry.id === cpDef.worldId);
  if (!worldMeta || !worldMeta.isAvailable) {
    return {
      ok: false,
      status: 403,
      code: 'WORLD_UNAVAILABLE',
      message: worldMeta?.availabilityReason || 'Dunia untuk checkpoint ini belum dibuka oleh guru.',
    };
  }

  const worldCps = catalog.checkpointsByWorld.get(cpDef.worldId) || [];
  const nowIso = new Date().toISOString();

  const res = await mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const prevXp = profile.totalXp;
    const prevLevel = profile.level;

    const wpKey = makeWorldProgressKey(actor.schoolId, actor.studentId, cpDef.worldId);
    let wp = state.worldProgress[wpKey];
    if (!wp) {
      wp = {
        id: wpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId: cpDef.worldId,
        status: 'sedang_dijelajahi',
        progressPercent: 0,
        xpEarned: 0,
        checkpointsCompleted: 0,
        checkpointsTotal: worldCps.length,
        openedAt: nowIso,
        updatedAt: nowIso,
      };
      state.worldProgress[wpKey] = wp;
    }

    const cfg = getGamificationConfigForSchool(state, actor.schoolId);
    const wasWorldCompleted = wp.status === 'selesai';

    // Ensure WorldOpened XP is also honored if student entered via direct checkpoint
    const worldOpenXp = applyIdempotentXp(state, profile, {
      transactionId: `tx_${actor.schoolId}_${actor.studentId}_world_open_${cpDef.worldId}`,
      sourceType: 'WorldOpened',
      sourceRefId: cpDef.worldId,
      worldId: cpDef.worldId,
      amount: cfg.xpWorldOpen,
      description: `Membuka gerbang ${worldMeta.entry.worldName}`,
      nowIso,
    });
    if (worldOpenXp.granted > 0) {
      wp.xpEarned += worldOpenXp.granted;
    }

    const cpKey = makeCheckpointProgressKey(actor.schoolId, actor.studentId, cpDef.id);
    let cpProg = state.checkpointProgress[cpKey];
    const cpReward = Math.max(5, Math.min(50, Math.round(cpDef.xpReward)));
    const cpXp = applyIdempotentXp(state, profile, {
      transactionId: `tx_${actor.schoolId}_${actor.studentId}_cp_${cpDef.id}`,
      sourceType: 'CheckpointCompleted',
      sourceRefId: cpDef.id,
      worldId: cpDef.worldId,
      amount: cpReward,
      description: `Menyelesaikan pos "${cpDef.title}" di ${worldMeta.entry.worldName}`,
      nowIso,
    });

    if (!cpProg) {
      cpProg = {
        id: cpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId: cpDef.worldId,
        checkpointId: cpDef.id,
        status: 'selesai',
        xpAwarded: cpReward,
        startedAt: nowIso,
        completedAt: nowIso,
        updatedAt: nowIso,
      };
      state.checkpointProgress[cpKey] = cpProg;
    } else {
      cpProg.status = 'selesai';
      cpProg.xpAwarded = Math.max(cpProg.xpAwarded || 0, cpReward);
      cpProg.startedAt = cpProg.startedAt || nowIso;
      cpProg.completedAt = cpProg.completedAt || nowIso;
      cpProg.updatedAt = nowIso;
    }

    if (cpXp.granted > 0) {
      wp.xpEarned += cpXp.granted;
    }

    // Recompute world completion strictly from active checkpoints in that world
    const completedInWorld = worldCps.filter((c) => {
      const p = state.checkpointProgress[makeCheckpointProgressKey(actor.schoolId, actor.studentId, c.id)];
      return p?.status === 'selesai';
    }).length;
    const totalInWorld = worldCps.length || 1;
    wp.checkpointsCompleted = completedInWorld;
    wp.checkpointsTotal = worldCps.length;
    wp.progressPercent = Math.min(100, Math.round((completedInWorld / totalInWorld) * 100));
    wp.lastCheckpointId = cpDef.id;
    if (completedInWorld >= worldCps.length && worldCps.length > 0) {
      wp.status = 'selesai';
      wp.completedAt = wp.completedAt || nowIso;
    } else {
      wp.status = 'sedang_dijelajahi';
    }
    wp.updatedAt = nowIso;

    profile.lastWorldId = cpDef.worldId;
    profile.updatedAt = nowIso;

    pushEventIfUnique(state, {
      eventId: `evt_cp_done_${actor.schoolId}_${actor.studentId}_${cpDef.id}`,
      schoolId: actor.schoolId,
      studentId: actor.studentId,
      eventType: 'CheckpointCompleted',
      worldId: cpDef.worldId,
      checkpointId: cpDef.id,
      xpAmount: cpReward,
      detail: `Menyelesaikan pos "${cpDef.title}" (+${cpReward} XP)`,
      createdAt: nowIso,
    });

    const unlockedBadges = evaluateAndAwardBadges(state, profile, nowIso);
    const totalGranted = worldOpenXp.granted + cpXp.granted;
    const newlyCompletedWorld = !wasWorldCompleted && wp.status === 'selesai';
    const effectiveCatalog = getEffectiveBadgeCatalog(state, actor.schoolId);
    const relBadge = findRelatedBadgeForWorld(effectiveCatalog, worldMeta.entry.id);
    const earnedBadge = relBadge
      ? state.studentBadges[makeStudentBadgeKey(actor.schoolId, actor.studentId, relBadge.id)]
      : undefined;

    return {
      checkpoint: {
        ...cpDef,
        status: cpProg.status,
        xpAwarded: cpProg.xpAwarded,
        startedAt: cpProg.startedAt,
        completedAt: cpProg.completedAt,
      },
      world: {
        id: worldMeta.entry.id,
        number: worldMeta.entry.number,
        subjectId: worldMeta.entry.subjectId,
        subjectName: worldMeta.entry.subjectName,
        worldName: worldMeta.entry.worldName,
        portalName: worldMeta.entry.portalName,
        zoneTheme: worldMeta.entry.zoneTheme,
        themeSummary: worldMeta.entry.themeSummary,
        companionName: worldMeta.entry.companionName,
        artifactName: worldMeta.entry.artifactName,
        isAvailable: worldMeta.isAvailable,
        availabilityReason: worldMeta.availabilityReason,
        scheduleLabel: worldMeta.scheduleLabel,
        status: wp.status,
        progressPercent: wp.progressPercent,
        xpEarned: wp.xpEarned,
        checkpointsCompleted: wp.checkpointsCompleted,
        checkpointsTotal: worldCps.length,
        hasActiveAssessment: worldMeta.hasActiveAssessment,
        activeAssessmentId: worldMeta.activeAssessmentId,
        configSource: worldMeta.configSource,
        ...(relBadge
          ? {
              relatedBadgeId: relBadge.id,
              relatedBadgeName: relBadge.name,
              relatedBadgeEarned: Boolean(earnedBadge),
            }
          : {}),
        ...(wp.openedAt ? { openedAt: wp.openedAt } : {}),
        ...(wp.completedAt ? { completedAt: wp.completedAt } : {}),
      },
      profile: { ...profile },
      levelInfo: computeLevelInfo(profile.totalXp),
      celebration: {
        xpGranted: totalGranted,
        previousTotalXp: prevXp,
        newTotalXp: profile.totalXp,
        previousLevel: prevLevel,
        newLevel: profile.level,
        newLevelTitle: profile.levelTitle,
        leveledUp: profile.level > prevLevel,
        unlockedBadges,
        ...(newlyCompletedWorld
          ? {
              completedWorldId: worldMeta.entry.id,
              completedWorldName: worldMeta.entry.worldName,
            }
          : {}),
        reason: newlyCompletedWorld
          ? `Selamat! Seluruh pos ${worldMeta.entry.worldName} berhasil dituntaskan!`
          : totalGranted > 0
            ? `Pos "${cpDef.title}" selesai!`
            : `Pos "${cpDef.title}" sudah pernah diselesaikan.`,
      },
    };
  });

  return { ok: true, ...res };
}

/**
 * Stage 3 Ready Hook: Called ONLY when a real assessment/exam submission is saved.
 * Never deducts XP for wrong answers, never locks worlds on low scores, and never grants duplicate XP per assessmentId.
 */
export async function recordExamCompletedHook(
  actor: StudentActorContext,
  assessmentId: string,
  worldId: string,
  xpRewardOrMode?: number | 'psas' | 'latihan' | 'simulasi'
): Promise<AdventureCelebrationDelta> {
  const nowIso = new Date().toISOString();
  const worldEntry = WORLD_ADVENTURE_CATALOG.find((w) => w.id === worldId);
  return mutateAdventureState((state) => {
    const profile = createOrGetProfileInState(state, actor, nowIso);
    const prevXp = profile.totalXp;
    const prevLevel = profile.level;
    const cfg = getGamificationConfigForSchool(state, actor.schoolId);

    const rawReward =
      xpRewardOrMode === 'latihan'
        ? cfg.xpExamPractice
        : xpRewardOrMode === 'simulasi'
          ? cfg.xpExamSimulation
          : xpRewardOrMode === 'psas' || xpRewardOrMode === undefined
            ? cfg.xpExamOfficial
            : xpRewardOrMode;
    const cleanReward = Math.max(0, Math.min(100, Math.round(rawReward)));

    const wpKey = makeWorldProgressKey(actor.schoolId, actor.studentId, worldId);
    let wp = state.worldProgress[wpKey];
    const wasWorldCompleted = wp?.status === 'selesai';
    const defaultCps = buildDefaultCheckpointsForWorld(worldId, actor.schoolId);
    if (!wp) {
      wp = {
        id: wpKey,
        schoolId: actor.schoolId,
        studentId: actor.studentId,
        worldId,
        status: 'selesai',
        progressPercent: 100,
        xpEarned: 0,
        checkpointsCompleted: defaultCps.length,
        checkpointsTotal: defaultCps.length,
        openedAt: nowIso,
        completedAt: nowIso,
        updatedAt: nowIso,
      };
      state.worldProgress[wpKey] = wp;
    } else {
      wp.status = 'selesai';
      wp.progressPercent = 100;
      wp.completedAt = wp.completedAt || nowIso;
      wp.updatedAt = nowIso;
    }

    const xpRes = applyIdempotentXp(state, profile, {
      transactionId: `tx_${actor.schoolId}_${actor.studentId}_exam_${assessmentId}`,
      sourceType: 'ExamCompleted',
      sourceRefId: assessmentId,
      worldId,
      amount: cleanReward,
      description: `Menyelesaikan misi asesmen di dunia ${worldEntry?.worldName || worldId}`,
      nowIso,
    });

    if (xpRes.granted > 0) {
      wp.xpEarned += xpRes.granted;
    }
    profile.lastWorldId = worldId;
    profile.updatedAt = nowIso;

    pushEventIfUnique(state, {
      eventId: `evt_exam_done_${actor.schoolId}_${actor.studentId}_${assessmentId}`,
      schoolId: actor.schoolId,
      studentId: actor.studentId,
      eventType: 'CheckpointCompleted',
      worldId,
      xpAmount: xpRes.granted,
      detail: `Menyelesaikan misi asesmen pada dunia ${worldEntry?.worldName || worldId} (+${xpRes.granted} XP)`,
      createdAt: nowIso,
    });

    const unlockedBadges = evaluateAndAwardBadges(state, profile, nowIso);
    const newlyCompletedWorld = !wasWorldCompleted && wp.status === 'selesai';

    return {
      xpGranted: xpRes.granted,
      previousTotalXp: prevXp,
      newTotalXp: profile.totalXp,
      previousLevel: prevLevel,
      newLevel: profile.level,
      newLevelTitle: profile.levelTitle,
      leveledUp: profile.level > prevLevel,
      unlockedBadges,
      ...(newlyCompletedWorld
        ? {
            completedWorldId: worldId,
            completedWorldName: worldEntry?.worldName || worldId,
          }
        : {}),
      reason: newlyCompletedWorld
        ? `Misi asesmen & penjelajahan ${worldEntry?.worldName || worldId} tuntas!`
        : xpRes.granted > 0
          ? 'Misi asesmen berhasil dituntaskan!'
          : 'Asesmen sudah tercatat.',
    };
  });
}

export function getStudentXpAndHistory(actor: StudentActorContext): {
  profile: AdventureProfileRecord | null;
  levelInfo: ComputedLevelInfo;
  transactions: XpTransactionRecord[];
  events: AdventureEventRecord[];
  levelThresholds: LevelThreshold[];
} {
  const state = getAdventureStateSnapshot();
  const profile = state.profiles[makeProfileKey(actor.schoolId, actor.studentId)] || null;
  const totalXp = profile?.totalXp || 0;
  const transactions = Object.values(state.xpTransactions)
    .filter((tx) => tx.schoolId === actor.schoolId && tx.studentId === actor.studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const events = state.adventureEvents
    .filter((ev) => ev.schoolId === actor.schoolId && ev.studentId === actor.studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    profile,
    levelInfo: computeLevelInfo(totalXp),
    transactions,
    events,
    levelThresholds: LEVEL_THRESHOLDS,
  };
}

export function getStudentBadgesView(actor: StudentActorContext): {
  earnedCount: number;
  totalCatalogCount: number;
  badges: Array<BadgeCatalogItem & { earned: boolean; earnedAt?: string }>;
} {
  const state = getAdventureStateSnapshot();
  const effectiveCatalog = getEffectiveBadgeCatalog(state, actor.schoolId);
  const earnedMap = new Map<string, StudentBadgeRecord>();
  for (const sb of getAllStudentBadges(state, actor.schoolId, actor.studentId)) {
    earnedMap.set(sb.badgeId, sb);
  }
  const visibleCatalog = effectiveCatalog.filter((item) => item.isActive || earnedMap.has(item.id));
  const badges = visibleCatalog.map((item) => {
    const earned = earnedMap.get(item.id);
    return {
      ...item,
      earned: Boolean(earned),
      earnedAt: earned?.earnedAt,
    };
  });
  return {
    earnedCount: earnedMap.size,
    totalCatalogCount: visibleCatalog.length,
    badges,
  };
}

// --- TEACHER / ADMIN ADVENTURE MANAGEMENT ---

export async function updateWorldConfigByTeacher(params: {
  schoolId: string;
  worldId: string;
  staffUid: string;
  staffIdToken: string;
  isAvailable: boolean;
  availabilityReason?: string;
  scheduleLabel?: string;
}): Promise<{ ok: true; override: WorldOverrideRecord; firestoreSynced: boolean } | { ok: false; status: number; code: string; message: string }> {
  const worldEntry = WORLD_ADVENTURE_CATALOG.find((w) => w.id === params.worldId);
  if (!worldEntry) {
    return { ok: false, status: 404, code: 'WORLD_NOT_FOUND', message: 'Dunia tidak ditemukan.' };
  }

  const nowIso = new Date().toISOString();
  const reason =
    typeof params.availabilityReason === 'string' && params.availabilityReason.trim()
      ? params.availabilityReason.trim().slice(0, 300)
      : params.isAvailable
        ? 'Dibuka oleh pengaturan guru SDN Pekiringan.'
        : 'Ditutup sementara oleh pengaturan guru SDN Pekiringan.';
  const scheduleLabel =
    typeof params.scheduleLabel === 'string' && params.scheduleLabel.trim()
      ? params.scheduleLabel.trim().slice(0, 120)
      : worldEntry.defaultScheduleLabel;

  const override = await mutateAdventureState((state) => {
    const rec: WorldOverrideRecord = {
      worldId: params.worldId,
      schoolId: params.schoolId,
      isAvailable: params.isAvailable,
      availabilityReason: reason,
      scheduleLabel,
      updatedBy: params.staffUid,
      updatedAt: nowIso,
    };
    state.worldOverrides[makeWorldOverrideKey(params.schoolId, params.worldId)] = rec;
    return rec;
  });

  // Sync catalog doc into Firestore (non-blocking if Firestore fails transiently)
  let firestoreSynced = false;
  try {
    await fsCommitWrites(
      [
        {
          docPath: `adventureWorlds/${worldEntry.id}`,
          mode: 'set',
          data: {
            id: worldEntry.id,
            schoolId: params.schoolId,
            number: worldEntry.number,
            subjectId: worldEntry.subjectId,
            subjectName: worldEntry.subjectName,
            worldName: worldEntry.worldName,
            portalName: worldEntry.portalName,
            zoneTheme: worldEntry.zoneTheme,
            themeSummary: worldEntry.themeSummary,
            companionName: worldEntry.companionName,
            artifactName: worldEntry.artifactName,
            isAvailable: params.isAvailable,
            isActive: true,
            availabilityReason: reason,
            scheduleLabel,
            ownerId: params.staffUid,
          },
          serverTimestampFields: ['updatedAt'],
        },
      ],
      params.staffIdToken
    );
    firestoreSynced = true;
  } catch {
    firestoreSynced = false;
  }

  return { ok: true, override, firestoreSynced };
}

export async function upsertCheckpointByTeacher(params: {
  schoolId: string;
  staffUid: string;
  staffIdToken: string;
  id?: string;
  worldId: string;
  order: number;
  title: string;
  storyIntro: string;
  storyOutro?: string;
  challengePrompt?: string;
  challengeOptions?: string[];
  helpfulHint?: string;
  checkpointType: CheckpointType;
  xpReward: number;
  isActive?: boolean;
}): Promise<{ ok: true; checkpoint: CustomCheckpointRecord; firestoreSynced: boolean } | { ok: false; status: number; code: string; message: string }> {
  const worldEntry = WORLD_ADVENTURE_CATALOG.find((w) => w.id === params.worldId);
  if (!worldEntry) {
    return { ok: false, status: 404, code: 'WORLD_NOT_FOUND', message: 'Dunia tujuan tidak valid.' };
  }
  const cleanTitle = params.title.trim().slice(0, 120);
  if (cleanTitle.length < 2) {
    return { ok: false, status: 400, code: 'INVALID_TITLE', message: 'Judul checkpoint minimal 2 karakter.' };
  }

  const nowIso = new Date().toISOString();
  const cpId =
    params.id && /^[a-zA-Z0-9_-]{2,120}$/.test(params.id)
      ? params.id
      : `cp_${params.worldId}_${Date.now().toString(36)}`;
  const cleanXp = Math.max(5, Math.min(50, Math.round(Number(params.xpReward) || 25)));
  const cleanOrder = Math.max(1, Math.min(50, Math.round(Number(params.order) || 1)));
  const cleanType: CheckpointType =
    params.checkpointType === 'story' || params.checkpointType === 'mission_gate'
      ? params.checkpointType
      : 'exploration';

  const record: CustomCheckpointRecord = await mutateAdventureState((state) => {
    const existing = state.customCheckpoints[cpId];
    const next: CustomCheckpointRecord = {
      id: cpId,
      schoolId: params.schoolId,
      worldId: params.worldId,
      order: cleanOrder,
      title: cleanTitle,
      storyIntro: params.storyIntro.trim().slice(0, 600) || 'Ayo selesaikan pos petualangan ini!',
      storyOutro: (params.storyOutro || 'Hebat! Kamu menyelesaikan pos ini dengan tenang.').trim().slice(0, 400),
      challengePrompt:
        (params.challengePrompt || 'Langkah bijak apa yang perlu kita lakukan di pos ini?').trim().slice(0, 400),
      challengeOptions:
        Array.isArray(params.challengeOptions) && params.challengeOptions.length >= 2
          ? params.challengeOptions.map((o) => String(o).trim().slice(0, 140)).filter(Boolean).slice(0, 4)
          : ['Membaca petunjuk dengan teliti', 'Tetap tenang sebelum melangkah'],
      helpfulHint:
        (params.helpfulHint || 'Tidak ada pengurangan XP di sini. Terus mencoba!').trim().slice(0, 300),
      checkpointType: cleanType,
      xpReward: cleanXp,
      isActive: params.isActive !== false,
      ownerId: existing?.ownerId || params.staffUid,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    state.customCheckpoints[cpId] = next;
    return next;
  });

  let firestoreSynced = false;
  try {
    await fsCommitWrites(
      [
        {
          docPath: `checkpoints/${cpId}`,
          mode: 'set',
          data: {
            id: record.id,
            schoolId: record.schoolId,
            worldId: record.worldId,
            order: record.order,
            title: record.title,
            storyIntro: record.storyIntro,
            checkpointType: record.checkpointType,
            xpReward: record.xpReward,
            isActive: record.isActive,
            ownerId: record.ownerId,
          },
          serverTimestampFields: ['createdAt', 'updatedAt'],
        },
      ],
      params.staffIdToken
    );
    firestoreSynced = true;
  } catch {
    firestoreSynced = false;
  }

  return { ok: true, checkpoint: record, firestoreSynced };
}

export async function deactivateCheckpointByTeacher(params: {
  schoolId: string;
  checkpointId: string;
  staffUid: string;
  staffIdToken: string;
}): Promise<{ ok: true; checkpointId: string } | { ok: false; status: number; code: string; message: string }> {
  const cleanId = params.checkpointId.trim();
  if (!cleanId) {
    return { ok: false, status: 400, code: 'INVALID_CHECKPOINT_ID', message: 'ID checkpoint tidak valid.' };
  }

  const catalog = await loadDynamicCatalogContext(params.schoolId, {
    staffIdToken: params.staffIdToken,
  });
  const found = findCheckpointInCatalog(catalog.checkpointsByWorld, cleanId);
  if (!found) {
    return { ok: false, status: 404, code: 'CHECKPOINT_NOT_FOUND', message: 'Checkpoint tidak ditemukan.' };
  }

  const nowIso = new Date().toISOString();
  await mutateAdventureState((state) => {
    const existing = state.customCheckpoints[cleanId];
    state.customCheckpoints[cleanId] = {
      id: cleanId,
      schoolId: params.schoolId,
      worldId: found.worldId,
      order: found.order,
      title: found.title,
      storyIntro: found.storyIntro,
      storyOutro: found.storyOutro,
      challengePrompt: found.challengePrompt,
      challengeOptions: found.challengeOptions,
      helpfulHint: found.helpfulHint,
      checkpointType: found.checkpointType,
      xpReward: found.xpReward,
      isActive: false,
      ownerId: existing?.ownerId || params.staffUid,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
  });

  try {
    await fsCommitWrites(
      [
        {
          docPath: `checkpoints/${cleanId}`,
          mode: 'update',
          data: { isActive: false },
          updateMaskFields: ['isActive'],
          serverTimestampFields: ['updatedAt'],
        },
      ],
      params.staffIdToken
    );
  } catch {
    // Non-blocking if default catalog checkpoint wasn't seeded in Firestore yet
  }

  return { ok: true, checkpointId: cleanId };
}

export async function syncDefaultAdventureCatalogToFirestore(
  schoolId: string,
  staffUid: string,
  staffIdToken: string
): Promise<{ worldsSynced: number; checkpointsSynced: number; badgesSynced: number }> {
  const snapshot = getAdventureStateSnapshot();
  const worldWrites = WORLD_ADVENTURE_CATALOG.map((w) => {
    const override = snapshot.worldOverrides[makeWorldOverrideKey(schoolId, w.id)];
    return {
      docPath: `adventureWorlds/${w.id}`,
      mode: 'set' as const,
      data: {
        id: w.id,
        schoolId,
        number: w.number,
        subjectId: w.subjectId,
        subjectName: w.subjectName,
        worldName: w.worldName,
        portalName: w.portalName,
        zoneTheme: w.zoneTheme,
        themeSummary: w.themeSummary,
        companionName: w.companionName,
        artifactName: w.artifactName,
        isAvailable: override ? override.isAvailable : w.defaultAvailable,
        isActive: true,
        availabilityReason: override?.availabilityReason || w.defaultAvailabilityReason,
        scheduleLabel: override?.scheduleLabel || w.defaultScheduleLabel,
        ownerId: staffUid,
      },
      serverTimestampFields: ['updatedAt'],
    };
  });

  const cpWrites = DEFAULT_CHECKPOINTS.map((cp) => ({
    docPath: `checkpoints/${cp.id}`,
    mode: 'set' as const,
    data: {
      id: cp.id,
      schoolId,
      worldId: cp.worldId,
      order: cp.order,
      title: cp.title,
      storyIntro: cp.storyIntro,
      checkpointType: cp.checkpointType,
      xpReward: cp.xpReward,
      isActive: true,
      ownerId: staffUid,
    },
    serverTimestampFields: ['createdAt', 'updatedAt'],
  }));

  const badgeWrites = BADGE_CATALOG.map((b) => ({
    docPath: `badges/${b.id}`,
    mode: 'set' as const,
    data: {
      id: b.id,
      schoolId,
      code: b.code,
      name: b.name,
      description: b.description,
      category: b.category,
      iconKey: b.iconKey,
      ...(b.targetWorldId ? { targetWorldId: b.targetWorldId } : {}),
      xpBonus: 0,
      order: b.order,
      isActive: true,
      ownerId: staffUid,
    },
    serverTimestampFields: ['updatedAt'],
  }));

  // Commit in clean batches (< 20 writes each to stay well within Firestore commit limits)
  await fsCommitWrites(worldWrites, staffIdToken);
  for (let i = 0; i < cpWrites.length; i += 15) {
    await fsCommitWrites(cpWrites.slice(i, i + 15), staffIdToken);
  }
  await fsCommitWrites(badgeWrites, staffIdToken);

  return {
    worldsSynced: worldWrites.length,
    checkpointsSynced: cpWrites.length,
    badgesSynced: badgeWrites.length,
  };
}

export async function getTeacherAdventureOverview(
  schoolId: string,
  staffIdToken: string
): Promise<{
  summary: {
    totalActiveExplorers: number;
    characterSelectedCount: number;
    totalCheckpointsCompleted: number;
    totalBadgesEarned: number;
    totalXpGranted: number;
  };
  levelDistribution: Array<{ level: number; title: string; count: number }>;
  badgeSummary: Array<{ id: string; name: string; category: string; earnedCount: number }>;
  worlds: Array<{
    id: string;
    number: number;
    subjectName: string;
    worldName: string;
    isAvailable: boolean;
    availabilityReason: string;
    scheduleLabel: string;
    configSource: string;
    checkpoints: WorldCheckpointDefinition[];
    explorersStartedCount: number;
    explorersCompletedCount: number;
  }>;
  recentExplorers: Array<{
    studentId: string;
    displayName: string;
    gradeClass: string;
    characterId: 'boy' | 'girl';
    characterSelected: boolean;
    level: number;
    levelTitle: string;
    totalXp: number;
    worldsCompletedCount: number;
    badgesEarnedCount: number;
    lastWorldId?: string;
    updatedAt: string;
  }>;
}> {
  const catalog = await loadDynamicCatalogContext(schoolId, { staffIdToken });
  const snapshot = getAdventureStateSnapshot();

  const schoolProfiles = Object.values(snapshot.profiles).filter((p) => p.schoolId === schoolId);
  const schoolWorldProgs = Object.values(snapshot.worldProgress).filter((w) => w.schoolId === schoolId);
  const schoolBadges = Object.values(snapshot.studentBadges).filter((b) => b.schoolId === schoolId);
  const schoolTxs = Object.values(snapshot.xpTransactions).filter((t) => t.schoolId === schoolId);

  const levelCounts = new Map<number, number>();
  for (const p of schoolProfiles) {
    levelCounts.set(p.level, (levelCounts.get(p.level) || 0) + 1);
  }
  const levelDistribution = LEVEL_THRESHOLDS.map((lvl) => ({
    level: lvl.level,
    title: lvl.title,
    count: levelCounts.get(lvl.level) || 0,
  }));

  const effectiveCatalog = getEffectiveBadgeCatalog(snapshot, schoolId);
  const badgeCounts = new Map<string, number>();
  for (const b of schoolBadges) {
    badgeCounts.set(b.badgeId, (badgeCounts.get(b.badgeId) || 0) + 1);
  }
  const badgeSummary = effectiveCatalog.map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    earnedCount: badgeCounts.get(b.id) || 0,
  }));

  const worlds = catalog.worlds.map((w) => {
    const progs = schoolWorldProgs.filter((wp) => wp.worldId === w.entry.id);
    return {
      id: w.entry.id,
      number: w.entry.number,
      subjectName: w.entry.subjectName,
      worldName: w.entry.worldName,
      isAvailable: w.isAvailable,
      availabilityReason: w.availabilityReason,
      scheduleLabel: w.scheduleLabel,
      configSource: w.configSource,
      checkpoints: catalog.checkpointsByWorld.get(w.entry.id) || [],
      explorersStartedCount: progs.filter(
        (p) => p.status === 'sedang_dijelajahi' || p.status === 'selesai'
      ).length,
      explorersCompletedCount: progs.filter((p) => p.status === 'selesai').length,
    };
  });

  const recentExplorers = [...schoolProfiles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40)
    .map((p) => ({
      studentId: p.studentId,
      displayName: p.displayName,
      gradeClass: p.gradeClass,
      characterId: p.characterId,
      characterSelected: p.characterSelected,
      level: p.level,
      levelTitle: p.levelTitle,
      totalXp: p.totalXp,
      worldsCompletedCount: p.worldsCompletedCount,
      badgesEarnedCount: p.badgesEarnedCount,
      lastWorldId: p.lastWorldId,
      updatedAt: p.updatedAt,
    }));

  return {
    summary: {
      totalActiveExplorers: schoolProfiles.length,
      characterSelectedCount: schoolProfiles.filter((p) => p.characterSelected).length,
      totalCheckpointsCompleted: schoolProfiles.reduce(
        (sum, p) => sum + p.checkpointsCompletedCount,
        0
      ),
      totalBadgesEarned: schoolBadges.length,
      totalXpGranted: schoolTxs.reduce((sum, t) => sum + t.amount, 0),
    },
    levelDistribution,
    badgeSummary,
    worlds,
    recentExplorers,
  };
}

// =========================================================================
// STAGE 5: ADMIN GAMIFICATION CONFIG & TEACHER ADVENTURE PROGRESS REPORT
// =========================================================================

export function getAdminGamificationConfigEngine(schoolId: string): {
  config: GamificationConfig;
  levelThresholds: LevelThreshold[];
  effectiveBadges: Array<BadgeCatalogItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }>;
} {
  const state = getAdventureStateSnapshot();
  return {
    config: getGamificationConfigForSchool(state, schoolId),
    levelThresholds: LEVEL_THRESHOLDS,
    effectiveBadges: getEffectiveBadgeCatalog(state, schoolId),
  };
}

function clampXpRule(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export async function updateAdminGamificationConfigEngine(params: {
  schoolId: string;
  staffUid: string;
  staffDisplayName?: string;
  staffIdToken?: string;
  input: Record<string, unknown>;
}): Promise<{
  ok: true;
  config: GamificationConfig;
  effectiveBadges: Array<BadgeCatalogItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }>;
  firestoreSynced: boolean;
}> {
  const nowIso = new Date().toISOString();
  const nextConfig = await mutateAdventureState((state) => {
    const prev = getGamificationConfigForSchool(state, params.schoolId);
    const nextOverrides: Record<string, BadgeRuleConfig> = { ...prev.badgeOverrides };

    if (Array.isArray(params.input.badges)) {
      for (const item of params.input.badges) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const badgeId = typeof row.id === 'string' ? row.id.trim() : '';
        const catalogMeta = BADGE_CATALOG.find((b) => b.id === badgeId);
        if (!catalogMeta) continue;
        const override: BadgeRuleConfig = {
          id: badgeId,
          ...(typeof row.name === 'string' && row.name.trim()
            ? { name: row.name.trim().slice(0, 80) }
            : {}),
          ...(typeof row.description === 'string' && row.description.trim()
            ? { description: row.description.trim().slice(0, 260) }
            : {}),
          ...(typeof row.targetCount === 'number' && Number.isFinite(row.targetCount) && row.targetCount >= 1
            ? { targetCount: Math.max(1, Math.min(20, Math.round(row.targetCount))) }
            : {}),
          ...(typeof row.xpThreshold === 'number' && Number.isFinite(row.xpThreshold) && row.xpThreshold >= 0
            ? { xpThreshold: Math.max(0, Math.min(10000, Math.round(row.xpThreshold))) }
            : {}),
          isActive: row.isActive !== false,
        };
        nextOverrides[badgeId] = override;
      }
    }

    const updated: GamificationConfig = {
      schoolId: params.schoolId,
      xpBaseCampVisit: clampXpRule(params.input.xpBaseCampVisit, prev.xpBaseCampVisit),
      xpCharacterSelect: clampXpRule(params.input.xpCharacterSelect, prev.xpCharacterSelect),
      xpWorldOpen: clampXpRule(params.input.xpWorldOpen, prev.xpWorldOpen),
      xpExamOfficial: clampXpRule(params.input.xpExamOfficial, prev.xpExamOfficial),
      xpExamPractice: clampXpRule(params.input.xpExamPractice, prev.xpExamPractice),
      xpExamSimulation: clampXpRule(params.input.xpExamSimulation, prev.xpExamSimulation),
      badgeOverrides: nextOverrides,
      updatedBy: params.staffUid,
      updatedAt: nowIso,
    };
    state.gamificationConfigs[params.schoolId] = updated;
    return updated;
  });

  const effectiveBadges = getEffectiveBadgeCatalog(getAdventureStateSnapshot(), params.schoolId);

  let firestoreSynced = false;
  if (params.staffIdToken) {
    try {
      const logId = `log_gamify_${Date.now().toString(36)}`;
      const writes: Parameters<typeof fsCommitWrites>[0] = [
        ...effectiveBadges.map((b) => ({
          docPath: `badges/${b.id}`,
          mode: 'set' as const,
          data: {
            id: b.id,
            schoolId: params.schoolId,
            code: b.code,
            name: b.name,
            description: b.description,
            category: b.category,
            iconKey: b.iconKey,
            ...(b.targetWorldId ? { targetWorldId: b.targetWorldId } : {}),
            xpBonus: 0,
            order: b.order,
            isActive: b.isActive,
            ownerId: params.staffUid,
          },
          serverTimestampFields: ['updatedAt'],
        })),
        {
          docPath: `auditLogs/${logId}`,
          mode: 'create' as const,
          data: {
            id: logId,
            schoolId: params.schoolId,
            actorType: 'admin',
            actorId: params.staffUid,
            actorName: params.staffDisplayName || 'Administrator',
            action: 'ADMIN_GAMIFICATION_CONFIG_UPDATED',
            targetCollection: 'badges',
            targetId: params.schoolId,
            status: 'success',
            detail: `XP BaseCamp=${nextConfig.xpBaseCampVisit}, ExamOfficial=${nextConfig.xpExamOfficial}, Practice=${nextConfig.xpExamPractice}`,
          },
          serverTimestampFields: ['createdAt'],
        },
      ];
      await fsCommitWrites(writes, params.staffIdToken);
      firestoreSynced = true;
    } catch {
      firestoreSynced = false;
    }
  }

  return {
    ok: true,
    config: nextConfig,
    effectiveBadges,
    firestoreSynced,
  };
}

export interface AdventureProgressExplorerRow {
  studentId: string;
  displayName: string;
  gradeClass: string;
  characterId: 'boy' | 'girl';
  characterSelected: boolean;
  totalXp: number;
  level: number;
  levelTitle: string;
  worldsExploredCount: number;
  worldsCompletedCount: number;
  checkpointsCompletedCount: number;
  badgesEarnedCount: number;
  earnedBadgeNames: string[];
  activeDaysCount: number;
  lastWorldId?: string;
  lastWorldName?: string;
  lastActivityDate: string;
  worldStatuses: Record<string, AdventureWorldStatus>;
}

export function getTeacherAdventureProgressReport(
  schoolId: string,
  filters?: { classFilter?: string; search?: string; levelFilter?: number }
): {
  summary: {
    totalExplorers: number;
    characterSelectedCount: number;
    averageXp: number;
    averageLevel: number;
    totalWorldsCompleted: number;
    totalCheckpointsCompleted: number;
    totalBadgesEarned: number;
  };
  explorers: AdventureProgressExplorerRow[];
  worldsCatalog: Array<{ id: string; number: number; subjectName: string; worldName: string }>;
} {
  const state = getAdventureStateSnapshot();
  const classFilter = filters?.classFilter?.trim().toLowerCase() || '';
  const searchFilter = filters?.search?.trim().toLowerCase() || '';
  const levelFilter =
    typeof filters?.levelFilter === 'number' && filters.levelFilter >= 1 ? filters.levelFilter : null;

  const profiles = Object.values(state.profiles).filter((p) => {
    if (p.schoolId !== schoolId) return false;
    if (classFilter && classFilter !== 'all' && p.gradeClass.toLowerCase() !== classFilter) return false;
    if (levelFilter && p.level !== levelFilter) return false;
    if (
      searchFilter &&
      !p.displayName.toLowerCase().includes(searchFilter) &&
      !p.gradeClass.toLowerCase().includes(searchFilter)
    ) {
      return false;
    }
    return true;
  });

  const worldMap = new Map(WORLD_ADVENTURE_CATALOG.map((w) => [w.id, w]));

  const explorers: AdventureProgressExplorerRow[] = profiles
    .map((p) => {
      const worldProgs = getAllStudentWorldProgress(state, schoolId, p.studentId);
      const worldStatuses: Record<string, AdventureWorldStatus> = {};
      for (const w of WORLD_ADVENTURE_CATALOG) {
        const match = worldProgs.find((wp) => wp.worldId === w.id);
        worldStatuses[w.id] = match ? match.status : w.defaultAvailable ? 'tersedia' : 'belum_tersedia';
      }
      const studentBadges = getAllStudentBadges(state, schoolId, p.studentId).sort((a, b) =>
        a.earnedAt.localeCompare(b.earnedAt)
      );

      return {
        studentId: p.studentId,
        displayName: p.displayName,
        gradeClass: p.gradeClass,
        characterId: p.characterId,
        characterSelected: p.characterSelected,
        totalXp: p.totalXp,
        level: p.level,
        levelTitle: p.levelTitle,
        worldsExploredCount: p.worldsExploredCount,
        worldsCompletedCount: p.worldsCompletedCount,
        checkpointsCompletedCount: p.checkpointsCompletedCount,
        badgesEarnedCount: studentBadges.length,
        earnedBadgeNames: studentBadges.map((sb) => sb.badgeName),
        activeDaysCount: p.activeDaysCount,
        lastWorldId: p.lastWorldId,
        lastWorldName: p.lastWorldId ? worldMap.get(p.lastWorldId)?.worldName : undefined,
        lastActivityDate: p.lastActivityDate,
        worldStatuses,
      };
    })
    // Alphabetical non-competitive ordering by class & name
    .sort((a, b) => a.gradeClass.localeCompare(b.gradeClass) || a.displayName.localeCompare(b.displayName));

  const totalExplorers = explorers.length;
  const totalXpSum = explorers.reduce((sum, e) => sum + e.totalXp, 0);
  const totalLevelSum = explorers.reduce((sum, e) => sum + e.level, 0);

  return {
    summary: {
      totalExplorers,
      characterSelectedCount: explorers.filter((e) => e.characterSelected).length,
      averageXp: totalExplorers > 0 ? Math.round(totalXpSum / totalExplorers) : 0,
      averageLevel: totalExplorers > 0 ? Math.round((totalLevelSum / totalExplorers) * 10) / 10 : 0,
      totalWorldsCompleted: explorers.reduce((sum, e) => sum + e.worldsCompletedCount, 0),
      totalCheckpointsCompleted: explorers.reduce((sum, e) => sum + e.checkpointsCompletedCount, 0),
      totalBadgesEarned: explorers.reduce((sum, e) => sum + e.badgesEarnedCount, 0),
    },
    explorers,
    worldsCatalog: WORLD_ADVENTURE_CATALOG.map((w) => ({
      id: w.id,
      number: w.number,
      subjectName: w.subjectName,
      worldName: w.worldName,
    })),
  };
}

