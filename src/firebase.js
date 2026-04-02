import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDHPMbvhZQMS-dMbnWDnfETv3dflmuAYC4",
  authDomain: "cafm-participation.firebaseapp.com",
  projectId: "cafm-participation",
  storageBucket: "cafm-participation.firebasestorage.app",
  messagingSenderId: "1067842757498",
  appId: "1:1067842757498:web:07cc139efe3b353b0e8573"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

export const ADMINS = [
  'headmaster@chestertonpensacola.org',
  'charlie@chestertonpensacola.org',
  'hrenshaw@chestertonpensacola.org',
  'heather@chestertonpensacola.org',
  'laura@chestertonpensacola.org'
];

export const isAdmin = (email) => ADMINS.includes(email?.toLowerCase());
