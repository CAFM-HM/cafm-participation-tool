import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, DEFAULT_ADMINS, DEFAULT_BOARD_MEMBERS, SUPER_ADMINS, isSuperAdmin } from '../firebase';

const norm = (s) => (s || '').trim().toLowerCase();

/**
 * Access Control — admin-only page for managing who has Admin and Board
 * access to the app. Roles are stored in Firestore at config/roles and
 * read in real time by useAuth.
 *
 * Safety:
 *  - Super admins (defined in firebase.js) cannot be removed from admin.
 *  - An admin cannot remove themselves (prevents accidental self-lockout).
 *  - On first load, if no Firestore role config exists, it seeds from the
 *    DEFAULT_ADMINS / DEFAULT_BOARD_MEMBERS hardcoded lists.
 */
export default function AccessControl({ currentEmail }) {
  const [admins, setAdmins] = useState([]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newBoardEmail, setNewBoardEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'roles'));
      if (snap.exists()) {
        const d = snap.data();
        setAdmins(d.admins || []);
        setBoardMembers(d.boardMembers || []);
      } else {
        // First-run seed from hardcoded defaults
        await setDoc(doc(db, 'config', 'roles'), {
          admins: DEFAULT_ADMINS,
          boardMembers: DEFAULT_BOARD_MEMBERS,
          seededAt: new Date().toISOString(),
        });
        setAdmins(DEFAULT_ADMINS);
        setBoardMembers(DEFAULT_BOARD_MEMBERS);
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Access list initialized' }));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load access config: ' + err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addEmail = async (list, email) => {
    const clean = norm(email);
    if (!clean) { alert('Enter an email address.'); return; }
    if (!clean.includes('@')) { alert('That doesn\u2019t look like an email address.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'config', 'roles'), { [list]: arrayUnion(clean) });
      if (list === 'admins') setAdmins(prev => prev.includes(clean) ? prev : [...prev, clean]);
      else setBoardMembers(prev => prev.includes(clean) ? prev : [...prev, clean]);
      window.dispatchEvent(new CustomEvent('toast', { detail: `Added ${clean}` }));
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
    setSaving(false);
  };

  const removeEmail = async (list, email) => {
    const clean = norm(email);
    if (list === 'admins' && isSuperAdmin(clean)) {
      alert(`${clean} is a super admin (hard-coded in firebase.js) and cannot be removed from this screen. This protects against accidental lockout.`);
      return;
    }
    if (list === 'admins' && clean === norm(currentEmail)) {
      if (!window.confirm('You are about to remove YOURSELF from admin access. You will lose access to admin pages immediately. Continue?')) return;
    } else {
      if (!window.confirm(`Remove ${clean} from ${list === 'admins' ? 'admin' : 'board member'} access?`)) return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'config', 'roles'), { [list]: arrayRemove(clean) });
      if (list === 'admins') setAdmins(prev => prev.filter(e => norm(e) !== clean));
      else setBoardMembers(prev => prev.filter(e => norm(e) !== clean));
      window.dispatchEvent(new CustomEvent('toast', { detail: `Removed ${clean}` }));
    } catch (err) {
      alert('Remove failed: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading access config…</div>;

  return (
    <div>
      <h2 className="section-title">Access Control</h2>

      {/* Explainer */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1E3A8A' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>How access works</div>
        <div style={{ lineHeight: 1.5 }}>
          <strong>Admins</strong> can see all admin tabs (Dashboard, Roster, Documents, Compliance, etc.) and manage this Access Control page.<br/>
          <strong>Board members</strong> can see the Board tab. Admins automatically have board access too.<br/>
          <strong>Super admins</strong> (the headmaster, plus one backup) are hard-coded in the app and cannot be removed from this screen — this is the failsafe that prevents anyone from locking themselves out.<br/>
          Changes take effect immediately for the user — they just need to refresh their browser.
        </div>
      </div>

      {/* Admins */}
      <AccessSection
        title="Admins"
        emoji="🔑"
        description="Full access to all admin-only tabs. Can manage this page."
        list={admins}
        currentEmail={currentEmail}
        superList={SUPER_ADMINS}
        newEmail={newAdminEmail}
        setNewEmail={setNewAdminEmail}
        onAdd={() => { addEmail('admins', newAdminEmail); setNewAdminEmail(''); }}
        onRemove={(email) => removeEmail('admins', email)}
        saving={saving}
      />

      {/* Board Members */}
      <AccessSection
        title="Board Members"
        emoji="👥"
        description="Can access the Board tab (finances, timeline, minutes). Admins already have this access."
        list={boardMembers}
        currentEmail={currentEmail}
        superList={[]}
        newEmail={newBoardEmail}
        setNewEmail={setNewBoardEmail}
        onAdd={() => { addEmail('boardMembers', newBoardEmail); setNewBoardEmail(''); }}
        onRemove={(email) => removeEmail('boardMembers', email)}
        saving={saving}
      />

      {/* Super admin info */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>⭐ Super Admins (failsafe, cannot be changed here)</div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          {SUPER_ADMINS.map(e => <div key={e}>• {e}</div>)}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' }}>
          To change super admins, a developer must edit <code>src/firebase.js</code> and redeploy.
        </div>
      </div>
    </div>
  );
}

function AccessSection({ title, emoji, description, list, currentEmail, superList, newEmail, setNewEmail, onAdd, onRemove, saving }) {
  const superSet = new Set(superList.map(norm));
  const displayList = [...list].sort((a, b) => norm(a).localeCompare(norm(b)));

  return (
    <div style={{ marginBottom: 20, padding: 16, background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1B3A5C' }}>{emoji} {title} <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 400 }}>({displayList.length})</span></div>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>{description}</div>

      {/* Add form */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          type="email"
          placeholder="name@chestertonpensacola.org"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button className="btn btn-primary" onClick={onAdd} disabled={saving || !newEmail.trim()}>+ Add</button>
      </div>

      {/* List */}
      {displayList.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12, background: '#F9FAFB', borderRadius: 6 }}>No {title.toLowerCase()} yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {displayList.map(email => {
            const isSelf = norm(email) === norm(currentEmail);
            const isSuper = superSet.has(norm(email));
            return (
              <div key={email} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: isSuper ? '#FEF3C7' : '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#111827' }}>{email}</span>
                  {isSelf && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#DBEAFE', color: '#1E40AF', fontWeight: 600 }}>YOU</span>}
                  {isSuper && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#FDE68A', color: '#78350F', fontWeight: 600 }}>SUPER ADMIN</span>}
                </div>
                <button
                  onClick={() => onRemove(email)}
                  disabled={saving || isSuper}
                  title={isSuper ? 'Super admins cannot be removed here' : 'Remove'}
                  style={{
                    fontSize: 11, padding: '4px 10px', fontWeight: 600,
                    background: isSuper ? '#F3F4F6' : '#FEE2E2',
                    color: isSuper ? '#9CA3AF' : '#991B1B',
                    border: '1px solid ' + (isSuper ? '#E5E7EB' : '#FCA5A5'),
                    borderRadius: 6, cursor: isSuper ? 'not-allowed' : 'pointer',
                  }}
                >Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
