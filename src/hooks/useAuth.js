import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { auth, provider, isAdmin, isBoardMember } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedirectResult(auth).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = () => signInWithRedirect(auth, provider);
  const logout = () => signOut(auth);

  return {
    user,
    loading,
    login,
    logout,
    isAdmin: isAdmin(user?.email),
    isBoardMember: isBoardMember(user?.email),
    displayName: user?.displayName || user?.email || '',
    email: user?.email || '',
    uid: user?.uid || '',
  };
}
