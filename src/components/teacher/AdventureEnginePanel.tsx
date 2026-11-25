import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  Database,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  deleteTeacherCheckpoint,
  fetchAdminGamificationConfig,
  fetchTeacherAdventureOverview,
  saveAdminGamificationConfig,
  saveTeacherCheckpoint,
  syncAdminAdventureDefaults,
  updateTeacherWorldConfig,
  type TeacherAdventureOverviewResponse,
} from '../../services/apiClient';
import type {
  BadgeCatalogViewItem,
  BadgeRuleConfig,
  CheckpointType,
  GamificationConfig,
  LevelThreshold,
  UserRole,
} from '../../types/psas';
import { AdventureNotice } from '../adventure';

interface AdventureEnginePanelProps {
  userRole: UserRole;
}

export const AdventureEnginePanel: React.FC<AdventureEnginePanelProps> = ({ userRole }) => {
  const [overview, setOverview] = useState<TeacherAdventureOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [busyWorldId, setBusyWorldId] = useState<string | null>(null);
  const [syncingDefaults, setSyncingDefaults] = useState(false);

  // Checkpoint editor state
  const [selectedWorldForCp, setSelectedWorldForCp] = useState<string>('pai');
  const [cpTitle, setCpTitle] = useState('');
  const [cpIntro, setCpIntro] = useState('');
  const [cpType, setCpType] = useState<CheckpointType>('exploration');
  const [cpXp, setCpXp] = useState(25);
  const [savingCp, setSavingCp] = useState(false);

  // Admin Gamification Config state
  const [gamConfig, setGamConfig] = useState<GamificationConfig | null>(null);
  const [levelThresholds, setLevelThresholds] = useState<LevelThreshold[]>([]);
  const [badgeDrafts, setBadgeDrafts] = useState<
    Array<BadgeCatalogViewItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }>
  >([]);
  const [savingGamConfig, setSavingGamConfig] = useState(false);

  async function loadOverview() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [data, gamRes] = await Promise.all([
        fetchTeacherAdventureOverview(),
        userRole === 'admin'
          ? fetchAdminGamificationConfig().catch(() => null)
          : Promise.resolve(null),
      ]);
      setOverview(data);
      if (gamRes) {
        setGamConfig(gamRes.config);
        setLevelThresholds(gamRes.levelThresholds);
        setBadgeDrafts(gamRes.effectiveBadges);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memuat ringkasan Adventure Engine dari server.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  async function handleToggleWorld(worldId: string, currentAvailable: boolean) {
    setBusyWorldId(worldId);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const nextAvail = !currentAvailable;
      await updateTeacherWorldConfig(worldId, {
        isAvailable: nextAvail,
        availabilityReason: nextAvail
          ? 'Dibuka oleh pengaturan guru SDN Pekiringan.'
          : 'Ditutup sementara oleh pengaturan guru SDN Pekiringan.',
      });
      setStatusMsg(
        `Status dunia ${worldId} diperbarui menjadi ${nextAvail ? 'Tersedia' : 'Belum Tersedia'}.`
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui status dunia.');
    } finally {
      setBusyWorldId(null);
    }
  }

  async function handleAddCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!cpTitle.trim()) return;
    setSavingCp(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const worldObj = overview?.worlds.find((w) => w.id === selectedWorldForCp);
      const nextOrder = (worldObj?.checkpoints.length || 0) + 1;
      await saveTeacherCheckpoint({
        worldId: selectedWorldForCp,
        order: nextOrder,
        title: cpTitle.trim(),
        storyIntro: cpIntro.trim() || 'Selamat datang di pos eksplorasi baru!',
        checkpointType: cpType,
        xpReward: Math.max(5, Math.min(50, cpXp)),
      });
      setCpTitle('');
      setCpIntro('');
      setStatusMsg(`Checkpoint baru ditambahkan ke dunia ${selectedWorldForCp}.`);
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan checkpoint baru.');
    } finally {
      setSavingCp(false);
    }
  }

  async function handleDeleteCheckpoint(checkpointId: string) {
    setStatusMsg('');
    setErrorMsg('');
    try {
      await deleteTeacherCheckpoint(checkpointId);
      setStatusMsg('Checkpoint berhasil dinonaktifkan.');
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menonaktifkan checkpoint.');
    }
  }

  async function handleSyncDefaultsToFirestore() {
    setSyncingDefaults(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await syncAdminAdventureDefaults();
      setStatusMsg(
        `Katalog Firestore tersinkronisasi: ${res.worldsSynced} dunia, ${res.checkpointsSynced} checkpoint, dan ${res.badgesSynced} lencana.`
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyinkronkan katalog ke Firestore.');
    } finally {
      setSyncingDefaults(false);
    }
  }

  async function handleSaveGamificationConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!gamConfig || userRole !== 'admin') return;
    setSavingGamConfig(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const badgesPayload: BadgeRuleConfig[] = badgeDrafts.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        targetCount: b.targetCount,
        xpThreshold: b.xpThreshold,
        isActive: b.isActive,
      }));
      const res = await saveAdminGamificationConfig({
        xpBaseCampVisit: Math.max(0, Math.min(100, Number(gamConfig.xpBaseCampVisit) || 0)),
        xpCharacterSelect: Math.max(0, Math.min(100, Number(gamConfig.xpCharacterSelect) || 0)),
        xpWorldOpen: Math.max(0, Math.min(100, Number(gamConfig.xpWorldOpen) || 0)),
        xpExamOfficial: Math.max(0, Math.min(100, Number(gamConfig.xpExamOfficial) || 0)),
        xpExamPractice: Math.max(0, Math.min(100, Number(gamConfig.xpExamPractice) || 0)),
        xpExamSimulation: Math.max(0, Math.min(100, Number(gamConfig.xpExamSimulation) || 0)),
        badges: badgesPayload,
      });
      setGamConfig(res.config);
      setBadgeDrafts(res.effectiveBadges);
      setStatusMsg(
        `Aturan gamifikasi & lencana berhasil disimpan${res.firestoreSynced ? ' serta disinkronkan ke Firestore' : ''}.`
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi aturan gamifikasi.'
      );
    } finally {
      setSavingGamConfig(false);
    }
  }

  const activeWorldDetail =
    overview?.worlds.find((w) => w.id === selectedWorldForCp) || overview?.worlds[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Adventure Engine & Kontrol 10 Dunia
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Pantau keterlibatan penjelajah cilik, atur pembukaan gerbang dunia, dan kelola pos checkpoint. Tanpa papan peringkat nilai.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'admin' && (
            <button
              type="button"
              disabled={syncingDefaults}
              onClick={() => void handleSyncDefaultsToFirestore()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {syncingDefaults ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>Sinkronkan 10 Dunia & 12 Lencana ke Firestore</span>
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadOverview()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <AdventureNotice variant="success" title="Perubahan Disimpan" message={statusMsg} />
      )}
      {errorMsg && (
        <AdventureNotice variant="warning" title="Perhatian" message={errorMsg} />
      )}

      {loading && !overview ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
          <span>Memuat data Adventure Engine...</span>
        </div>
      ) : overview ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium">Penjelajah Terdaftar</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-slate-900 mt-1">
                {overview.summary.totalActiveExplorers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium">Sudah Pilih Karakter</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-teal-700 mt-1">
                {overview.summary.characterSelectedCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium">Pos Diselesaikan</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1">
                {overview.summary.totalCheckpointsCompleted}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium">Lencana Terbuka</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-amber-700 mt-1">
                {overview.summary.totalBadgesEarned}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 col-span-2 lg:col-span-1">
              <p className="text-xs text-slate-500 font-medium">Total XP Diberikan</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-indigo-700 mt-1">
                {overview.summary.totalXpGranted} XP
              </p>
            </div>
          </div>

          {/* 10 Worlds Availability Control */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900">
                Pengaturan Pembukaan 10 Dunia Petualangan
              </h3>
              <p className="text-xs text-slate-500">
                Guru membuka atau menutup dunia berdasarkan jadwal kelas — tidak pernah berdasarkan nilai siswa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {overview.worlds.map((w) => (
                <div
                  key={w.id}
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                    w.isAvailable ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-teal-800">
                      Dunia {w.number} · {w.subjectName}
                    </p>
                    <p className="font-display font-bold text-sm text-slate-900 truncate">
                      {w.worldName}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {w.checkpoints.length} pos · {w.explorersStartedCount} mulai ·{' '}
                      {w.explorersCompletedCount} tuntas
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busyWorldId === w.id}
                    onClick={() => void handleToggleWorld(w.id, w.isAvailable)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      w.isAvailable
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {busyWorldId === w.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : w.isAvailable ? (
                      <Unlock className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{w.isAvailable ? 'Terbuka' : 'Tertutup'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Checkpoint Configurator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-teal-700" />
                  Pos Checkpoint per Dunia
                </h3>
                <select
                  value={selectedWorldForCp}
                  onChange={(e) => setSelectedWorldForCp(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  {overview.worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      Dunia {w.number}: {w.subjectName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2.5">
                {(activeWorldDetail?.checkpoints || []).map((cp) => (
                  <div
                    key={cp.id}
                    className="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        Pos {cp.order}: {cp.title}{' '}
                        <span className="text-amber-700 font-mono-tabular">
                          (+{cp.xpReward} XP)
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                        {cp.storyIntro}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCheckpoint(cp.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      title="Nonaktifkan Checkpoint"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => void handleAddCheckpoint(e)}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
            >
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-700" />
                Tambah Pos Checkpoint Baru
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Judul Pos
                </label>
                <input
                  type="text"
                  required
                  value={cpTitle}
                  onChange={(e) => setCpTitle(e.target.value)}
                  placeholder="Contoh: Pos Tantangan Ekstra"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Pos
                  </label>
                  <select
                    value={cpType}
                    onChange={(e) => setCpType(e.target.value as CheckpointType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  >
                    <option value="story">Kisah Pembuka</option>
                    <option value="exploration">Eksplorasi</option>
                    <option value="mission_gate">Gerbang Misi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hadiah XP (5–50)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={cpXp}
                    onChange={(e) => setCpXp(Number(e.target.value) || 25)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-tabular"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pengantar Cerita Anak
                </label>
                <textarea
                  rows={3}
                  value={cpIntro}
                  onChange={(e) => setCpIntro(e.target.value)}
                  placeholder="Tulis pengantar singkat yang ramah anak..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={savingCp}
                className="w-full py-2.5 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 cursor-pointer"
              >
                {savingCp ? 'Menyimpan...' : 'Simpan Checkpoint Baru'}
              </button>
            </form>
          </div>

          {/* Level & Badge Summary + Explorer Progress (Non-Competitive, No Score Leaderboard) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                Lencana Terbuka ({overview.badgeSummary.length} Jenis)
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {overview.badgeSummary.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-semibold text-slate-800">{b.name}</span>
                    <span className="font-mono-tabular font-bold text-teal-700">
                      {b.earnedCount} siswa
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="font-display font-bold text-base text-slate-900">
                Aktivitas Penjelajah Siswa Terbaru (Tanpa Pemeringkatan)
              </h3>
              {overview.recentExplorers.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Belum ada siswa yang memulai petualangan Stage 2 di server ini.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-2 px-3">Nama Siswa</th>
                        <th className="py-2 px-3">Kelas</th>
                        <th className="py-2 px-3">Level</th>
                        <th className="py-2 px-3">Total XP</th>
                        <th className="py-2 px-3">Lencana</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.recentExplorers.map((stu) => (
                        <tr key={stu.studentId}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {stu.displayName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{stu.gradeClass}</td>
                          <td className="py-2 px-3 text-teal-800 font-semibold">
                            Lv.{stu.level} ({stu.levelTitle})
                          </td>
                          <td className="py-2 px-3 font-mono-tabular font-bold">
                            {stu.totalXp} XP
                          </td>
                          <td className="py-2 px-3 font-mono-tabular">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {stu.badgesEarnedCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Admin-Only Gamification Rules & Badge Configurator */}
          {userRole === 'admin' && gamConfig && (
            <form
              onSubmit={(e) => void handleSaveGamificationConfig(e)}
              className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-teal-700" />
                    Konfigurasi Aturan XP &amp; Lencana (Khusus Administrator)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Atur besaran hadiah XP (non-negatif, 0–100) serta syarat/status aktif 12 lencana petualangan. Jenjang 10 level mengikuti standar resmi aplikasi.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={savingGamConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingGamConfig ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Aturan Gamifikasi</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { key: 'xpBaseCampVisit' as const, label: 'Kunjungan Base Camp' },
                  { key: 'xpCharacterSelect' as const, label: 'Pilih Karakter' },
                  { key: 'xpWorldOpen' as const, label: 'Buka Gerbang Dunia' },
                  { key: 'xpExamOfficial' as const, label: 'Selesai Ujian Resmi' },
                  { key: 'xpExamPractice' as const, label: 'Selesai Latihan' },
                  { key: 'xpExamSimulation' as const, label: 'Selesai Simulasi' },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                  >
                    <label className="block text-[11px] font-semibold text-slate-700">
                      {field.label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gamConfig[field.key]}
                      onChange={(e) =>
                        setGamConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                [field.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              }
                            : prev
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-mono-tabular font-bold text-slate-900"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
                <div className="lg:col-span-4 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                  <p className="text-xs font-bold text-slate-900">
                    Tangga 10 Level Resmi (Read-Only)
                  </p>
                  <div className="space-y-1 text-xs">
                    {levelThresholds.map((lt) => (
                      <div
                        key={lt.level}
                        className="flex justify-between py-1 border-b border-slate-200/70 last:border-b-0"
                      >
                        <span className="font-medium text-slate-800">
                          Lv.{lt.level} · {lt.title}
                        </span>
                        <span className="font-mono-tabular text-slate-600">
                          {lt.minXp}
                          {lt.nextMinXp !== null ? `–${lt.nextMinXp - 1}` : '+'} XP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-8 space-y-2.5">
                  <p className="text-xs font-bold text-slate-900">
                    Pengaturan Katalog Lencana ({badgeDrafts.length} Lencana)
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {badgeDrafts.map((badge, idx) => (
                      <div
                        key={badge.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs"
                      >
                        <div className="sm:col-span-4">
                          <input
                            type="text"
                            value={badge.name}
                            onChange={(e) =>
                              setBadgeDrafts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, name: e.target.value } : item
                                )
                              )
                            }
                            aria-label={`Nama lencana ${badge.id}`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            value={badge.description}
                            onChange={(e) =>
                              setBadgeDrafts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, description: e.target.value } : item
                                )
                              )
                            }
                            aria-label={`Deskripsi lencana ${badge.id}`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
                          />
                        </div>
                        <div className="sm:col-span-3 flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={badge.isActive}
                              onChange={(e) =>
                                setBadgeDrafts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, isActive: e.target.checked } : item
                                  )
                                )
                              }
                            />
                            <span>{badge.isActive ? 'Aktif' : 'Nonaktif'}</span>
                          </label>
                          {typeof badge.targetCount === 'number' && (
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={badge.targetCount}
                              onChange={(e) =>
                                setBadgeDrafts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          targetCount: Math.max(
                                            1,
                                            Math.min(50, Number(e.target.value) || 1)
                                          ),
                                        }
                                      : item
                                  )
                                )
                              }
                              title="Target jumlah pencapaian"
                              className="w-14 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono-tabular text-center"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          )}
        </>
      ) : null}
    </div>
  );
};
