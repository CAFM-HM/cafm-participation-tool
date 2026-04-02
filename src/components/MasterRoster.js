import React, { useState, useMemo } from 'react';
import { HOUSES } from '../data/virtueData';

export default function MasterRoster({ students, onAdd, onUpdate, onRemove, onBulkImport, onRefresh, allTeachers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newStudent, setNewStudent] = useState({ name: '', house: 'Augustine', gender: 'he', parentEmail: '', studentEmail: '' });
  const [search, setSearch] = useState('');
  const [filterHouse, setFilterHouse] = useState('all');
  const [importSelections, setImportSelections] = useState({});
  const [importing, setImporting] = useState(false);

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

  // Gather all unique student names from all teachers' class rosters
  const existingNames = useMemo(() => {
    const names = new Set();
    (allTeachers || []).forEach(teacher => {
      (teacher.classes || []).forEach(cls => {
        (cls.students || []).forEach(stu => {
          if (stu.name) names.add(stu.name);
        });
      });
    });
    return [...names].sort();
  }, [allTeachers]);

  // Filter to only names NOT already in master roster
  const importableNames = useMemo(() => {
    const masterNames = new Set(students.map(s => s.name.toLowerCase()));
    return existingNames.filter(n => !masterNames.has(n.toLowerCase()));
  }, [existingNames, students]);

  const handleBulkImport = async () => {
    setImporting(true);
    const namesToImport = Object.entries(importSelections)
      .filter(([name, selected]) => selected)
      .map(([name]) => name);

    for (const name of namesToImport) {
      await onAdd({
        name,
        house: '',
        gender: 'he',
        parentEmail: '',
        studentEmail: '',
      });
    }
    setImportSelections({});
    setShowImport(false);
    setImporting(false);
    onRefresh();
  };

  const toggleAll = (checked) => {
    const newSelections = {};
    importableNames.forEach(n => { newSelections[n] = checked; });
    setImportSelections(newSelections);
  };

  const selectedCount = Object.values(importSelections).filter(Boolean).length;

  const filtered = students.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesHouse = filterHouse === 'all' || s.house === filterHouse;
    return matchesSearch && matchesHouse;
  });

  const houseCounts = {};
  HOUSES.forEach(h => { houseCounts[h] = students.filter(s => s.house === h).length; });
  const unassigned = students.filter(s => !s.house).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Master Roster ({students.length} students)</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onRefresh}>↻ Refresh</button>
          {importableNames.length > 0 && (
            <button className="btn btn-gold" onClick={() => setShowImport(!showImport)}>
              {showImport ? 'Cancel Import' : `Import from Tracker (${importableNames.length})`}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Student'}
          </button>
        </div>
      </div>

      {/* Bulk Import Panel */}
      {showImport && (
        <div className="card" style={{ marginBottom: 16, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: '#1B3A5C', marginBottom: 2 }}>Import Students from Daily Tracker</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                These {importableNames.length} students are in teacher class rosters but not yet in the master roster.
                Select the ones to import, then assign houses afterward.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => toggleAll(true)}>Select All</button>
            <button className="btn btn-sm btn-secondary" onClick={() => toggleAll(false)}>Deselect All</button>
            <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>{selectedCount} selected</span>
          </div>
          <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff' }}>
            {importableNames.map(name => (
              <label key={name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderBottom: '1px solid #F3F4F6', cursor: 'pointer', fontSize: 14,
              }}>
                <input
                  type="checkbox"
                  checked={!!importSelections[name]}
                  onChange={e => setImportSelections({ ...importSelections, [name]: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 500 }}>{name}</span>
              </label>
            ))}
            {importableNames.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF' }}>All students are already in the master roster.</div>
            )}
          </div>
          {selectedCount > 0 && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 10 }}
              onClick={handleBulkImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : `Import ${selectedCount} Student${selectedCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* House Summary */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {HOUSES.map(h => (
          <div key={h} className="stat-card" style={{ cursor: 'pointer', border: filterHouse === h ? '2px solid #1B3A5C' : undefined }}
            onClick={() => setFilterHouse(filterHouse === h ? 'all' : h)}>
            <div className="stat-value">{houseCounts[h]}</div>
            <div className="stat-label">{h}</div>
          </div>
        ))}
        {unassigned > 0 && (
          <div className="stat-card alert" style={{ cursor: 'pointer' }}
            onClick={() => setFilterHouse('unassigned')}>
            <div className="stat-value">{unassigned}</div>
            <div className="stat-label">No House</div>
          </div>
        )}
      </div>

      {/* Add Student Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>ADD NEW STUDENT</div>
          <div className="setup-row">
            <input type="text" placeholder="First Last (e.g. Faustina Arredondo)" value={newStudent.name}
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
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" placeholder="Search students..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        {filterHouse !== 'all' && (
          <button className="btn btn-sm btn-secondary"
            onClick={() => setFilterHouse('all')}>
            Clear: {filterHouse === 'unassigned' ? 'No House' : filterHouse}
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
            {filtered
              .filter(s => filterHouse !== 'unassigned' || !s.house)
              .map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>
                  {editId === s.id ? (
                    <select value={s.house || ''} onChange={e => handleUpdate(s.id, 'house', e.target.value)}>
                      <option value="">— Select —</option>
                      {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  ) : (
                    <span style={{ cursor: 'pointer', color: s.house ? undefined : '#DC2626', fontWeight: s.house ? undefined : 600 }}
                      onClick={() => setEditId(s.id)}>
                      {s.house || 'Assign House'}
                    </span>
                  )}
                </td>
                <td>
                  {editId === s.id ? (
                    <select value={s.gender || 'he'} onChange={e => handleUpdate(s.id, 'gender', e.target.value)}>
                      <option value="he">Boy</option>
                      <option value="she">Girl</option>
                    </select>
                  ) : (
                    <span style={{ cursor: 'pointer' }} onClick={() => setEditId(s.id)}>
                      {s.gender === 'she' ? 'Girl' : 'Boy'}
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
