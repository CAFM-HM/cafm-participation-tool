import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
export const storage = getStorage(app);

// ────────────────────────────────────────────────────────────────────
// ROLE CONFIGURATION
// ────────────────────────────────────────────────────────────────────
// Roles are now stored in Firestore at config/roles and managed from the
// in-app "Access Control" admin page. These hardcoded arrays are used to:
//   (a) Seed Firestore on first run (see AccessControl.js)
//   (b) Provide a "super admin" failsafe so you can never lock yourself out
//       of the app even if the Firestore roles doc is corrupted or empty.
// ────────────────────────────────────────────────────────────────────

// SUPER ADMINS: Always have admin rights, regardless of Firestore config.
// Keep this list short — these are the people who cannot ever be removed
// from admin access by other admins using the UI. The headmaster should
// always be here so they're never locked out.
export const SUPER_ADMINS = [
  'headmaster@chestertonpensacola.org',
  'charlie@chestertonpensacola.org',
];

// Legacy: initial admin list — used only to seed Firestore on first run.
export const DEFAULT_ADMINS = [
  'headmaster@chestertonpensacola.org',
  'charlie@chestertonpensacola.org',
  'hrenshaw@chestertonpensacola.org',
  'heather@chestertonpensacola.org',
  'laura@chestertonpensacola.org',
];

// Legacy: initial board-member list — used only to seed Firestore on first run.
export const DEFAULT_BOARD_MEMBERS = [
  'headmaster@chestertonpensacola.org',
  'charlie@chestertonpensacola.org',
  'jp@chestertonpensacola.org',
  'catherine@chestertonpensacola.org',
  'mike@chestertonpensacola.org',
  'patrick@chestertonpensacola.org',
  'tamarah@chestertonpensacola.org',
  'alicia@chestertonpensacola.org',
];

export const isSuperAdmin = (email) => SUPER_ADMINS.includes((email || '').toLowerCase());

// Back-compat stubs — prefer useAuth().isAdmin / useAuth().isBoardMember.
// These only cover the super-admin case (the Firestore dynamic list is
// not available synchronously from firebase.js).
export const isAdmin = (email) => isSuperAdmin(email);
export const isBoardMember = (email) => isSuperAdmin(email);

// Known UID → email mapping
export const UID_MAP = {
  'RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2': 'charlie@chestertonpensacola.org',
  'hvThHfEBFAY7VrG3YQ3djt0Icxi1': 'jreilly@chestertonpensacola.org',
  'xn858oNYT3XOP6afwXh9qnT06cx2': 'trougas@chestertonpensacola.org',
};

export function teacherDisplayName(uid) {
  const email = UID_MAP[uid];
  if (email) {
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return uid.substring(0, 12) + '...';
}
