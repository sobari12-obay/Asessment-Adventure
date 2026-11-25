import rawConfig from '../../firebase-applet-config.json';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export const firebaseConfig: FirebaseAppletConfig = rawConfig;

const hasPlaceholder =
  !firebaseConfig.projectId ||
  firebaseConfig.projectId.includes('remixed-') ||
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('PLACEHOLDER') ||
  !firebaseConfig.firestoreDatabaseId ||
  firebaseConfig.firestoreDatabaseId.includes('remixed-');

export const isFirebaseConfigured = !hasPlaceholder;
export const projectId = firebaseConfig.projectId;
export const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';
export const storageBucket = firebaseConfig.storageBucket;
