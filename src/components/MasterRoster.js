import React, { useState } from 'react';
import { HOUSES } from '../data/virtueData';

export default function MasterRoster({ students, onAdd, onUpdate, onRemove, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newStudent, setNewStudent] = useState({ name: '', house: 'Augustine', gender: 'he', parentEmail: '', studentEmail: '' });
  const [search, setSearch] = useState('');
  const [filterHouse, setFilterHouse] = useState('all');

  const handleAdd = async () => {
    if (!newStudent.name.trim()) return;
    await onAdd(newStudent);
    setNewStudent({ name: '', house: 'Augustine', gender: 'he', parentEmail: '', studentEmail: '' });
  };

  const handleUpdate = async (id, field, value) => {
    await onUpdate(id, { [field]: value });
  };

  const handleRemove = async (id, name) => {
    if (window.confirm(`Remove ${name} from the master roster? This cannot be undone.`)) {
      await onRemove(id);
    }
  };

  const filtered = students.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesHouse = filterHouse === 'all' || s.house === filterHouse;
    return matchesSearch && matchesHouse;
  });

  const houseCounts = {};
  HOUSES.forEach(h => { houseCounts[h] = students.filter(s => s.house === h).length; });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Master Roster ({students.length} students)</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onRefresh}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Student'}
          </button>
        </div>
      </div>

      {/* House Summary */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {HOUSES.map(h => (
          <div key={h} className="stat-card" style={{ cursor: 'pointer', border: filterHouse === h ? '2px solid #1B3A5C' : undefined }}
            onClick={() => setFilterHouse(filterHouse === h ? 'all' : h)}>
            <div className="stat-value">{houseCounts[h]}</div>
            <div className="stat-label">{h}</div>
          </div>
        ))}
      </div>

      {/* Add Student Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>ADD NEW STUDENT</div>
          <div className="setup-row">
            <input type="text" placeholder="Full name (Last, First)" value={newStudent.name}
              onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 2 }} />
            <select value={newStudent.house} onChange={e => setNewStudent({ ...newStudent, house: e.target.value })}>
              {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={newStudent.gender} onChange={e => setNewStudent({ ...newStudent, gender: e.target.value })} style={{ maxWidth: 100 }}>
              <option value="he">Boy</option>
              <option value="she">Girl</option>
            </select>
          </div>
          <div className="setup-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Parent email (optional)" value={newStudent.parentEmail}
              onChange={e => setNewStudent({ ...newStudent, parentEmail: e.target.value })} />
            <input type="text" placeholder="Student email (optional)" value={newStudent.studentEmail}
              onChange={e => setNewStudent({ ...newStudent, studentEmail: e.target.value })} />
            <button className="btn btn-gold" onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input type="text" placeholder="Search students..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        {filterHouse !== 'all' && (
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }}
            onClick={() => setFilterHouse('all')}>
            Clear filter: {filterHouse}
          </button>
        )}
      </div>

      {/* Student Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>House</th>
              <th>Gender</th>
              <th>Parent Email</th>
              <th>Student Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>
                  {editId === s.id ? (
                    <select value={s.house} onChange={e => handleUpdate(s.id, 'house', e.target.value)}>
                      {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  ) : (
                    <span className="badge" style={{ cursor: 'pointer' }} onClick={() => setEditId(s.id)}>
                      {s.house || '—'}
                    </span>
                  )}
                </td>
                <td>
                  {editId === s.id ? (
                    <select value={s.gender || 'he'} onChange={e => handleUpdate(s.id, 'gender', e.target.value)}>
                      <option value="he">He</option>
                      <option value="she">She</option>
                    </select>
                  ) : (
                    <span style={{ cursor: 'pointer' }} onClick={() => setEditId(s.id)}>
                      {s.gender === 'she' 'Girl' : 'Boy'}
                    </span>
                  )}
                </td>
                <td>
                  {editId === s.id ? (
                    <input type="text" value={s.parentEmail || ''} style={{ width: 180 }}
                      onChange={e => handleUpdate(s.id, 'parentEmail', e.target.value)} />
                  ) : (
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{s.parentEmail || '—'}</span>
                  )}
                </td>
                <td>
                  {editId === s.id ? (
                    <input type="text" value={s.studentEmail || ''} style={{ width: 180 }}
                      onChange={e => handleUpdate(s.id, 'studentEmail', e.target.value)} />
                  ) : (
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{s.studentEmail || '—'}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {editId === s.id ? (
                      <button className="btn btn-sm btn-primary" onClick={() => setEditId(null)}>Done</button>
                    ) : (
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditId(s.id)}>Edit</button>
                    )}
                    <button className="btn btn-sm" style={{ background: 'none', color: '#DC2626', padding: '4px 6px' }}
                      onClick={() => handleRemove(s.id, s.name)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
