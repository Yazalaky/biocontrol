import { getFunctions } from 'firebase/functions';
import { firebaseApp } from './firebase';

// Debe coincidir con la región configurada en Cloud Functions.
export const firebaseFunctions = getFunctions(firebaseApp, 'us-central1');

