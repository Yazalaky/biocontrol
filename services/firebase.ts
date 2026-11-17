import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

type FirebaseEnvKey =
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_STORAGE_BUCKET'
  | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
  | 'VITE_FIREBASE_APP_ID'
  | 'VITE_FIREBASE_MEASUREMENT_ID';

const localFirebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  projectId: 'demo-biocontrol-local',
  storageBucket: 'demo-biocontrol-local.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:local',
} as const;

export const isLocalFirebaseEnvironment =
  import.meta.env.DEV || import.meta.env.MODE === 'local';

const configuredFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
} as const;

const firebaseConfig = isLocalFirebaseEnvironment
  ? localFirebaseConfig
  : configuredFirebaseConfig;

function assertFirebaseConfig() {
  const required: FirebaseEnvKey[] = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ];

  const missing = required.filter((key) => {
    const value = import.meta.env[key];
    return !value || value === 'REPLACE_ME';
  });

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno de Firebase: ${missing.join(
        ', ',
      )}. Configúralas en .env.production.local para un build remoto (puedes partir de .env.example).`,
    );
  }
}

if (!isLocalFirebaseEnvironment) {
  assertFirebaseConfig();
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

const emulatorConnectionRegistry = globalThis as typeof globalThis & {
  __biocontrolFirebaseEmulatorConnections?: Set<string>;
};

export function connectLocalFirebaseEmulatorOnce(
  service: string,
  connect: () => void,
) {
  if (!isLocalFirebaseEnvironment) return;

  const connectedServices =
    emulatorConnectionRegistry.__biocontrolFirebaseEmulatorConnections ??= new Set();
  if (connectedServices.has(service)) return;

  connect();
  connectedServices.add(service);
}

connectLocalFirebaseEmulatorOnce('auth', () => {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
});
connectLocalFirebaseEmulatorOnce('firestore', () => {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
});
connectLocalFirebaseEmulatorOnce('storage', () => {
  connectStorageEmulator(storage, '127.0.0.1', 9199);
});

if (isLocalFirebaseEnvironment) {
  console.info(
    'BioControl usa emuladores locales de Firebase (proyecto demo-biocontrol-local).',
  );
}

export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return null;
  if (!import.meta.env.PROD || isLocalFirebaseEnvironment) return null;
  if (!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null;

  const { getAnalytics } = await import('firebase/analytics');
  return getAnalytics(firebaseApp);
}
