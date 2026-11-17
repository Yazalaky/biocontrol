import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectLocalFirebaseEmulatorOnce, firebaseApp } from './firebase';

// Debe coincidir con la región configurada en Cloud Functions.
export const firebaseFunctions = getFunctions(firebaseApp, 'us-central1');

connectLocalFirebaseEmulatorOnce('functions', () => {
  connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
});

