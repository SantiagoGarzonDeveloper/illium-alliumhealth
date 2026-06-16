import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBacF5bza3k6dzXL2TJALawZG9TBL9haNQ",
  authDomain: "monaco-community.firebaseapp.com",
  projectId: "monaco-community",
  storageBucket: "monaco-community.firebasestorage.app",
  messagingSenderId: "701053090882",
  appId: "1:701053090882:web:896a04dd98ee130937c1db",
  measurementId: "G-F4NG5YKH16"
};

const app = initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
/** Gen2 callables are deployed in `us-central1` (same as Firestore triggers). */
export const cloudFunctions = getFunctions(app, 'us-central1');
