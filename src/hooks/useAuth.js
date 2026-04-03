import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, provider, isAdmin } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      // If popup blocked, fall back to redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        const { signInWithRedirect } = await import('firebase/auth');
        await signInWithRedirect(auth, provider);
      } else {
        console.error('Login error:', err);
      }
    }
  };

  const logout = () => signOut(auth);

  return {
    user,
    loading,
    login,
    logout,
    isAdmin: isAdmin(user?.email),
    displayName: user?.displayName || user?.email || '',
    email: user?.email || '',
    uid: user?.uid || '',
  };
}
