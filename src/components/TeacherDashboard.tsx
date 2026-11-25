import React, { useEffect, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  Database,
  FilePlus2,
  FileText,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { auth, testConnection } from '../lib/firebase';
import {
  fetchAdminDashboardSummary,
  fetchBackendHealth,
  fetchCurrentStaffMe,
  fetchTeacherDashboardSummary,
  type AdminDashboardApiResponse,
  type TeacherDashboardApiResponse,
} from '../services/apiClient';
import {
  ensureTeacherProfile,
  getAppSettings,
  saveAppSettings,
  seedSchoolFoundationToFirestore,
  subscribeAuditLogs,
  subscribeClasses,
  subscribeQuestionBank,
  subscribeRoster,
  subscribeTeacherAssessments,
  subscribeTeacherResults,
  subscribeTeacherSessions,
} from '../services/firestoreService';
import { AdventureNotice } from './adventure';
import { TeacherLoginPage } from './pages/TeacherLoginPage';
import { AdventureEnginePanel } from './teacher/AdventureEnginePanel';
import { AssessmentManager } from './teacher/AssessmentManager';
import { QuestionBankView } from './teacher/QuestionBankView';
import { ReportsAnalyticsHub } from './teacher/ReportsAnalyticsHub';
import { ResultsAnalyticsView } from './teacher/ResultsAnalyticsView';
import { RosterManager } from './teacher/RosterManager';
import { TeacherFeaturePlaceholder } from './teacher/TeacherFeaturePlaceholder';
import {
  DEFAULT_SCHOOL_NAME,
  type AccessibilityPreferences,
  type AppSettings,
  type AssessmentConfig,
  type AssessmentResult,
  type AssessmentSession,
  type AuditLogEntry,
  type ClassRoom,
  type QuestionBankItem,
  type RosterStudent,
  type UserRole,
} from '../types/psas';

interface TeacherDashboardProps {
  currentUser: User | null;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onOpenGuide: () => void;
  onBackFromLogin?: () => void;
  onExitToStudent: () => void;
}

type TeacherNavTab =
  | 'overview'
  | 'roster'
  | 'bank'
  | 'assessments'
  | 'schedule'
  | 'adventure'
  | 'results'
  | 'reports'
  | 'settings'
  | 'audit';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  currentUser,
  prefs,
  onUpdatePrefs,
  onOpenGuide,
  onBackFromLogin,
  onExitToStudent,
}) => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');
  const [userRole, setUserRole] = useState<UserRole>('teacher');

  const [activeTab, setActiveTab] = useState<TeacherNavTab>('overview');

  const [assessments, setAssessments] = useState<AssessmentConfig[]>([]);
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [sessions, setSessions] = useState<AssessmentSession[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [systemHealth, setSystemHealth] = useState<{
    firestoreOnline: boolean | null;
    backendOnline: boolean | null;
    geminiConfigured: boolean | null;
    backendAuthVerified: boolean | null;
    backendError: string | null;
  }>({
    firestoreOnline: null,
    backendOnline: null,
    geminiConfigured: null,
    backendAuthVerified: null,
    backendError: null,
  });
  const [backendSummary, setBackendSummary] = useState<TeacherDashboardApiResponse['summary'] | null>(null);
  const [adminDashboardInfo, setAdminDashboardInfo] = useState<AdminDashboardApiResponse | null>(null);

  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!currentUser) {
        setAuthStatus('unauthorized');
        return;
      }
      setAuthStatus('checking');
      try {
        const res = await ensureTeacherProfile(currentUser);
        if (!active) return;
        setAuthStatus(res.isAuthorized ? 'authorized' : 'unauthorized');
        if (res.role) setUserRole(res.role);

        if (res.isAuthorized) {
          try {
            const me = await fetchCurrentStaffMe();
            if (active) {
              setUserRole(me.role);
              setSystemHealth((prev) => ({ ...prev, backendAuthVerified: true, backendError: null }));
            }
          } catch (apiErr) {
            if (active) {
              setSystemHealth((prev) => ({
                ...prev,
                backendAuthVerified: false,
                backendError:
                  apiErr instanceof Error ? apiErr.message : 'Verifikasi token server belum merespons.',
              }));
            }
          }
        }
      } catch {
        if (active) setAuthStatus('unauthorized');
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (authStatus !== 'authorized') return;
    const unsubAsm = subscribeTeacherAssessments(setAssessments);
    const unsubBank = subscribeQuestionBank(setBankItems);
    const unsubClasses = subscribeClasses(setClasses);
    const unsubRoster = subscribeRoster(setRoster);
    const unsubSessions = subscribeTeacherSessions(setSessions);
    const unsubResults = subscribeTeacherResults(setResults);
    const unsubAudit = subscribeAuditLogs(setAuditLogs);
    void getAppSettings().then(setSettings);

    // Real system & backend API checks
    void testConnection().then((res) =>
      setSystemHealth((prev) => ({ ...prev, firestoreOnline: res.online }))
    );

    void fetchBackendHealth()
      .then((data) => {
        setSystemHealth((prev) => ({
          ...prev,
          backendOnline: data.status === 'ok',
          geminiConfigured: Boolean(data.geminiConfigured),
          firestoreOnline: data.firestoreConnected ? true : prev.firestoreOnline,
        }));
      })
      .catch(() => {
        setSystemHealth((prev) => ({ ...prev, backendOnline: false, geminiConfigured: false }));
      });

    void fetchTeacherDashboardSummary()
      .then((data) => {
        setBackendSummary(data.summary);
        setSystemHealth((prev) => ({ ...prev, backendAuthVerified: true, backendError: null }));
      })
      .catch((err) => {
        setSystemHealth((prev) => ({
          ...prev,
          backendError: err instanceof Error ? err.message : 'Ringkasan API guru belum tersedia.',
        }));
      });

    if (userRole === 'admin') {
      void fetchAdminDashboardSummary()
        .then(setAdminDashboardInfo)
        .catch(() => {
          setAdminDashboardInfo(null);
        });
    }

    return () => {
      unsubAsm();
      unsubBank();
      unsubClasses();
      unsubRoster();
      unsubSessions();
      unsubResults();
      unsubAudit();
    };
  }, [authStatus, userRole]);

  async function handleSeedSchoolFoundation() {
    if (!currentUser || userRole !== 'admin') return;
    setIsSeeding(true);
    setSeedMessage('');
    try {
      const outcome = await seedSchoolFoundationToFirestore(currentUser.uid);
      if (!outcome.schoolCreated && !outcome.settingsCreated && outcome.subjectsSeeded === 0) {
        setSeedMessage(
          'Fondasi SDN Pekiringan & 10 mata pelajaran resmi sudah tersedia di Firestore (tidak ada duplikasi yang dibuat).'
        );
      } else {
        setSeedMessage(
          `Inisialisasi idempoten berhasil: profil sekolah ${outcome.schoolCreated ? 'dibuat' : 'sudah ada'}, pengaturan ${outcome.settingsCreated ? 'dibuat' : 'sudah ada'}, dan ${outcome.subjectsSeeded} mata pelajaran ditambahkan.`
        );
      }
      void getAppSettings().then(setSettings);
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || !currentUser) return;
    setSavingSettings(true);
    try {
      await saveAppSettings(
        {
          schoolId: settings.schoolId,
          schoolName: settings.schoolName,
          defaultIntroStory: settings.defaultIntroStory,
          defaultKkm: settings.defaultKkm,
        },
        currentUser.uid
      );
      setSeedMessage('Pengaturan sekolah berhasil disimpan.');
    } finally {
      setSavingSettings(false);
    }
  }

  if (!currentUser || authStatus !== 'authorized') {
    return (
      <TeacherLoginPage
        currentUser={currentUser}
        authStatus={authStatus}
        prefs={prefs}
        onUpdatePrefs={onUpdatePrefs}
        onBack={onBackFromLogin || onExitToStudent}
        onBackHome={onExitToStudent}
        onOpenGuide={onOpenGuide}
      />
    );
  }

  const firestoreConnected = systemHealth.firestoreOnline === true;
  const firestoreChecking = systemHealth.firestoreOnline === null;

  const activeAssessmentsCount =
    backendSummary?.activeAssessmentCount ?? assessments.filter((a) => a.status === 'active').length;
  const closedAssessmentsCount =
    backendSummary?.closedAssessmentCount ?? assessments.filter((a) => a.status === 'closed').length;
  const completedSessionsCount =
    backendSummary?.completedSessionCount ?? sessions.filter((s) => s.status !== 'in_progress').length;
  const inProgressSessionsCount =
    backendSummary?.inProgressSessionCount ?? sessions.filter((s) => s.status === 'in_progress').length;
  const totalStudentsCount = backendSummary?.studentCount ?? roster.length;
  const totalClassesCount = backendSummary?.classCount ?? classes.length;

  const passThreshold = settings?.defaultKkm ?? 75;
  const averageResultScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.finalScore || 0), 0) / results.length)
      : backendSummary?.averageScore ?? null;
  const passedResultsCount = results.filter((r) => (r.finalScore || 0) >= passThreshold).length;

  const schoolDisplayName = settings?.schoolName || DEFAULT_SCHOOL_NAME;
  const teacherGreetingName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Bapak/Ibu Guru';

  const navItems: Array<{ id: TeacherNavTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'roster', label: 'Data Siswa', icon: <Users className="w-4 h-4" /> },
    { id: 'bank', label: 'Bank Soal', icon: <Database className="w-4 h-4" /> },
    { id: 'assessments', label: 'Buat Asesmen', icon: <FilePlus2 className="w-4 h-4" /> },
    { id: 'schedule', label: 'Jadwal PSAS', icon: <Calendar className="w-4 h-4" /> },
    { id: 'adventure', label: 'Adventure Engine', icon: <Compass className="w-4 h-4" /> },
    { id: 'results', label: 'Hasil Penilaian', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'reports', label: 'Laporan', icon: <FileText className="w-4 h-4" /> },
    { id: 'settings', label: 'Pengaturan', icon: <Settings className="w-4 h-4" /> },
  ];

  const activeTabLabel =
    navItems.find((n) => n.id === activeTab)?.label ||
    (activeTab === 'audit' ? 'Log Aktivitas' : 'Dashboard');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="no-print w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-5 h-16 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-display font-extrabold text-sm sm:text-base text-slate-900 block leading-none truncate">
              PSAS ADVENTURE
            </span>
            <span className="text-[11px] font-semibold text-teal-700 block mt-0.5 truncate">
              Ruang Guru · {schoolDisplayName}
            </span>
          </div>
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExitToStudent}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-teal-700"
            >
              Mode Siswa
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700"
            >
              Keluar
            </button>
          </div>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block mt-auto p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">
              {currentUser.displayName || 'Guru'} ({userRole === 'admin' ? 'Admin' : 'Guru'})
            </p>
            <p className="text-slate-500 truncate">{currentUser.email}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onExitToStudent}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Lihat Peta Siswa
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print min-h-[64px] bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500 flex items-center gap-2 min-w-0">
            <span className="font-semibold text-teal-700 truncate">PSAS ADVENTURE</span>
            <span aria-hidden="true">·</span>
            <span className="hidden sm:inline truncate">{schoolDisplayName}</span>
            <span className="hidden sm:inline" aria-hidden="true">/</span>
            <span className="font-semibold text-slate-900 truncate">{activeTabLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {userRole === 'admin' && (
              <button
                type="button"
                disabled={isSeeding}
                onClick={() => void handleSeedSchoolFoundation()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 text-xs font-semibold hover:bg-teal-100 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isSeeding ? 'Menginisialisasi...' : 'Inisialisasi Sekolah & 10 Mapel'}
              </button>
            )}
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {seedMessage && (
            <div className="no-print bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-900 font-medium">
              {seedMessage}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Honest Firebase Offline Notice */}
              {systemHealth.firestoreOnline === false && (
                <AdventureNotice
                  variant="warning"
                  title="Cloud Firestore Belum Terhubung"
                  message="Data siswa, jumlah asesmen, dan hasil penilaian dari database belum tersedia saat ini. Angka statistik sengaja tidak ditampilkan agar tidak menampilkan data palsu."
                />
              )}

              {systemHealth.backendError && (
                <AdventureNotice
                  variant="info"
                  title="Info Sinkronisasi Server API"
                  message={systemHealth.backendError}
                />
              )}

              {/* Teacher Greeting, School Identity & Real System Status */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-teal-700">
                        PSAS ADVENTURE · {schoolDisplayName}
                      </p>
                      <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate">
                        Selamat datang, {teacherGreetingName}!
                      </h1>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Kelas 3 SD · Kurikulum Merdeka · Peran {userRole === 'admin' ? 'Administrator' : 'Guru'}
                        {adminDashboardInfo ? ` · ${adminDashboardInfo.counts.subjects} Mapel Terdaftar` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-2.5">
                  <p className="text-xs font-bold text-slate-700">Status Layanan Aktual</p>
                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Database className="w-3.5 h-3.5 text-teal-700" />
                        Cloud Firestore
                      </span>
                      <span
                        className={`font-semibold ${
                          systemHealth.firestoreOnline ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {systemHealth.firestoreOnline === null
                          ? 'Memeriksa...'
                          : systemHealth.firestoreOnline
                            ? 'Terhubung'
                            : 'Belum terhubung'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Server className="w-3.5 h-3.5 text-teal-700" />
                        Backend API & Verifikasi Token
                      </span>
                      <span
                        className={`font-semibold ${
                          systemHealth.backendOnline && systemHealth.backendAuthVerified
                            ? 'text-emerald-700'
                            : systemHealth.backendOnline
                              ? 'text-amber-700'
                              : 'text-rose-600'
                        }`}
                      >
                        {systemHealth.backendOnline === null
                          ? 'Memeriksa...'
                          : systemHealth.backendOnline
                            ? systemHealth.backendAuthVerified
                              ? 'Terverifikasi'
                              : 'Aktif (Menunggu Token)'
                            : 'Tidak Terjangkau'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        Firebase Storage
                      </span>
                      <span className="font-semibold text-amber-700">
                        Siap (Perlu Aktivasi Console)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Honest KPI Cards (No fake numbers if Firebase is offline/checking) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">Jumlah Siswa</p>
                  <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                    {firestoreChecking ? '...' : firestoreConnected ? totalStudentsCount : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {firestoreChecking
                      ? 'Memeriksa database...'
                      : firestoreConnected
                        ? totalClassesCount > 0
                          ? `Tersebar di ${totalClassesCount} kelas aktif`
                          : 'Belum ada data kelas'
                        : 'Data belum tersedia'}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">Jumlah Asesmen Aktif</p>
                  <p className="font-mono-tabular text-2xl font-bold text-teal-700 mt-1">
                    {firestoreChecking
                      ? '...'
                      : firestoreConnected
                        ? activeAssessmentsCount
                        : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {firestoreChecking
                      ? 'Memeriksa database...'
                      : firestoreConnected
                        ? `Dari total ${assessments.length} paket dunia`
                        : 'Firebase belum terhubung'}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">Jumlah Asesmen Selesai</p>
                  <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
                    {firestoreChecking
                      ? '...'
                      : firestoreConnected
                        ? closedAssessmentsCount
                        : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {firestoreChecking
                      ? 'Memeriksa database...'
                      : firestoreConnected
                        ? `${completedSessionsCount} sesi siswa selesai · ${inProgressSessionsCount} berjalan`
                        : 'Data belum tersedia'}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">
                    Ringkasan Hasil Pengerjaan Siswa
                  </p>
                  <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                    {firestoreChecking
                      ? '...'
                      : !firestoreConnected
                        ? '—'
                        : averageResultScore !== null
                          ? `${averageResultScore}`
                          : 'Belum ada'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {firestoreChecking
                      ? 'Memeriksa database...'
                      : !firestoreConnected
                        ? 'Data belum tersedia'
                        : averageResultScore !== null
                          ? `Rata-rata nilai (${passedResultsCount}/${results.length} tuntas KKM ${passThreshold})`
                          : 'Belum ada hasil siswa yang dinilai'}
                  </p>
                </div>
              </div>

              {/* Admin Usage Monitoring Summary Card (Strictly Real Data, Admin Only) */}
              {userRole === 'admin' && adminDashboardInfo?.usageSummary && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 no-print">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        Monitoring Penggunaan Sekolah ({schoolDisplayName})
                      </h2>
                      <p className="text-xs text-slate-500">
                        Ringkasan beban aktivitas server & partisipasi nyata untuk Administrator.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('reports')}
                        className="px-3 py-1.5 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
                      >
                        Buka Pusat Laporan &amp; Ekspor
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('adventure')}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                      >
                        Atur Gamifikasi &amp; XP
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-[11px] text-slate-500">Sesi Berjalan</p>
                      <p className="font-mono-tabular text-lg font-bold text-slate-900">
                        {adminDashboardInfo.usageSummary.activeSessions}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-[11px] text-slate-500">Sesi Terkumpul</p>
                      <p className="font-mono-tabular text-lg font-bold text-slate-900">
                        {adminDashboardInfo.usageSummary.submittedSessions}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80">
                      <p className="text-[11px] text-teal-800">Hasil Resmi</p>
                      <p className="font-mono-tabular text-lg font-bold text-teal-900">
                        {adminDashboardInfo.usageSummary.officialSubmissions}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-[11px] text-slate-500">Latihan/Simulasi</p>
                      <p className="font-mono-tabular text-lg font-bold text-slate-800">
                        {adminDashboardInfo.usageSummary.practiceSubmissions}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-[11px] text-slate-500">Bank Soal / Impor</p>
                      <p className="font-mono-tabular text-lg font-bold text-slate-900">
                        {adminDashboardInfo.usageSummary.questionBankCount} /{' '}
                        {adminDashboardInfo.usageSummary.importBatchesCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                      <p className="text-[11px] text-amber-800">Penjelajah / XP</p>
                      <p className="font-mono-tabular text-lg font-bold text-amber-900">
                        {adminDashboardInfo.usageSummary.adventureExplorersCount} /{' '}
                        {adminDashboardInfo.usageSummary.totalXpGranted}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                      <p className="text-[11px] text-emerald-800">Lencana Diraih</p>
                      <p className="font-mono-tabular text-lg font-bold text-emerald-900">
                        {adminDashboardInfo.usageSummary.totalBadgesEarned}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Sessions & Recent Activity Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Pantauan Sesi Petualangan Terbaru
                      </h2>
                      <p className="text-xs text-slate-500">
                        Pembaruan progres peserta secara real-time dari Firestore.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('results')}
                      className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
                    >
                      Buka Hasil Penilaian
                    </button>
                  </div>

                  {!firestoreConnected && !firestoreChecking ? (
                    <p className="text-sm text-slate-500 py-4">
                      Firebase belum terhubung, sehingga pantauan sesi langsung belum tersedia.
                    </p>
                  ) : sessions.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4">
                      Belum ada siswa yang memulai petualangan. Pastikan kelas, data siswa di menu Data Siswa, dan paket asesmen aktif telah dibuat untuk {schoolDisplayName}.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2.5 px-3">Siswa</th>
                            <th className="py-2.5 px-3">Kelas</th>
                            <th className="py-2.5 px-3">Kode</th>
                            <th className="py-2.5 px-3">Progres</th>
                            <th className="py-2.5 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sessions.slice(0, 8).map((s) => {
                            const asmCode =
                              assessments.find((a) => a.id === s.assessmentId)?.code ||
                              s.assessmentId;
                            return (
                              <tr key={s.id}>
                                <td className="py-2.5 px-3 font-semibold text-slate-900">
                                  {s.studentName}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">{s.gradeClass}</td>
                                <td className="py-2.5 px-3 font-mono-tabular text-xs">{asmCode}</td>
                                <td className="py-2.5 px-3 font-mono-tabular text-xs">
                                  {s.answeredIds.length}/{s.totalQuestions} ({s.progressPercent}%)
                                </td>
                                <td className="py-2.5 px-3 text-xs font-semibold">
                                  {s.status === 'graded'
                                    ? 'Dinilai'
                                    : s.status === 'submitted'
                                      ? 'Selesai'
                                      : 'Mengerjakan'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Ringkasan Aktivitas
                      </h2>
                      <p className="text-xs text-slate-500">Catatan audit sistem terkini</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                    >
                      Lihat Semua
                    </button>
                  </div>

                  {auditLogs.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4">
                      Belum ada catatan aktivitas yang direkam.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {auditLogs.slice(0, 5).map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">{log.action}</span>
                            <span
                              className={`font-semibold ${
                                log.status === 'success'
                                  ? 'text-emerald-700'
                                  : log.status === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-rose-600'
                              }`}
                            >
                              {log.status}
                            </span>
                          </div>
                          <p className="text-slate-600 line-clamp-2">
                            {log.actorName || log.actorId} · {log.detail || '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assessments' && (
            <AssessmentManager
              assessments={assessments}
              classes={classes}
              bankItems={bankItems}
              sessions={sessions}
              teacherUid={currentUser.uid}
            />
          )}

          {activeTab === 'bank' && (
            <QuestionBankView
              bankItems={bankItems}
              assessments={assessments}
              teacherUid={currentUser.uid}
            />
          )}

          {activeTab === 'roster' && (
            <RosterManager
              roster={roster}
              classes={classes}
              sessions={sessions}
              results={results}
              teacherUid={currentUser.uid}
            />
          )}

          {activeTab === 'schedule' && (
            <TeacherFeaturePlaceholder
              menuTitle="Jadwal PSAS 10 Dunia"
              description="Kalender penjadwalan pembukaan dan penutupan portal 10 mata pelajaran per kelas dan sesi ujian secara otomatis."
              plannedScope="Pada tahap selanjutnya, guru dapat menjadwalkan tanggal/jam buka-tutup tiap dunia secara terjadwal. Untuk sementara, penguncian dan pembukaan portal dapat diatur langsung melalui menu Buat Asesmen."
              relatedAction={{
                label: 'Atur Status Portal di Buat Asesmen',
                onClick: () => setActiveTab('assessments'),
              }}
            />
          )}

          {activeTab === 'adventure' && <AdventureEnginePanel userRole={userRole} />}

          {activeTab === 'reports' && (
            <ReportsAnalyticsHub
              assessments={assessments}
              results={results}
              roster={roster}
              classes={classes}
              defaultKkm={passThreshold}
              schoolName={schoolDisplayName}
              userRole={userRole}
              teacherName={currentUser.displayName || currentUser.email || 'Guru'}
            />
          )}

          {activeTab === 'results' && (
            <ResultsAnalyticsView
              assessments={assessments}
              sessions={sessions}
              results={results}
              teacherUid={currentUser.uid}
              onOpenReports={() => setActiveTab('reports')}
            />
          )}

          {activeTab === 'audit' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Log Aktivitas & Audit Keamanan ({schoolDisplayName})
                </h2>
                <p className="text-xs text-slate-500">
                  Rekaman masuk siswa, perubahan asesmen, dan inisialisasi data secara append-only.
                </p>
              </div>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Belum ada log aktivitas tercatat.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-3">Aktor</th>
                        <th className="py-2.5 px-3">Peran</th>
                        <th className="py-2.5 px-3">Aksi</th>
                        <th className="py-2.5 px-3">Detail</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {log.actorName || log.actorId}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{log.actorType}</td>
                          <td className="py-2.5 px-3 font-mono-tabular text-xs">{log.action}</td>
                          <td className="py-2.5 px-3 text-slate-600">{log.detail || '-'}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                log.status === 'success'
                                  ? 'text-emerald-700'
                                  : log.status === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-rose-600'
                              }`}
                            >
                              {log.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && settings && (
            <div className="space-y-6 max-w-2xl">
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Pengaturan Umum Sekolah & Asesmen
                </h2>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Sekolah
                  </label>
                  <input
                    type="text"
                    value={settings.schoolName}
                    onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    KKM Default (Kriteria Ketuntasan)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.defaultKkm}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultKkm: Number(e.target.value) || 75 })
                    }
                    className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cerita Pembuka Default
                  </label>
                  <textarea
                    rows={5}
                    value={settings.defaultIntroStory}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultIntroStory: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 cursor-pointer"
                >
                  {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm text-slate-900">
                    Log Aktivitas & Audit Sistem
                  </p>
                  <p className="text-xs text-slate-500">
                    Tinjau riwayat masuk siswa dan pembaruan asesmen guru.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Buka Log
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && !settings && (
            <TeacherFeaturePlaceholder
              menuTitle="Pengaturan Sekolah Belum Dimuat"
              description="Data konfigurasi sekolah dari Cloud Firestore belum tersedia saat ini."
              plannedScope="Pastikan Cloud Firestore telah terhubung dan administrator sekolah telah menjalankan inisialisasi sekolah serta 10 mata pelajaran resmi SDN Pekiringan."
            />
          )}
        </main>
      </div>
    </div>
  );
};
