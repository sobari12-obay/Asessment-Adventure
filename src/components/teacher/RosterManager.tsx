import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { ConfirmModal } from '../adventure';
import {
  classNameToId,
  deleteRosterStudent,
  sanitizeId,
  saveClassRoom,
  saveRosterStudent,
} from '../../services/firestoreService';
import {
  DEFAULT_SCHOOL_ID,
  DEFAULT_SCHOOL_NAME,
  type AssessmentResult,
  type AssessmentSession,
  type ClassRoom,
  type RosterStudent,
} from '../../types/psas';

interface RosterManagerProps {
  roster: RosterStudent[];
  classes: ClassRoom[];
  sessions: AssessmentSession[];
  results: AssessmentResult[];
  teacherUid: string;
}

export const RosterManager: React.FC<RosterManagerProps> = ({
  roster,
  classes,
  sessions,
  results,
  teacherUid,
}) => {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [name, setName] = useState('');
  const [gradeClass, setGradeClass] = useState('3A');
  const [participantNumber, setParticipantNumber] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const classOptions = useMemo(() => {
    const set = new Set<string>([
      ...classes.map((c) => c.name),
      ...roster.map((s) => s.gradeClass),
    ]);
    return Array.from(set).sort();
  }, [classes, roster]);

  const duplicateNamesSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of roster) {
      const k = `${s.gradeClass.trim().toLowerCase()}::${s.name.trim().toLowerCase()}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dups = new Set<string>();
    counts.forEach((v, k) => {
      if (v > 1) dups.add(k);
    });
    return dups;
  }, [roster]);

  const filtered = useMemo(() => {
    return roster
      .filter((s) => classFilter === 'all' || s.gradeClass === classFilter)
      .filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.participantNumber || '').toLowerCase().includes(search.toLowerCase())
      );
  }, [roster, search, classFilter]);

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorNotice('');
    const cleanClass = gradeClass.trim() || '3A';
    const classId = classNameToId(cleanClass);

    try {
      if (!classes.some((c) => c.id === classId)) {
        await saveClassRoom(
          {
            id: classId,
            schoolId: DEFAULT_SCHOOL_ID,
            name: cleanClass,
            grade: '3',
            isActive: true,
            ownerId: teacherUid,
          },
          true
        );
      }

      const id = sanitizeId(`stu_${Date.now()}`);
      await saveRosterStudent(
        {
          id,
          schoolId: DEFAULT_SCHOOL_ID,
          classId,
          name: name.trim(),
          gradeClass: cleanClass,
          participantNumber: participantNumber.trim() || undefined,
          isActive: true,
          ownerId: teacherUid,
        },
        true
      );
      setName('');
      setParticipantNumber('');
      setNotice(`Peserta baru ditambahkan ke ${DEFAULT_SCHOOL_NAME} (${cleanClass}).`);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal menambahkan peserta.');
    }
  }

  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault();
    const clean = newClassName.trim().toUpperCase();
    if (!clean) return;
    setErrorNotice('');
    try {
      const id = classNameToId(clean);
      await saveClassRoom(
        {
          id,
          schoolId: DEFAULT_SCHOOL_ID,
          name: clean,
          grade: '3',
          isActive: true,
          ownerId: teacherUid,
        },
        !classes.some((c) => c.id === id)
      );
      setNewClassName('');
      setNotice(`Kelas ${clean} berhasil ditambahkan.`);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal menambahkan kelas.');
    }
  }

  function handleDownloadTemplate() {
    const rows = [
      { Nama: 'Budi Santoso', Kelas: '3A', Nomor_Peserta: 'PSAS-3A-04' },
      { Nama: 'Dewi Lestari', Kelas: '3B', Nomor_Peserta: 'PSAS-3B-03' },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Peserta');
    XLSX.writeFile(wb, 'Template_Import_Peserta_PSAS.xlsx');
  }

  async function handleImportRoster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const stuName = String(r.Nama || r.nama || '').trim();
        const stuClass = String(r.Kelas || r.kelas || '3A').trim();
        const stuNum = String(r.Nomor_Peserta || r.nomor_peserta || '').trim();
        if (!stuName) continue;
        await saveRosterStudent(
          {
            id: sanitizeId(`stu_${Date.now()}_${i}`),
            schoolId: DEFAULT_SCHOOL_ID,
            classId: classNameToId(stuClass),
            name: stuName,
            gradeClass: stuClass,
            participantNumber: stuNum || undefined,
            isActive: true,
            ownerId: teacherUid,
          },
          true
        );
        count++;
      }
      setNotice(`Berhasil mengimpor ${count} peserta.`);
    } catch {
      setNotice('Gagal membaca file peserta. Gunakan template Excel.');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      {/* Quick Class Creation Strip */}
      <form
        onSubmit={handleAddClass}
        className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <p className="text-xs font-bold text-slate-900">
            Daftar Kelas Aktif ({DEFAULT_SCHOOL_NAME}): {classOptions.join(', ') || '3A, 3B, 3C, 3D'}
          </p>
          <p className="text-[11px] text-slate-500">
            Jika ada siswa bernama sama di satu kelas, isi Nomor Peserta sebagai identitas pembeda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value.toUpperCase())}
            placeholder="Tambah kelas (mis: 3E)"
            className="w-40 px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Kelas
          </button>
        </div>
      </form>

      {/* Quick Add Participant Form */}
      <form
        onSubmit={handleAddStudent}
        className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row items-stretch lg:items-end gap-3"
      >
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Peserta</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama lengkap siswa..."
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <div className="w-full lg:w-32">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
          <input
            type="text"
            required
            value={gradeClass}
            onChange={(e) => setGradeClass(e.target.value.toUpperCase())}
            placeholder="3A"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <div className="w-full lg:w-44">
          <label className="block text-xs font-semibold text-slate-700 mb-1">No. Peserta</label>
          <input
            type="text"
            value={participantNumber}
            onChange={(e) => setParticipantNumber(e.target.value)}
            placeholder="Misal: PSAS-3A-06"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Peserta
        </button>
      </form>

      {/* Filter & Excel Import Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau nomor peserta..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="all">Semua Kelas</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Template Excel
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Import Peserta
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportRoster}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-900 font-medium">
          {notice}
        </div>
      )}

      {errorNotice && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-900 font-medium">
          {errorNotice}
        </div>
      )}

      {/* Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">Nama Siswa</th>
              <th className="py-3 px-4">Kelas</th>
              <th className="py-3 px-4">No. Peserta</th>
              <th className="py-3 px-4">Sesi Dikerjakan</th>
              <th className="py-3 px-4 text-right">Rata-rata Nilai</th>
              <th className="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Belum ada peserta terdaftar.
                </td>
              </tr>
            ) : (
              filtered.map((stu) => {
                const isDupName = duplicateNamesSet.has(
                  `${stu.gradeClass.trim().toLowerCase()}::${stu.name.trim().toLowerCase()}`
                );
                const stuSessions = sessions.filter((s) =>
                  s.studentId
                    ? s.studentId === stu.id
                    : s.studentName.toLowerCase() === stu.name.toLowerCase() &&
                      s.gradeClass.toLowerCase() === stu.gradeClass.toLowerCase()
                );
                const stuResults = results.filter((r) =>
                  r.studentId
                    ? r.studentId === stu.id
                    : r.studentName.toLowerCase() === stu.name.toLowerCase() &&
                      r.gradeClass.toLowerCase() === stu.gradeClass.toLowerCase()
                );
                const avg =
                  stuResults.length > 0
                    ? Math.round(
                        stuResults.reduce((acc, r) => acc + r.finalScore, 0) / stuResults.length
                      )
                    : null;

                return (
                  <tr key={stu.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{stu.name}</span>
                        {isDupName && (
                          <span
                            title="Nama ganda di kelas ini — wajib gunakan No. Peserta saat login siswa"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            Nama Ganda
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{stu.gradeClass}</td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">
                      {stu.participantNumber || '-'}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-slate-700">
                      {stuSessions.length} sesi (
                      {stuSessions.filter((s) => s.status !== 'in_progress').length} selesai)
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {avg !== null ? avg : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteStudent({ id: stu.id, name: stu.name })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Hapus Peserta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={Boolean(pendingDeleteStudent)}
        tone="danger"
        title="Hapus Data Peserta?"
        message={`Peserta "${pendingDeleteStudent?.name || ''}" akan dihapus dari daftar aktif kelas SDN Pekiringan.`}
        confirmLabel="Ya, Hapus Peserta"
        onCancel={() => setPendingDeleteStudent(null)}
        onConfirm={() => {
          if (!pendingDeleteStudent) return;
          const targetId = pendingDeleteStudent.id;
          setPendingDeleteStudent(null);
          setErrorNotice('');
          void deleteRosterStudent(targetId, teacherUid).catch((err) =>
            setErrorNotice(err instanceof Error ? err.message : 'Gagal menghapus data peserta.')
          );
        }}
      />
    </div>
  );
};
