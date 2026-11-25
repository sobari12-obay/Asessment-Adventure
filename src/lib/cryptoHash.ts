export function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function sha256Prefix(input: string, length = 40): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, length);
}

export async function hashExamCode(schoolId: string, code: string): Promise<string> {
  const cleanSchool = schoolId.trim().toLowerCase();
  const cleanCode = code.trim().toUpperCase();
  const digest = await sha256Prefix(`${cleanSchool}:${cleanCode}`, 40);
  return `code_${digest}`;
}

export async function hashStudentLookup(
  schoolId: string,
  classId: string,
  studentName: string,
  participantNumber?: string
): Promise<string> {
  const cleanSchool = schoolId.trim().toLowerCase();
  const cleanClass = classId.trim().toLowerCase();
  const cleanName = normalizeTextKey(studentName);
  const cleanParticipant = participantNumber ? normalizeTextKey(participantNumber) : '';
  const payload = cleanParticipant
    ? `${cleanSchool}:${cleanClass}:${cleanName}:${cleanParticipant}`
    : `${cleanSchool}:${cleanClass}:${cleanName}`;
  const digest = await sha256Prefix(payload, 40);
  return `stu_${digest}`;
}
