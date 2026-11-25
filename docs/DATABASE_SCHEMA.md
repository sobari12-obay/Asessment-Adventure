# Skema Database Cloud Firestore — PSAS ADVENTURE

Seluruh data dirancang untuk sekolah awal **SDN Pekiringan** (`schoolId: "sdn_pekiringan"`) dan selalu menyertakan `schoolId` untuk perluasan multi-sekolah di masa depan.

## A. 14 Koleksi Inti Proyek
1. **`schools/{schoolId}`** — Identitas sekolah (`id`, `name`, `npsn`, `address`, `logoUrl`, `academicYear`, `activeSemester`, `isActive`, `createdAt`, `updatedAt`). Tulis hanya oleh `isAdmin()`.
2. **`users/{uid}`** — Akun pengguna terverifikasi (`uid`, `schoolId`, `email`, `displayName`, `role: 'admin' | 'teacher'`, `isActive`, `createdAt`, `updatedAt`).
3. **`teachers/{uid}`** — Profil guru pengelola kelas/mapel (`uid`, `schoolId`, `email`, `displayName`, `schoolName`, `role`, `isActive`, `createdAt`, `updatedAt`). Akun dengan `isActive: false` ditolak otomatis oleh `isTeacher()`.
4. **`classes/{classId}`** — Daftar kelas aktif (`id`, `schoolId`, `name`, `grade`, `academicYear`, `homeroomTeacher`, `isActive`, `ownerId`, `createdAt`, `updatedAt`). Tidak ada daftar kelas fiktif default; dibuat oleh admin/guru sesuai kondisi nyata sekolah.
5. **`subjects/{subjectId}`** — 10 Mata pelajaran resmi & identitas dunia (`id`, `schoolId`, `number`, `name`, `worldName`, `worldCode`, `worldIcon`, `worldColor`, `description`, `portalName`, `isActive`, `ownerId`, `updatedAt`). Tulis hanya oleh `isAdmin()`.
6. **`students/{studentId}`** — Daftar peserta ujian khusus guru/admin (`id`, `schoolId`, `classId`, `name`, `gradeClass`, `participantNumber`, `studentNumber`, `photoUrl`, `isActive`, `ownerId`, `createdAt`, `updatedAt`). **Tidak dapat dibaca oleh browser siswa.**
7. **`assessments/{assessmentId}`** — Konfigurasi lengkap asesmen guru (`id`, `schoolId`, `code`, `codeHash`, `title`, `description`, `academicYear`, `classIds`, `startsAt`, `endsAt`, `durationMinutes`, `maxAttempts`, `allowMultipleSessions`, `kkm`, `identityMode`, `ownerId`, `createdAt`, `updatedAt`).
8. **`questionBanks/{bankItemId}`** — Bank soal terpusat guru (`id`, `schoolId`, `subjectId`, `topic`, `competency`, `indicator`, `type`, `difficulty`, `payload`, `correctAnswer`, `weight`, `verificationStatus`, `ownerId`, `createdAt`, `updatedAt`).
9. **`questions/{questionId}`** — Master butir soal guru (`id`, `schoolId`, `assessmentId`, `subjectId`, `order`, `type`, `prompt`, `correctAnswer`, `weight`, `verificationStatus`, `isPublished`, `ownerId`, `createdAt`, `updatedAt`).
10. **`assessmentSessions/{sessionId}`** — Sesi pengerjaan siswa (`id`, `schoolId`, `assessmentId`, `subjectId`, `classId`, `studentId`, `studentName`, `gradeClass`, `participantNumber`, `characterId: 'boy' | 'girl'`, `status`, `currentIndex`, `answeredIds`, `questionOrder`, `progressPercent`, `checkpointsUnlocked`, `artifactsEarned`, `starsEarned`, `startedAt`, `lastActivityAt`, `submittedAt`, `createdAt`, `updatedAt`).
11. **`studentAnswers/{answerId}`** — Jawaban per soal dengan ID deterministik `{sessionId}__{questionId}` (`id`, `schoolId`, `sessionId`, `assessmentId`, `questionId`, `questionPromptSnapshot`, `questionWeightSnapshot`, `answerValue`, `isAnswered`, `updatedAt`).
12. **`results/{sessionId}`** — Laporan nilai akhir terhitung server & rubrik manual guru (`sessionId`, `schoolId`, `assessmentId`, `classId`, `studentId`, `finalScore`, `earnedPoints`, `maxPoints`, `questionOutcomes`, `showToStudent`, `gradedBy`, `createdAt`, `updatedAt`).
13. **`settings/{settingId}`** — Konfigurasi aplikasi (`app_config`: `id`, `schoolId`, `schoolName`, `defaultIntroStory`, `defaultKkm`, `updatedBy`, `updatedAt`). Tulis hanya oleh `isAdmin()`.
14. **`auditLogs/{logId}`** — Log aktivitas append-only (`id`, `schoolId`, `actorType`, `actorId`, `actorName`, `action`, `targetCollection`, `targetId`, `status`, `detail`, `createdAt`). Klien non-guru dilarang mencatat log sebagai `'admin'`/`'teacher'`.

## B. 6 Koleksi Isolasi Keamanan (Anti-Enumeration & Anti-Cheat)
15. **`admins/{uid}`** — Daftar administrator sekolah (`isAdmin()`).
16. **`publicAssessments/{assessmentId}`** — Metadata portal peta 10 dunia yang **tidak memuat `code`, `codeHash`, `date`, ataupun `kkm`**.
17. **`publicQuestions/{questionId}`** — Soal aman untuk siswa; hanya memuat `practiceHint`/`practiceExplanation`/`practiceKey` bila `mode == 'latihan'`.
18. **`questionKeys/{questionId}`** — Kunci jawaban & rubrik terpisah yang **hanya dapat diakses guru/admin**.
19. **`assessmentAccess/{codeHash}`** — Kunci lookup `get`-only berdasarkan `code_{sha256(schoolId:code)}` agar browser siswa tidak dapat me-`list` semua kode ujian.
20. **`studentAccessKeys/{lookupId}`** — Kunci lookup `get`-only berdasarkan `stu_{sha256(schoolId:classId:name)}` dan `stu_{sha256(schoolId:classId:name:participantNumber)}`. Menandai `requiresParticipantNumber: true` bila ada nama ganda di kelas yang sama.

## C. Koleksi & Penyimpanan Adventure Engine (Tahap 2)
Seluruh progres Adventure Engine siswa dikelola server-authoritatively oleh `/server/adventureStore.ts` (`data/adventure-state.json` dengan penulisan atomik) dan diproteksi pada `firestore.rules` agar tidak dapat ditulis langsung dari browser siswa:
21. **`adventureWorlds/{worldId}`** — Katalog & override status buka-tutup 10 dunia petualangan (`schoolId`, `number`, `worldName`, `portalName`, `zoneTheme`, `companionName`, `artifactName`, `isAvailable`, `availabilityReason`, `scheduleLabel`). Baca publik (`get, list`), tulis hanya oleh guru/admin.
22. **`checkpoints/{checkpointId}`** — Pos ekspedisi per dunia (30 default + custom guru: `worldId`, `order`, `title`, `storyIntro`, `storyOutro`, `challengePrompt`, `challengeOptions`, `helpfulHint`, `checkpointType`, `xpReward`, `isActive`). Baca publik, tulis hanya oleh guru/admin.
23. **`badges/{badgeId}`** — Katalog resmi 12 lencana penjelajah (`code`, `name`, `description`, `category`, `iconKey`, `targetWorldId`, `order`). Baca publik, tulis hanya oleh admin.
24. **`adventureProfiles/{schoolId}__{studentId}`** — Profil karakter & progres level siswa (`characterId`, `characterSelected`, `outfitTheme`, `bagStyle`, `shoeStyle`, `accentColor`, `nickname`, `totalXp`, `level`, `levelTitle`, `worldsCompletedCount`, `checkpointsCompletedCount`, `badgesEarnedCount`).
25. **`worldProgress/{schoolId}__{studentId}__{worldId}`** — Progres per dunia (`status: belum_dibuka | terbuka | sedang_dijelajahi | selesai`, `progressPercent`, `xpEarned`, `checkpointsCompleted`, `checkpointsTotal`, `lastCheckpointId`).
26. **`checkpointProgress/{schoolId}__{studentId}__{checkpointId}`** — Status pos per siswa (`terbuka | sedang_dikerjakan | selesai`, `xpAwarded`, `startedAt`, `completedAt`).
27. **`studentBadges/{schoolId}__{studentId}__{badgeId}`** — Lencana yang sudah diraih siswa (`earnedAt`, `sourceEventId`).
28. **`xpTransactions/{transactionId}`** — Buku besar XP terdeduplikasi (`sourceType`, `sourceRefId`, `worldId`, `amount > 0`, `description`, `createdAt`).
29. **`adventureEvents/{eventId}`** — Ledger event petualangan append-only (`eventType`, `worldId`, `checkpointId`, `badgeId`, `detail`, `createdAt`).

## D. Koleksi & Provenance AI Question Import (Tahap 4)
30. **`importBatches/{batchId}`** — Log & metadata sesi impor soal AI (`id`, `schoolId`, `ownerId`, `ownerName`, `sourceMode: 'document' | 'photo' | 'camera'`, `defaultSubjectId`, `defaultGrade`, `defaultSemester`, `status`, `stats`, `savedQuestionIds`, `createdAt`, `updatedAt`, `completedAt`). Hanya dapat diakses oleh guru/admin pada sekolah yang sama; status `cancelled`/`completed` dibersihkan folder temp-nya.
- **Perluasan Provenance `questionBanks/{bankItemId}`**: Soal hasil impor menyimpan `importBatchId`, `sourceFileName`, `sourceFileType`, `sourcePage`, `sourceQuestionNumber`, `extractionStatus`, `extractionConfidence`, `needsReview`, `importedBy`, `importedAt`, dan `verificationStatus` (`'VERIFIED' | 'BELUM_DIVERIFIKASI'`).
