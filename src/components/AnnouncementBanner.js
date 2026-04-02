import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function AnnouncementBanner({ isAdmin }) {
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'announcement'));
      if (snap.exists() && snap.data().message) {
        setMessage(snap.data().message);
      } else {
        setMessage('');
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    await setDoc(doc(db, 'config', 'announcement'), { message: draft.trim(), updatedAt: new Date().toISOString() });
    setMessage(draft.trim());
    setEditing(false);
  };

  const handleClear = async () => {
    await setDoc(doc(db, 'config', 'announcement'), { message: '', updatedAt: new Date().toISOString() });
    setMessage('');
    setEditing(false);
    setDraft('');
  };

  if (loading) return null;

  // Admin edit mode
  if (editing && isAdmin) {
    return (
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '8px 24px',
      }}>
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: 12, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Type an announcement for all users..."
            style={{ flex: 1, border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit' }}
            autoFocus
          />
          <button className="btn btn-sm btn-gold" onClick={handleSave}>Save</button>
          {message && <button className="btn btn-sm btn-secondary" onClick={handleClear}>Clear</button>}
          <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  // Show banner if message exists
  if (message) {
    return (
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '8px 24px',
      }}>
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <span style={{ flex: 1, fontSize: 13, color: '#92400E', lineHeight: 1.4 }}>{message}</span>
          {isAdmin && (
            <button className="btn btn-sm btn-secondary" onClick={() => { setDraft(message); setEditing(true); }}>Edit</button>
          )}
        </div>
      </div>
    );
  }

  // No message — admin sees "Add announcement" button
  if (isAdmin) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 24px' }}>
        <button
          className="btn btn-sm btn-secondary"
          style={{ opacity: 0.5 }}
          onClick={() => { setDraft(''); setEditing(true); }}
        >
          📢 Add Announcement
        </button>
      </div>
    );
  }

  return null;
}
