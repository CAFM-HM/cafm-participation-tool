import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { auth, db, provider, isSuperAdmin } from '../firebase';

// Normalize an email for comparison.
const norm = (s) => (s || '').trim().toLowerCase();

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roles, setRoles] = useState({ admins: [], boardMembers: [] });
  const [rolesLoading, setRolesLoading] = useState(true);

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Role config (real-time from Firestore). A missing doc is treated as
  // empty — super admins still work as a failsafe so the app is always
  // accessible to at least one person.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'roles'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setRoles({
            admins: Array.isArray(d.admins) ? d.admins : [],
            boardMembers: Array.isArray(d.boardMembers) ? d.boardMembers : [],
          });
        } else {
          setRoles({ admins: [], boardMembers: [] });
        }
        setRolesLoading(false);
      },
      (err) => {
        console.error('Roles config load failed:', err);
        setRolesLoading(false);
      }
    );
    return unsub;
  }, []);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth);

  const email = norm(user?.email);
  const superAdmin = isSuperAdmin(email);
  const listedAdmin = roles.admins.some(e => norm(e) === email);
  const listedBoard = roles.boardMembers.some(e => norm(e) === email);

  // Super admins are always admins. Admins always have board access too.
  const isAdmin = superAdmin || listedAdmin;
  const isBoardMember = isAdmin || listedBoard;

  return {
    user,
    loading: authLoading || rolesLoading,
    login,
    logout,
    isAdmin,
    isBoardMember,
    isSuperAdmin: superAdmin,
    displayName: user?.displayName || user?.email || '',
    email: user?.email || '',
    uid: user?.uid || '',
    roles, // { admins: [...], boardMembers: [...] } — raw lists for the Access Control page
  };
}
