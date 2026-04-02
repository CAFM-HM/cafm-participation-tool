import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBhPThGT9VOLFPePOFs2Ky0SWkLgh3BOP0",
  authDomain: "cafm-participation.firebaseapp.com",
  projectId: "cafm-participation",
  storageBucket: "cafm-participation.firebasestorage.app",
  messagingSenderId: "849036044326",
  appId: "1:849036044326:web:798a5535971cbb1d039ee7"
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
