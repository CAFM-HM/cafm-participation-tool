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

// Known UID → email mapping
export const UID_MAP = {
  'RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2': 'charlie@chestertonpensacola.org',
  'hvThHfEBFAY7VrG3YQ3djt0Icxi1': 'jreilly@chestertonpensacola.org',
  'xn858oNYT3XOP6afwXh9qnT06cx2': 'trougas@chestertonpensacola.org',
};

// Custom display names (loaded from Firestore config/teacherNames)
export const customTeacherNames = {};

export function teacherDisplayName(uid) {
  if (customTeacherNames[uid]) return customTeacherNames[uid];
  const email = UID_MAP[uid];
  if (email) {
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return uid.substring(0, 12) + '...';
}

// Load custom names from Firestore
import { doc, getDoc } from 'firebase/firestore';
getDoc(doc(db, 'config', 'teacherNames')).then(snap => {
  if (snap.exists()) {
    Object.assign(customTeacherNames, snap.data());
  }
}).catch(() => {});
