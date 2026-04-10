import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useHousePoints } from '../hooks/useFirestore';
import { HOUSES } from '../data/virtueData';

const HOUSE_COLORS = {
  Augustine:  { bg: '#B91C1C', light: '#FEE2E2' },
  Athanasius: { bg: '#15803D', light: '#DCFCE7' },
  Chrysostom: { bg: '#0284C7', light: '#E0F2FE' },
  Ambrose:    { bg: '#CA8A04', light: '#FEF9C3' },
};

const MERIT_CATEGORIES = ['Virtue', 'Academic', 'Service', 'Leadership', 'Sportsmanship', 'Outstanding Participation', 'Act of Charity', 'Improvement/Growth', 'Other'];
const DEMERIT_CATEGORIES = ['Dress Code Violation', 'Tardy to Class', 'Disruptive Behavior', 'Disrespectful to Teacher', 'Disrespectful to Student', 'Phone Violation', 'Academic Dishonesty', 'Failure to Complete Work', 'Other'];
const STUDENT_DENOMINATIONS = [1, 3, 7, 12];

// CSV parser (handles quoted fields)
function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export default function HousePoints({ uid, isAdmin, masterStudents }) {
  const { entries, loading, addEntry, bulkAddEntries, deleteEntry, resetAll } = useHousePoints();
  const [showAdd, setShowAdd] = useState(false);
  const [entryType, setEntryType] = useState('merit'); // 'merit' or 'demerit'
  const [awardTarget, setAwardTarget] = useState('student'); // 'student' or 'house'
  const [filterHouse, setFilterHouse] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [houseLeadership, setHouseLeadership] = useState({});
  const [editingLeadership, setEditingLeadership] = useState(false);

  // Check freeze status and load house leadership on load
  useEffect(() => {
    getDoc(doc(db, 'config', 'housePoints')).then(snap => {
      if (snap.exists()) {
        if (snap.data().frozen) setIsFrozen(true);
        if (snap.data().leadership) setHouseLeadership(snap.data().leadership);
      }
    }).catch(() => {});
  }, []);

  const saveLeadership = async (updated) => {
    setHouseLeadership(updated);
    try {
      const snap = await getDoc(doc(db, 'config', 'housePoints'));
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(doc(db, 'config', 'housePoints'), { ...existing, leadership: updated });
      window.dispatchEvent(new CustomEvent('toast', { detail: 'House leadership saved' }));
    } catch (err) { console.error('Save leadership failed:', err); }
    setEditingLeadership(false);
  };

  // Toggle freeze
  const toggleFreeze = useCallback(async () => {
    setFreezing(true);
    if (isFrozen) {
      // Unfreeze
      await setDoc(doc(db, 'config', 'housePoints'), { frozen: false, frozenTotals: null });
      setIsFrozen(false);
    } else {
      // Freeze — save current totals
      const currentTotals = {};
      HOUSES.forEach(h => { currentTotals[h] = 0; });
      entries.forEach(e => { if (e.house && e.points) currentTotals[e.house] += Number(e.points); });
      await setDoc(doc(db, 'config', 'housePoints'), { frozen: true, frozenTotals: currentTotals, frozenAt: new Date().toISOString() });
      setIsFrozen(true);
    }
    setFreezing(false);
  }, [isFrozen, entries]);
  const [newEntry, setNewEntry] = useState({
    studentName: '', house: '', points: 1, category: MERIT_CATEGORIES[0], reason: '',
  });
  const [houseAward, setHouseAward] = useState({
    house: 'Augustine', points: '', reason: '',
  });

  // CSV Import
  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV appears empty.'); return; }
      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const nameIdx = header.findIndex(h => h.includes('student') || h.includes('name'));
      const houseIdx = header.findIndex(h => h.includes('house'));
      const pointsIdx = header.findIndex(h => h.includes('point') || h.includes('value') || h.includes('amount') || h.includes('score') || h === 'pts' || h === 'number');
      // Support separate merit/demerit columns (e.g. "Merit" and "Demerit" as separate columns)
      const meritIdx = header.findIndex(h => h === 'merit' || h === 'merits');
      const demeritIdx = header.findIndex(h => h === 'demerit' || h === 'demerits');
      const hasSplitColumns = meritIdx !== -1 && demeritIdx !== -1;
      const catIdx = header.findIndex(h => h.includes('category') || h.includes('reason') || h.includes('desc') || h.includes('note'));
      const reasonIdx = header.findIndex(h => h.includes('reason') || h.includes('desc') || h.includes('note'));
      const typeIdx = header.findIndex(h => h === 'type' || h === 'merit/demerit');
      const dateIdx = header.findIndex(h => h.includes('date'));
      const givenByIdx = header.findIndex(h => h.includes('given') || h.includes('teacher') || h.includes('by'));
      if (nameIdx === -1 && houseIdx === -1) { alert('CSV needs at least a column containing "student", "name", or "house".\n\nYour columns: ' + header.join(', ')); return; }
      if (pointsIdx === -1 && !hasSplitColumns) { alert('CSV needs a column containing "point", "value", "amount", or "score" — or separate "merit" and "demerit" columns.\n\nYour columns: ' + header.join(', ')); return; }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        let pts, type;
        if (hasSplitColumns) {
          // Separate merit/demerit columns — use whichever has a value
          const meritVal = parseFloat(cells[meritIdx]) || 0;
          const demeritVal = parseFloat(cells[demeritIdx]) || 0;
          if (meritVal > 0) { pts = meritVal; type = 'merit'; }
          else if (demeritVal > 0) { pts = -demeritVal; type = 'demerit'; }
          else continue; // skip rows with no points
        } else {
          pts = parseFloat(cells[pointsIdx]);
          if (isNaN(pts) || pts === 0) continue;
          type = typeIdx >= 0 ? (cells[typeIdx] || '').toLowerCase() : '';
          if (!type || (type !== 'merit' && type !== 'demerit')) type = pts > 0 ? 'merit' : 'demerit';
        }
        const name = nameIdx >= 0 ? cells[nameIdx] || '' : '';
        let house = houseIdx >= 0 ? cells[houseIdx] || '' : '';
        if (house) { const match = HOUSES.find(h => h.toLowerCase() === house.toLowerCase()); house = match || house; }
        // Auto-detect house from master roster if not provided
        if (!house && name) {
          const ms = (masterStudents || []).find(s => s.name.toLowerCase() === name.toLowerCase());
          if (ms) house = ms.house;
        }
        const category = reasonIdx >= 0 ? cells[reasonIdx] || '' : (catIdx >= 0 ? cells[catIdx] || '' : 'Other');
        const reason = reasonIdx >= 0 ? cells[reasonIdx] || '' : '';
        const date = dateIdx >= 0 ? cells[dateIdx] || '' : '';
        const warning = !house ? 'No house' : (!HOUSES.includes(house) ? 'Unknown house' : '');
        rows.push({ studentName: name, house, points: Math.abs(pts), signedPoints: pts, type, category, reason, date, warning, target: name ? 'student' : 'house' });
      }
      if (rows.length === 0) { alert('No valid rows found.'); return; }
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCsvImport = async () => {
    setCsvImporting(true);
    try {
      const now = new Date().toISOString();
      const allEntries = csvPreview.map(row => {
        let createdAt = now;
        if (row.date) {
          try {
            const d = new Date(row.date);
            if (!isNaN(d.getTime())) createdAt = d.toISOString();
          } catch (_) { /* use default */ }
        }
        return {
          studentName: row.studentName,
          house: row.house,
          points: row.signedPoints,
          category: row.category,
          reason: row.reason,
          type: row.type,
          target: row.target,
          addedBy: uid,
          createdAt,
        };
      });
      await bulkAddEntries(allEntries, (done, total, msg) => {
        setImportProgress(msg || `Writing ${done} / ${total}...`);
      });
      setCsvPreview([]);
      window.dispatchEvent(new CustomEvent('toast', { detail: `Imported ${allEntries.length} house point entries` }));
    } catch (err) {
      console.error('Import error:', err);
      alert('Import failed: ' + err.message);
    }
    setCsvImporting(false);
  };

  const matchingStudents = (masterStudents || []).filter(s =>
    studentSearch && s.name.toLowerCase().includes(studentSearch.toLowerCase())
  ).slice(0, 8);

  const selectStudent = (student) => {
    setNewEntry({ ...newEntry, studentName: student.name, house: student.house });
    setStudentSearch('');
  };

  const handleAddStudent = async () => {
    if (!newEntry.studentName.trim() || !newEntry.reason.trim()) return;
    const pts = entryType === 'merit' ? newEntry.points : -newEntry.points;
    await addEntry({
      studentName: newEntry.studentName,
      house: newEntry.house,
      points: pts,
      category: newEntry.category,
      reason: newEntry.reason,
      type: entryType,
      target: 'student',
      addedBy: uid,
    });
    setNewEntry({ studentName: '', house: '', points: 1, category: entryType === 'merit' ? MERIT_CATEGORIES[0] : DEMERIT_CATEGORIES[0], reason: '' });
  };

  const handleAddHouse = async () => {
    if (!houseAward.reason.trim() || !houseAward.points) return;
    const pts = entryType === 'merit' ? Number(houseAward.points) : -Math.abs(Number(houseAward.points));
    await addEntry({
      studentName: '',
      house: houseAward.house,
      points: pts,
      category: entryType === 'merit' ? 'House Merit' : 'House Demerit',
      reason: houseAward.reason,
      type: entryType,
      target: 'house',
      addedBy: uid,
    });
    setHouseAward({ house: houseAward.house, points: '', reason: '' });
  };

  // Tally totals per house (merits positive, demerits negative — net total)
  const totals = {};
  HOUSES.forEach(h => { totals[h] = 0; });
  entries.forEach(e => { if (e.house && e.points) totals[e.house] += Number(e.points); });

  const maxPoints = Math.max(...Object.values(totals).map(Math.abs), 1);
  const sorted = [...HOUSES].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  // Counts
  const meritCount = entries.filter(e => e.type === 'merit' || (!e.type && e.points > 0)).length;
  const demeritCount = entries.filter(e => e.type === 'demerit' || (!e.type && e.points < 0)).length;

  // Top students (by net points)
  const studentTotals = {};
  entries.forEach(e => {
    if (e.studentName) {
      if (!studentTotals[e.studentName]) studentTotals[e.studentName] = { name: e.studentName, house: e.house, points: 0, merits: 0, demerits: 0 };
      studentTotals[e.studentName].points += Number(e.points);
      if (e.type === 'demerit' || e.points < 0) studentTotals[e.studentName].demerits++;
      else studentTotals[e.studentName].merits++;
    }
  });
  const topStudents = Object.values(studentTotals).sort((a, b) => b.points - a.points).slice(0, 10);

  // Filter entries
  const filtered = entries.filter(e => {
    if (filterHouse !== 'all' && e.house !== filterHouse) return false;
    if (filterType === 'merit' && !(e.type === 'merit' || (!e.type && e.points > 0))) return false;
    if (filterType === 'demerit' && !(e.type === 'demerit' || (!e.type && e.points < 0))) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className="section-title">House Points</h2>
          {isFrozen && <span className="badge" style={{ background: '#EFF6FF', color: '#0284C7' }}>Public Board Frozen</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-sm btn-secondary" disabled={freezing}
              onClick={toggleFreeze}>
              {freezing ? '...' : isFrozen ? '👁 Unfreeze Board' : '❄️ Freeze Board'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-sm btn-secondary" style={{ color: '#DC2626' }}
              onClick={() => setShowReset(true)}>Reset All</button>
          )}
          {isAdmin && (
            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              📥 Import CSV
              <input type="file" accept=".csv" onChange={handleCsvFile} style={{ display: 'none' }} />
            </label>
          )}
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Log Merit / Demerit'}
          </button>
        </div>
      </div>

      {/* Reset Confirmation */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: '#DC2626' }}>Reset All House Points</h3>
              <button className="modal-close" onClick={() => setShowReset(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12, fontSize: 14 }}>
                This will permanently delete <strong>all {entries.length} entries</strong> — every merit, demerit, and house award. All house totals will go to zero.
              </p>
              <p style={{ marginBottom: 16, fontSize: 14, color: '#DC2626', fontWeight: 600 }}>
                This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowReset(false)}>Cancel</button>
                <button className="btn btn-danger" disabled={resetting}
                  onClick={async () => {
                    setResetting(true);
                    await resetAll();
                    setResetting(false);
                    setShowReset(false);
                  }}>
                  {resetting ? 'Resetting...' : 'Yes, Reset Everything'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Preview */}
      {csvPreview.length > 0 && (
        <div className="modal-overlay" onClick={() => setCsvPreview([])}>
          <div className="modal-content" style={{ maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Import Preview — {csvPreview.length} entries</h3>
              <button className="modal-close" onClick={() => setCsvPreview([])}>&times;</button>
            </div>
            <div className="modal-body">
              {csvPreview.some(r => r.warning) && (
                <div style={{ padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#92400E' }}>
                  Some rows have warnings — check the rightmost column.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead><tr><th>Student</th><th>House</th><th>Type</th><th>Pts</th><th>Category</th><th>Reason</th><th>Date</th><th></th></tr></thead>
                  <tbody>
                    {csvPreview.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td>{r.studentName || <em style={{ color: '#9CA3AF' }}>House award</em>}</td>
                        <td>{r.house}</td>
                        <td><span style={{ color: r.type === 'merit' ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{r.type}</span></td>
                        <td style={{ fontWeight: 600 }}>{r.signedPoints > 0 ? '+' : ''}{r.signedPoints}</td>
                        <td>{r.category}</td>
                        <td>{r.reason}</td>
                        <td>{r.date}</td>
                        <td>{r.warning && <span style={{ color: '#CA8A04', fontSize: 11 }}>{r.warning}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreview.length > 50 && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>...and {csvPreview.length - 50} more rows</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setCsvPreview([])}>Cancel</button>
                <button className="btn btn-primary" disabled={csvImporting} onClick={handleCsvImport}>
                  {csvImporting ? (importProgress || 'Starting import...') : `Import ${csvPreview.length} Entries`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
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
          <div className="stat-label">Total Entries</div>
        </div>
      </div>

      {/* Log Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 20, background: entryType === 'merit' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${entryType === 'merit' ? '#BBF7D0' : '#FECACA'}` }}>
          {/* Merit vs Demerit */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className={`btn btn-sm ${entryType === 'merit' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEntryType('merit'); setNewEntry({ ...newEntry, category: MERIT_CATEGORIES[0] }); }}
              style={entryType === 'merit' ? { background: '#16A34A' } : {}}>
              ★ Merit (+)
            </button>
            <button className={`btn btn-sm ${entryType === 'demerit' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEntryType('demerit'); setNewEntry({ ...newEntry, category: DEMERIT_CATEGORIES[0] }); }}
              style={entryType === 'demerit' ? { background: '#DC2626' } : {}}>
              ✗ Demerit (−)
            </button>
            <div style={{ borderLeft: '1px solid #D1D5DB', margin: '0 4px' }} />
            <button className={`btn btn-sm ${awardTarget === 'student' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAwardTarget('student')}>To Student</button>
            <button className={`btn btn-sm ${awardTarget === 'house' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAwardTarget('house')}>To House</button>
          </div>

          {/* Student Entry */}
          {awardTarget === 'student' && (
            <>
              <div className="setup-row">
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
                {newEntry.house && (
                  <span className="badge" style={{ background: HOUSE_COLORS[newEntry.house]?.light, color: HOUSE_COLORS[newEntry.house]?.bg, alignSelf: 'center' }}>
                    {newEntry.house}
                  </span>
                )}
              </div>
              <div className="setup-row" style={{ marginTop: 8 }}>
                <select value={newEntry.category} onChange={e => setNewEntry({ ...newEntry, category: e.target.value })}>
                  {(entryType === 'merit' ? MERIT_CATEGORIES : DEMERIT_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 4 }}>
                  {STUDENT_DENOMINATIONS.map(p => (
                    <button key={p}
                      className={`btn btn-sm ${newEntry.points === p ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setNewEntry({ ...newEntry, points: p })}
                      style={newEntry.points === p ? { background: entryType === 'merit' ? '#16A34A' : '#DC2626' } : { minWidth: 40 }}>
                      {entryType === 'merit' ? '+' : '−'}{p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-row" style={{ marginTop: 8 }}>
                <input type="text" placeholder="Reason" value={newEntry.reason}
                  onChange={e => setNewEntry({ ...newEntry, reason: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddStudent()} style={{ flex: 3 }} />
                <button className="btn" onClick={handleAddStudent} disabled={!newEntry.studentName}
                  style={{ background: entryType === 'merit' ? '#16A34A' : '#DC2626', color: '#fff' }}>
                  Log {entryType === 'merit' ? 'Merit' : 'Demerit'}
                </button>
              </div>
            </>
          )}

          {/* House Entry */}
          {awardTarget === 'house' && (
            <>
              <div className="setup-row">
                <select value={houseAward.house} onChange={e => setHouseAward({ ...houseAward, house: e.target.value })}>
                  {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <input type="number" placeholder="Points (any amount)" value={houseAward.points}
                  onChange={e => setHouseAward({ ...houseAward, points: e.target.value })} style={{ maxWidth: 160 }} />
              </div>
              <div className="setup-row" style={{ marginTop: 8 }}>
                <input type="text" placeholder="Reason" value={houseAward.reason}
                  onChange={e => setHouseAward({ ...houseAward, reason: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddHouse()} style={{ flex: 3 }} />
                <button className="btn" onClick={handleAddHouse} disabled={!houseAward.points}
                  style={{ background: entryType === 'merit' ? '#16A34A' : '#DC2626', color: '#fff' }}>
                  {entryType === 'merit' ? '+' : '−'} to {houseAward.house}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>House Standings</div>
        {isAdmin && (
          <button className="btn btn-sm btn-secondary" style={{ fontSize: 10 }} onClick={() => setEditingLeadership(!editingLeadership)}>
            {editingLeadership ? 'Cancel' : 'Edit Captains & Prefects'}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {sorted.map((house, idx) => {
          const pts = totals[house] || 0;
          const pct = maxPoints > 0 ? (Math.abs(pts) / maxPoints) * 100 : 0;
          const colors = HOUSE_COLORS[house];
          const leaders = houseLeadership[house] || {};
          return (
            <div key={house} style={{
              background: colors.light, borderRadius: 10, padding: 16,
              position: 'relative', overflow: 'hidden', cursor: editingLeadership ? 'default' : 'pointer',
              border: filterHouse === house ? `2px solid ${colors.bg}` : '2px solid transparent',
            }} onClick={() => !editingLeadership && setFilterHouse(filterHouse === house ? 'all' : house)}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${Math.max(pct, 2)}%`, background: colors.bg, opacity: 0.12,
                borderRadius: 10, transition: 'width 0.5s ease'
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: colors.bg, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)',
                  }}>{idx + 1}</span>
                  <div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: colors.bg }}>
                      {house}
                    </span>
                    {!editingLeadership && (leaders.captain || leaders.prefect) && (
                      <div style={{ fontSize: 11, color: colors.bg, opacity: 0.8, marginTop: 2 }}>
                        {leaders.captain && <span>Captain: <strong>{leaders.captain}</strong></span>}
                        {leaders.captain && leaders.prefect && <span> · </span>}
                        {leaders.prefect && <span>Prefect: <strong>{leaders.prefect}</strong></span>}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: colors.bg }}>
                  {pts}
                </span>
              </div>
              {editingLeadership && (
                <div style={{ position: 'relative', marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <label style={{ fontSize: 10, color: colors.bg, fontWeight: 600, display: 'block', marginBottom: 2 }}>House Captain</label>
                    <select value={leaders.captain || ''} onChange={e => {
                      const updated = { ...houseLeadership, [house]: { ...leaders, captain: e.target.value } };
                      setHouseLeadership(updated);
                    }} style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: `1px solid ${colors.bg}40` }}>
                      <option value="">— Select —</option>
                      {(masterStudents || []).filter(s => !s.house || s.house === house).sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <label style={{ fontSize: 10, color: colors.bg, fontWeight: 600, display: 'block', marginBottom: 2 }}>House Prefect</label>
                    <select value={leaders.prefect || ''} onChange={e => {
                      const updated = { ...houseLeadership, [house]: { ...leaders, prefect: e.target.value } };
                      setHouseLeadership(updated);
                    }} style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: `1px solid ${colors.bg}40` }}>
                      <option value="">— Select —</option>
                      {(masterStudents || []).filter(s => !s.house || s.house === house).sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {editingLeadership && (
          <button className="btn btn-sm btn-gold" onClick={() => saveLeadership(houseLeadership)} style={{ justifySelf: 'end' }}>
            Save Leadership
          </button>
        )}
      </div>

      {/* Top Students */}
      {topStudents.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Top Students</h3>
          <table className="data-table">
            <thead><tr><th>Student</th><th>House</th><th>Merits</th><th>Demerits</th><th>Net</th></tr></thead>
            <tbody>
              {topStudents.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className="badge" style={{ background: HOUSE_COLORS[s.house]?.light, color: HOUSE_COLORS[s.house]?.bg }}>{s.house}</span></td>
                  <td style={{ color: '#16A34A', fontWeight: 500 }}>{s.merits}</td>
                  <td style={{ color: s.demerits > 0 ? '#DC2626' : undefined, fontWeight: s.demerits > 0 ? 500 : undefined }}>{s.demerits}</td>
                  <td style={{ fontWeight: 600 }}>{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity Log */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title">
          {filterHouse !== 'all' ? `${filterHouse} Log` : 'Activity Log'}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'All' }, { id: 'merit', label: 'Merits' }, { id: 'demerit', label: 'Demerits' }].map(f => (
            <button key={f.id} className={`btn btn-sm ${filterType === f.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType(f.id)}>{f.label}</button>
          ))}
          {filterHouse !== 'all' && (
            <button className="btn btn-sm btn-secondary" onClick={() => setFilterHouse('all')}>Clear: {filterHouse}</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No entries yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Type</th><th>House</th><th>Student</th><th>Category</th><th>Points</th><th>Reason</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {filtered.slice(0, 50).map(e => {
                const isMerit = e.type === 'merit' || (!e.type && e.points > 0);
                return (
                  <tr key={e.id}>
                    <td><span className={`badge ${isMerit ? 'badge-green' : 'badge-red'}`}>{isMerit ? '★ Merit' : '✗ Demerit'}</span></td>
                    <td><span className="badge" style={{ background: HOUSE_COLORS[e.house]?.light, color: HOUSE_COLORS[e.house]?.bg }}>{e.house}</span></td>
                    <td style={{ fontWeight: 500 }}>{e.studentName || <span style={{ fontStyle: 'italic', color: '#9CA3AF' }}>House</span>}</td>
                    <td style={{ fontSize: 12 }}>{e.category || '—'}</td>
                    <td style={{ fontWeight: 600, color: isMerit ? '#16A34A' : '#DC2626' }}>{e.points > 0 ? '+' : ''}{e.points}</td>
                    <td style={{ fontSize: 13 }}>{e.reason}</td>
                    <td style={{ fontSize: 12, color: '#9CA3AF' }}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                    <td>
                      {confirmDeleteId === e.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-danger" onClick={async () => { await deleteEntry(e.id); setConfirmDeleteId(null); }}>Yes</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm" style={{ background: 'none', color: '#DC2626', padding: '4px 6px' }}
                          onClick={() => setConfirmDeleteId(e.id)} title="Delete">×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
