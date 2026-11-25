import {
  FIREBASE_DATABASE_ID,
  FIREBASE_PROJECT_ID,
  isFirebaseServerConfigured,
} from './firebaseAdmin.js';

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export class FirestoreRestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'FirestoreRestError';
    this.status = status;
    this.code = code;
  }
}

function getDatabaseRoot(): string {
  if (!isFirebaseServerConfigured) {
    throw new FirestoreRestError(
      503,
      'FIREBASE_NOT_CONFIGURED',
      'Konfigurasi Firebase belum tersedia di server.'
    );
  }
  const dbId = encodeURIComponent(FIREBASE_DATABASE_ID || '(default)');
  return `projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${dbId}`;
}

function getDocumentsBaseUrl(): string {
  return `https://firestore.googleapis.com/v1/${getDatabaseRoot()}/documents`;
}

function decodeValue(val: FirestoreValue | undefined): unknown {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const items = val.arrayValue?.values;
    return Array.isArray(items) ? items.map((v) => decodeValue(v)) : [];
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeValue(v);
    }
    return out;
  }
  return null;
}

function encodeValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = encodeValue(v);
    }
  }
  return fields;
}

function decodeDocument<T = Record<string, unknown>>(doc: FirestoreRestDocument): T {
  const out: Record<string, unknown> = {};
  if (doc.fields) {
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeValue(v);
    }
  }
  return out as T;
}

function buildHeaders(idToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken && idToken.trim()) {
    headers.Authorization = `Bearer ${idToken.trim()}`;
  }
  return headers;
}

async function parseErrorResponse(res: Response): Promise<FirestoreRestError> {
  let code = `HTTP_${res.status}`;
  let message = `Firestore REST error (${res.status})`;
  try {
    const body = (await res.json()) as {
      error?: { status?: string; message?: string };
    };
    if (body?.error?.status) code = body.error.status;
    if (body?.error?.message) message = body.error.message;
  } catch {
    // Keep default message
  }
  return new FirestoreRestError(res.status, code, message);
}

export async function fsGetDoc<T = Record<string, unknown>>(
  docPath: string,
  idToken?: string
): Promise<{ exists: boolean; data: T | null }> {
  const cleanPath = docPath.replace(/^\/+/, '');
  const url = `${getDocumentsBaseUrl()}/${cleanPath}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(idToken),
  });

  if (res.status === 404) {
    return { exists: false, data: null };
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  const json = (await res.json()) as FirestoreRestDocument;
  return { exists: true, data: decodeDocument<T>(json) };
}

export async function fsListCollection<T = Record<string, unknown>>(
  collectionPath: string,
  options: { idToken?: string; pageSize?: number } = {}
): Promise<T[]> {
  const cleanPath = collectionPath.replace(/^\/+/, '');
  const pageSize = options.pageSize || 200;
  const url = `${getDocumentsBaseUrl()}/${cleanPath}?pageSize=${pageSize}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(options.idToken),
  });

  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  const json = (await res.json()) as { documents?: FirestoreRestDocument[] };
  if (!Array.isArray(json.documents)) return [];
  return json.documents.map((d) => decodeDocument<T>(d));
}

export async function fsRunEqualityQuery<T = Record<string, unknown>>(
  collectionId: string,
  filters: Array<{ field: string; value: unknown }>,
  options: { idToken?: string; limit?: number } = {}
): Promise<T[]> {
  const url = `${getDocumentsBaseUrl()}:runQuery`;
  const whereClause =
    filters.length === 1
      ? {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: 'EQUAL',
            value: encodeValue(filters[0].value),
          },
        }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: 'EQUAL',
                value: encodeValue(f.value),
              },
            })),
          },
        };

  const body: Record<string, unknown> = {
    structuredQuery: {
      from: [{ collectionId }],
      ...(filters.length > 0 ? { where: whereClause } : {}),
      limit: options.limit || 200,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(options.idToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  const rows = (await res.json()) as Array<{ document?: FirestoreRestDocument }>;
  const docs: T[] = [];
  for (const row of rows) {
    if (row.document) {
      docs.push(decodeDocument<T>(row.document));
    }
  }
  return docs;
}

export async function fsRunInQuery<T = Record<string, unknown>>(
  collectionId: string,
  field: string,
  values: unknown[],
  options: { idToken?: string; limit?: number } = {}
): Promise<T[]> {
  const url = `${getDocumentsBaseUrl()}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'IN',
          value: encodeValue(values),
        },
      },
      limit: options.limit || 200,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(options.idToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  const rows = (await res.json()) as Array<{ document?: FirestoreRestDocument }>;
  const docs: T[] = [];
  for (const row of rows) {
    if (row.document) {
      docs.push(decodeDocument<T>(row.document));
    }
  }
  return docs;
}

export interface CommitWriteOp {
  docPath: string;
  data?: Record<string, unknown>;
  mode: 'create' | 'set' | 'update' | 'delete';
  serverTimestampFields?: string[];
  updateMaskFields?: string[];
}

export async function fsCommitWrites(
  ops: CommitWriteOp[],
  idToken?: string
): Promise<void> {
  if (ops.length === 0) return;
  const dbRoot = getDatabaseRoot();
  const commitUrl = `https://firestore.googleapis.com/v1/${dbRoot}/documents:commit`;

  const writes = ops.map((op) => {
    const cleanPath = op.docPath.replace(/^\/+/, '');
    const fullName = `${dbRoot}/documents/${cleanPath}`;

    if (op.mode === 'delete') {
      return { delete: fullName };
    }

    const data = op.data || {};
    const fields = encodeFields(data);
    const writeObj: Record<string, unknown> = {
      update: {
        name: fullName,
        fields,
      },
    };

    if (op.mode === 'create') {
      writeObj.currentDocument = { exists: false };
    } else if (op.mode === 'update') {
      writeObj.currentDocument = { exists: true };
      const mask =
        op.updateMaskFields && op.updateMaskFields.length > 0
          ? op.updateMaskFields
          : Object.keys(data);
      writeObj.updateMask = { fieldPaths: mask };
    }

    if (op.serverTimestampFields && op.serverTimestampFields.length > 0) {
      writeObj.updateTransforms = op.serverTimestampFields.map((fieldPath) => ({
        fieldPath,
        setToServerValue: 'REQUEST_TIME',
      }));
    }

    return writeObj;
  });

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
}

export async function fsCheckConnectivity(): Promise<{ online: boolean; detail?: string }> {
  if (!isFirebaseServerConfigured) {
    return { online: false, detail: 'Konfigurasi Firebase belum diisi.' };
  }
  try {
    await fsGetDoc('settings/app_config');
    return { online: true };
  } catch (err) {
    if (err instanceof FirestoreRestError) {
      // Permission denied or unauthenticated still proves Firestore endpoint is reachable
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        return { online: true };
      }
      return { online: false, detail: err.message };
    }
    return {
      online: false,
      detail: err instanceof Error ? err.message : 'Gagal menghubungi Cloud Firestore.',
    };
  }
}
