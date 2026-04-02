import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CATEGORIES = [
  { value: 'merit', label: 'Merit', color: '#16A34A', bg: '#F0FDF4' },
  { value: 'demerit', label: 'Demerit', color: '#DC2626', bg: '#FEF2F2' },
  { value: 'detention', label: 'Detention', color: '#EA580C', bg: '#FFF7ED' },
  { value: 'commendation', label: 'Commendation', color: '#1B3A5C', bg: '#EFF6FF' },
];

const DEMERIT_REASONS = [
  'Dress code violation',
  'Tardy to class',
  'Disrespectful behavior',
  'Unprepared for class',
  'Disruptive behavior',
  'Technology violation',
  'Off-task / not engaged',
  'Other',
];

const MERIT_REASONS = [
  'Academic excellence',
  'Acts of charity',
  'Leadership',
  'Improvement / growth',
  'Service to the school',
  'Exemplary conduct',
  'Other',
];

export default function Demerits({ uid, isAdmin }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEntry, setNewEntry] = useState({
    type: 'demerit',
    student: '',
    reason: '',
    customReason: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [filter, setFilter] = useState('all');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const ref = doc(db, 'teachers', uid, 'conductLog', 'entries');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setEntries(snap.data().log || []);
      }
    } catch (err) {
      console.error('Error loading conduct log:', err);
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const saveEntries = async (newLog) => {
    try {
      const ref = doc(db, 'teachers', uid, 'conductLog', 'entries');
      await setDoc(ref, { log: newLog });
      setEntries(newLog);
    } catch (err) {
      console.error('Error saving conduct log:', err);
    }
  };

  const addEntry = async () => {
    if (!newEntry.student.trim()) return;
    const reason = newEntry.reason === 'Other' ? newEntry.customReason : newEntry.reason;
    if (!reason.trim()) return;

    const entry = {
      id: Date.now(),
      type: newEntry.type,
      student: newEntry.student.trim(),
      reason: reason.trim(),
      date: newEntry.date,
      notes: newEntry.notes.trim(),
      createdAt: new Date().toISOString(),
      by: uid,
    };

    const updated = [entry, ...entries];
    await saveEntries(updated);
    setNewEntry({ ...newEntry, student: '', reason: '', customReason: '', notes: '' });
  };

  const deleteEntry = async (id) => {
    const updated = entries.filter(e => e.id !== id);
    await saveEntries(updated);
  };

  const filteredEntries = filter === 'all' ? entries : entries.filter(e => e.type === filter);
  const reasons = newEntry.type === 'merit' || newEntry.type === 'commendation' ? MERIT_REASONS : DEMERIT_REASONS;

  // Stats
  const meritCount = entries.filter(e => e.type === 'merit' || e.type === 'commendation').length;
  const demeritCount = entries.filter(e => e.type === 'demerit' || e.type === 'detention').length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading conduct log...</div>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 16 }}>Conduct Log</h2>

      {/* Quick Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: '10px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A', fontFamily: 'var(--font-display)' }}>{meritCount}</div>
          <div style={{ fontSize: 11, color: '#15803D' }}>Merits / Commendations</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#DC2626', fontFamily: 'var(--font-display)' }}>{demeritCount}</div>
          <div style={{ fontSize: 11, color: '#B91C1C' }}>Demerits / Detentions</div>
        </div>
      </div>

      {/* New Entry Form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3 className="section-title">New Entry</h3></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className="btn btn-sm"
              style={{
                background: newEntry.type === cat.value ? cat.color : cat.bg,
                color: newEntry.type === cat.value ? '#FFF' : cat.color,
                border: `1px solid ${cat.color}`,
              }}
              onClick={() => setNewEntry({ ...newEntry, type: cat.value, reason: '', customReason: '' })}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="setup-row">
          <input type="text" placeholder="Student name" value={newEntry.student} onChange={e => setNewEntry({ ...newEntry, student: e.target.value })} style={{ flex: 1 }} />
          <input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} style={{ width: 'auto' }} />
        </div>
        <div className="setup-row">
          <select value={newEntry.reason} onChange={e => setNewEntry({ ...newEntry, reason: e.target.value })} style={{ flex: 1 }}>
            <option value="">Select reason...</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {newEntry.reason === 'Other' && (
            <input type="text" placeholder="Describe reason" value={newEntry.customReason} onChange={e => setNewEntry({ ...newEntry, customReason: e.target.value })} style={{ flex: 1 }} />
          )}
        </div>
        <div className="setup-row">
          <input type="text" placeholder="Additional notes (optional)" value={newEntry.notes} onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={addEntry}>Add Entry</button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>All ({entries.length})</button>
        {CATEGORIES.map(cat => {
          const count = entries.filter(e => e.type === cat.value).length;
          return (
            <button key={cat.value} className={`btn btn-sm ${filter === cat.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(cat.value)}>
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No entries yet.</div>
      ) : (
        <div>
          {filteredEntries.map(entry => {
            const cat = CATEGORIES.find(c => c.value === entry.type) || CATEGORIES[1];
            return (
              <div key={entry.id} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '12px 0', borderBottom: '1px solid #F3F4F6',
              }}>
                <div style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: cat.bg, color: cat.color,
                  fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 2,
                }}>
                  {cat.label}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1F2937' }}>{entry.student}</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>{entry.reason}</div>
                  {entry.notes && <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>{entry.notes}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>{entry.date}</div>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 10, padding: '2px 6px', color: '#DC2626', background: 'transparent', marginTop: 4 }}
                    onClick={() => deleteEntry(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
