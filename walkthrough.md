# Security Summary

**Reviewed Files**: 36  
**Issues Resolved**: 6  

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Client-Trusted Validation Alias | `server.ts` | 1007 | `POST /api/student/validate-entry` accepted client-supplied `accessRecord` and `studentLookup` payloads instead of fetching Firestore directly. | High | Fixed | Unified `/api/student/validate-entry` to execute the exact same server-authoritative Firestore lookup (`handleAuthoritativeStudentLogin`) as `/api/student/login`, ignoring any client-supplied lookup objects. |
| Unauthenticated Scoring Endpoints | `server.ts`, `src/lib/scoringClient.ts` | 1942 | `POST /api/scoring/evaluate` and `POST /api/scoring/analyze` lacked caller authentication and payload size limits. | High | Fixed | Added `authenticateStaff` + `requireRole(['admin', 'teacher'])` middleware, array size bounds (`300` questions / `2000` results), and Firebase Bearer ID token injection in `src/lib/scoringClient.ts`. |
| Shared-IP Classroom Rate Limit | `server.ts`, `server/rateLimiter.ts` | 790 | `guard:` counter incremented on every login request (`10` max), risking false lockouts for classrooms sharing one school Wi-Fi IP (`25` general cap). | High | Fixed | Added non-incrementing `peekFailedAttempts` helper, raised shared-Wi-Fi general burst limit to `120` per 5 min, and strictly counted only actual verification failures (`6` per 5 min -> `429`), including `PARTICIPANT_MISMATCH`. |
| Storage Active Teacher Check | `storage.rules` | 15 | `isTeacherOrAdmin()` checked `teachers/{uid}` existence without verifying `isActive != false`. | Medium | Fixed | Added `firestore.get(...).data.isActive != false` to match `firestore.rules`. |
| Untrusted Media URL Schemes | `src/components/QuestionRenderer.tsx` | 36 | Question `mediaUrl`, `audioUrl`, and `imageOptions[].imageUrl` were passed directly without URL protocol filtering. | Medium | Fixed | Added `sanitizeMediaUrl` restricting media sources to `http:`, `https:`, `/src/assets/`, and `/assets/` alongside graceful image error fallback. |
| CSV Formula Injection & Quoting | `src/components/teacher/ResultsAnalyticsView.tsx` | 302 | CSV export interpolated student/assessment strings directly into quoted cells without formula prefix neutralization or quote escaping. | Medium | Fixed | Added `escapeCsvCell` neutralizing leading `=`, `+`, `-`, `@`, `\t`, `\r` characters and escaping internal double quotes. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Staff Authentication & RBAC | `server.ts`, `server/firebaseAdmin.ts` | `/api/me`, `/api/teacher/*`, `/api/admin/*`, and `/api/scoring/*` verify Firebase ID Tokens (`verifyIdToken`), require `email_verified`, check `isActive != false`, and enforce `admin` vs `teacher` roles. |
| Firestore Access Rules | `firestore.rules` | Default deny catch-all; public catalog restricted to `classes`, `subjects`, `publicAssessments`, `publicQuestions`; keys (`questionKeys`) and student roster (`students`) strictly isolated from student browsers. |
| Student Session Token Lifecycle | `server.ts`, `src/App.tsx` | `psas_tok_v1.*` tokens carry a unique `jti` signed with server `HMAC-SHA256`, held only in React memory (never `localStorage`), and revoked server-side on `POST /api/student/logout`. |
| API Error & Route Hygiene | `server.ts` | JSON `SyntaxError` returns structured `400 INVALID_JSON` instead of HTML traces; unmatched `/api/*` paths return `404 API_NOT_FOUND` JSON before SPA fallback. |
| Secrets & Key Boundaries | `.env.example`, `server.ts` | Server secrets (`GEMINI_API_KEY`, `STUDENT_SESSION_SECRET`) stay exclusively in `process.env` and never appear in `VITE_*` client variables. |

---

## PoC Verification

### 1. Client-Supplied Payload Bypass on `/api/student/validate-entry`

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Server-Side Verification on Legacy Login Endpoint |
| Impact | High |
| Affected File | `server.ts:1007` |
| Test Scenario | `POST /api/student/validate-entry` with forged `accessRecord` (`codeHash` matching `sha256("sdn_pekiringan:FORGE99")`, `status: "active"`, `identityMode: "code_free"`, `assessmentId: "asm_forged"`) |

#### How It Was Fixed
Removed the legacy client-trusting handler and routed both `POST /api/student/login` and `POST /api/student/validate-entry` through `handleAuthoritativeStudentLogin`, which exclusively queries Cloud Firestore REST (`assessmentAccess/{codeHash}`).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/student/validate-entry` arrives with forged `req.body.accessRecord` | Input enters `handleAuthoritativeStudentLogin` (`server.ts:742`) |
| 2 | Server hashes `schoolId` + `examCode` (`FORGE99`) and ignores `req.body.accessRecord` | Queries `assessmentAccess/{codeHash}` in Firestore (`server.ts:806`) |
| 3 | Document does not exist (`!accessRes.exists`); server records failure and returns HTTP `403` | **Handled Safely** (`CODE_NOT_FOUND`, no token issued) |

#### Conclusion
**Fix Verified** - Live test returned `403 CODE_NOT_FOUND` on the forged payload; no student token can be minted without a matching active record in Firestore.

---

### 2. Unauthenticated Access to Scoring & Analytics Endpoints

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Sign-In & Role Check |
| Impact | High |
| Affected File | `server.ts:1942` |
| Test Scenario | `POST /api/scoring/evaluate` and `POST /api/scoring/analyze` sent with `Authorization: Bearer forged.token.abc` or no Authorization header |

#### How It Was Fixed
Protected both routes with `authenticateStaff` and `requireRole(['admin', 'teacher'])`, enforced array length upper bounds, and updated `src/lib/scoringClient.ts` to attach the signed-in teacher's Firebase ID Token.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated or forged request hits `POST /api/scoring/evaluate` or `/analyze` | Enters `authenticateStaff` middleware (`server.ts:332`) |
| 2 | `extractBearerToken` / `verifyFirebaseIdToken` rejects missing or forged JWT | Rejects immediately before scoring logic (`server.ts:343`) |
| 3 | Response returned with HTTP `401` (`INVALID_FIREBASE_TOKEN`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Live verification confirmed HTTP `401` on both scoring routes when called without a verified staff Firebase ID Token.

---

### 3. Shared Classroom Wi-Fi False Lockout vs. Brute-Force Protection

#### Summary
| Field | Value |
|---|---|
| Issue Type | Incorrect Rate-Limit Accounting on Valid/Pre-Validation Requests |
| Impact | High |
| Affected File | `server.ts:790`, `server/rateLimiter.ts:55` |
| Test Scenario | Burst of 12 pre-validation attempts (`400`) from one school IP vs. 7 consecutive wrong exam code attempts (`SALAH1`..`SALAH7`) from one school IP |

#### How It Was Fixed
Replaced the always-incrementing `guard:` counter with non-mutating `peekFailedAttempts(failBucketKey, 6)` so valid or pre-validation requests never consume failure quota, raised general IP burst cap to `120` per 5 minutes, and incremented `recordFailedAttempt` exclusively on real verification mismatches.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | 12 pre-validation requests hit `handleAuthoritativeStudentLogin` from IP `10.88.88.2` | Each returns `400`; `failBucketKey` stays at 0 |
| 2 | 7 invalid exam code attempts hit from IP `10.88.88.3` | Attempts 1–6 increment `recordFailedAttempt` and return `403 CODE_NOT_FOUND` |
| 3 | Attempt 7 hits `peekFailedAttempts(failBucketKey, 6)` (`server.ts:791`) | **Handled Safely** (`429 TOO_MANY_FAILED_ATTEMPTS`) |

#### Conclusion
**Fix Verified** - Shared-Wi-Fi classrooms are no longer falsely locked out while consecutive wrong exam codes still trigger HTTP `429` after 6 failed attempts.
