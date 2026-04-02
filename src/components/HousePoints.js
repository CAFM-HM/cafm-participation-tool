import React, { useState } from 'react';
import { useHousePoints } from '../hooks/useFirestore';
import { HOUSES } from '../data/virtueData';

const HOUSE_COLORS = {
  Augustine:  { bg: '#1B3A5C', light: '#E8EEF4' },
  Athanasius: { bg: '#8B2252', light: '#F5E6EE' },
  Chrysostom: { bg: '#C9A227', light: '#FDF8E8' },
  Ambrose:    { bg: '#2E7D5B', light: '#E4F2EB' },
};

const CATEGORIES = ['Virtue', 'Academic', 'Service', 'Leadership', 'Sportsmanship', 'Other'];
const STUDENT_DENOMINATIONS = [1, 3, 7, 12];

export default function HousePoints({ uid, isAdmin, masterStudents }) {
  const { entries, loading, addEntry } = useHousePoints();
  const [showAdd, setShowAdd] = useState(false);
  const [awardType, setAwardType] = useState('student'); // 'student' or 'house'
  const [filterHouse, setFilterHouse] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [newEntry, setNewEntry] = useState({
    studentName: '', house: '', points: 1, category: 'Virtue', reason: '',
  });
  const [houseAward, setHouseAward] = useState({
    house: 'Augustine', points: '', reason: '',
  });

  const matchingStudents = (masterStudents || []).filter(s =>
    studentSearch && s.name.toLowerCase().includes(studentSearch.toLowerCase())
  ).slice(0, 8);

  const selectStudent = (student) => {
    setNewEntry({ ...newEntry, studentName: student.name, house: student.house });
    setStudentSearch('');
  };

  const handleAddStudent = async () => {
    if (!newEntry.studentName.trim() || !newEntry.reason.trim()) return;
    await addEntry({ ...newEntry, type: 'student', addedBy: uid });
    setNewEntry({ studentName: '', house: '', points: 1, category: 'Virtue', reason: '' });
  };

  const handleAddHouse = async () => {
    if (!houseAward.reason.trim() || !houseAward.points) return;
    await addEntry({
      studentName: '',
      house: houseAward.house,
      points: Number(houseAward.points),
      category: 'House Award',
      reason: houseAward.reason,
      type: 'house',
      addedBy: uid,
    });
    setHouseAward({ house: houseAward.house, points: '', reason: '' });
  };

  // Tally totals per house
  const totals = {};
  HOUSES.forEach(h => { totals[h] = 0; });
  entries.forEach(e => { if (e.house && e.points) totals[e.house] += Number(e.points); });

  const maxPoints = Math.max(...Object.values(totals), 1);
  const sorted = [...HOUSES].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  // Top students
  const studentTotals = {};
  entries.forEach(e => {
    if (e.studentName && e.points > 0) {
      if (!studentTotals[e.studentName]) studentTotals[e.studentName] = { name: e.studentName, house: e.house, points: 0 };
      studentTotals[e.studentName].points += Number(e.points);
    }
  });
  const topStudents = Object.values(studentTotals).sort((a, b) => b.points - a.points).slice(0, 10);

  const filtered = filterHouse === 'all' ? entries : entries.filter(e => e.house === filterHouse);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">House Points</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Award Points'}
        </button>
      </div>

      {/* Award Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 20, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          {/* Toggle: Student vs House */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              className={`btn btn-sm ${awardType === 'student' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAwardType('student')}
            >
              Award to Student
            </button>
            <button
              className={`btn btn-sm ${awardType === 'house' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAwardType('house')}
            >
              Award to House
            </button>
          </div>

          {/* Student Award */}
          {awardType === 'student' && (
            <>
              <div className="setup-row">
                <div style={{ flex: 2, position: 'relative' }}>
                  <input type="text" placeholder="Search student..."
                    value={newEntry.studentName || studentSearch}
                    onChange={e => { setStudentSearch(e.target.value); setNewEntry({ ...newEntry, studentName: '', house: '' }); }}
                  />
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
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 4 }}>
                  {STUDENT_DENOMINATIONS.map(p => (
                    <button
                      key={p}
                      className={`btn btn-sm ${newEntry.points === p ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setNewEntry({ ...newEntry, points: p })}
                      style={{ minWidth: 40 }}
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-row" style={{ marginTop: 8 }}>
                <input type="text" placeholder="Reason (e.g. 'Excellent question in Theology')"
                  value={newEntry.reason}
                  onChange={e => setNewEntry({ ...newEntry, reason: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
                  style={{ flex: 3 }} />
                <button className="btn btn-gold" onClick={handleAddStudent} disabled={!newEntry.studentName}>
                  Award +{newEntry.points}
                </button>
              </div>
            </>
          )}

          {/* House Award */}
          {awardType === 'house' && (
            <>
              <div className="setup-row">
                <select value={houseAward.house} onChange={e => setHouseAward({ ...houseAward, house: e.target.value })}>
                  {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="Points (any amount)"
                  value={houseAward.points}
                  onChange={e => setHouseAward({ ...houseAward, points: e.target.value })}
                  style={{ maxWidth: 160 }}
                />
              </div>
              <div className="setup-row" style={{ marginTop: 8 }}>
                <input type="text" placeholder="Reason (e.g. 'Won the spirit competition')"
                  value={houseAward.reason}
                  onChange={e => setHouseAward({ ...houseAward, reason: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddHouse()}
                  style={{ flex: 3 }} />
                <button className="btn btn-gold" onClick={handleAddHouse} disabled={!houseAward.points}>
                  Award to {houseAward.house}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {sorted.map((house, idx) => {
          const pts = totals[house] || 0;
          const pct = maxPoints > 0 ? (pts / maxPoints) * 100 : 0;
          const colors = HOUSE_COLORS[house];
          return (
            <div key={house} style={{
              background: colors.light, borderRadius: 10, padding: 16,
              position: 'relative', overflow: 'hidden', cursor: 'pointer',
              border: filterHouse === house ? `2px solid ${colors.bg}` : '2px solid transparent',
            }} onClick={() => setFilterHouse(filterHouse === house ? 'all' : house)}>
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
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: colors.bg }}>
                    {house}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: colors.bg }}>
                  {pts}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top Students */}
      {topStudents.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Top Students</h3>
          <table className="data-table">
            <thead><tr><th>Student</th><th>House</th><th>Points</th></tr></thead>
            <tbody>
              {topStudents.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className="badge" style={{ background: HOUSE_COLORS[s.house]?.light, color: HOUSE_COLORS[s.house]?.bg }}>{s.house}</span></td>
                  <td style={{ fontWeight: 600 }}>{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Activity */}
      <h3 className="section-title" style={{ marginBottom: 12 }}>
        {filterHouse !== 'all' ? `${filterHouse} Activity` : 'Recent Activity'}
        {filterHouse !== 'all' && (
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => setFilterHouse('all')}>Show All</button>
        )}
      </h3>
      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No entries yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>House</th><th>Student</th><th>Category</th><th>Points</th><th>Reason</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.slice(0, 50).map(e => (
                <tr key={e.id}>
                  <td><span className="badge" style={{ background: HOUSE_COLORS[e.house]?.light, color: HOUSE_COLORS[e.house]?.bg }}>{e.house}</span></td>
                  <td style={{ fontWeight: 500 }}>{e.studentName || <span style={{ fontStyle: 'italic', color: '#9CA3AF' }}>House Award</span>}</td>
                  <td style={{ fontSize: 12 }}>{e.category || '—'}</td>
                  <td style={{ fontWeight: 600, color: e.points > 0 ? '#16A34A' : '#DC2626' }}>{e.points > 0 ? '+' : ''}{e.points}</td>
                  <td style={{ fontSize: 13 }}>{e.reason}</td>
                  <td style={{ fontSize: 12, color: '#9CA3AF' }}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
