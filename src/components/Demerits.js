import React, { useState } from 'react';
import { useConductEntries } from '../hooks/useFirestore';
import { HOUSES } from '../data/virtueData';

const HOUSE_COLORS = {
  Augustine:  { bg: '#1B3A5C', light: '#E8EEF4' },
  Athanasius: { bg: '#8B2252', light: '#F5E6EE' },
  Chrysostom: { bg: '#C9A227', light: '#FDF8E8' },
  Ambrose:    { bg: '#2E7D5B', light: '#E4F2EB' },
};

const CATEGORIES = {
  demerit: ['Dress code violation', 'Tardy to class', 'Disruptive behavior', 'Disrespectful to teacher', 'Disrespectful to student', 'Phone violation', 'Academic dishonesty', 'Failure to complete work', 'Other'],
  merit: ['Outstanding participation', 'Act of charity', 'Academic excellence', 'Leadership', 'Service to school', 'Improvement/Growth', 'Sportsmanship', 'Other'],
};

export default function Demerits({ uid, isAdmin, masterStudents }) {
  const { entries, loading, addEntry } = useConductEntries();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [newEntry, setNewEntry] = useState({
    type: 'demerit', studentName: '', house: '', category: CATEGORIES.demerit[0],
    description: '', date: new Date().toISOString().split('T')[0],
  });

  const matchingStudents = (masterStudents || []).filter(s =>
    studentSearch && s.name.toLowerCase().includes(studentSearch.toLowerCase())
  ).slice(0, 8);

  const selectStudent = (student) => {
    setNewEntry({ ...newEntry, studentName: student.name, house: student.house });
    setStudentSearch('');
  };

  const handleAdd = async () => {
    if (!newEntry.studentName.trim() || !newEntry.description.trim()) return;
    await addEntry({ ...newEntry, addedBy: uid });
    setNewEntry({ type: newEntry.type, studentName: '', house: '', category: CATEGORIES[newEntry.type][0], description: '', date: new Date().toISOString().split('T')[0] });
  };

  const filtered = entries.filter(e => filter === 'all' || e.type === filter);
  const meritCount = entries.filter(e => e.type === 'merit').length;
  const demeritCount = entries.filter(e => e.type === 'demerit').length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Conduct Log</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ New Entry'}</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16A34A' }}>{meritCount}</div>
          <div className="stat-label">Merits</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#DC2626' }}>{demeritCount}</div>
          <div className="stat-label">Demerits</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{entries.length}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20, background: '#F9FAFB' }}>
          <div className="setup-row">
            <select value={newEntry.type} onChange={e => setNewEntry({ ...newEntry, type: e.target.value, category: CATEGORIES[e.target.value][0] })} style={{ maxWidth: 120 }}>
              <option value="demerit">Demerit</option>
              <option value="merit">Merit</option>
            </select>
            <div style={{ flex: 2, position: 'relative' }}>
              <input type="text" placeholder="Search student..."
                value={newEntry.studentName || studentSearch}
                onChange={e => { setStudentSearch(e.target.value); setNewEntry({ ...newEntry, studentName: '', house: '' }); }} />
              {matchingStudents.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {matchingStudents.map(s => (
                    <div key={s.id} onClick={() => selectStudent(s)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{s.name}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{s.house}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {newEntry.house && <span className="badge" style={{ background: HOUSE_COLORS[newEntry.house]?.light, color: HOUSE_COLORS[newEntry.house]?.bg, alignSelf: 'center' }}>{newEntry.house}</span>}
            <input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} style={{ maxWidth: 160 }} />
          </div>
          <div className="setup-row" style={{ marginTop: 8 }}>
            <select value={newEntry.category} onChange={e => setNewEntry({ ...newEntry, category: e.target.value })}>
              {CATEGORIES[newEntry.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="setup-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Description / details" value={newEntry.description}
              onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 3 }} />
            <button className={`btn ${newEntry.type === 'merit' ? 'btn-gold' : 'btn-danger'}`}
              onClick={handleAdd} disabled={!newEntry.studentName} style={{ minWidth: 80 }}>
              Log {newEntry.type === 'merit' ? 'Merit' : 'Demerit'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ id: 'all', label: 'All' }, { id: 'demerit', label: 'Demerits' }, { id: 'merit', label: 'Merits' }].map(f => (
          <button key={f.id} className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No entries yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Date</th><th>Student</th><th>House</th><th>Category</th><th>Description</th></tr></thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td><span className={`badge ${e.type === 'merit' ? 'badge-green' : 'badge-red'}`}>{e.type === 'merit' ? '★ Merit' : '✗ Demerit'}</span></td>
                  <td style={{ fontSize: 13 }}>{e.date}</td>
                  <td style={{ fontWeight: 500 }}>{e.studentName}</td>
                  <td>{e.house ? <span className="badge" style={{ background: HOUSE_COLORS[e.house]?.light, color: HOUSE_COLORS[e.house]?.bg }}>{e.house}</span> : '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.category}</td>
                  <td style={{ fontSize: 13, maxWidth: 250 }}>{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
