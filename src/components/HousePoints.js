import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { HOUSES } from '../data/virtueData';

const HOUSE_COLORS = {
  Augustine:  { bg: '#1B3A5C', light: '#E8EEF4' },
  Athanasius: { bg: '#8B2252', light: '#F5E6EE' },
  Chrysostom: { bg: '#C9A227', light: '#FDF8E8' },
  Ambrose:    { bg: '#2E7D5B', light: '#E4F2EB' },
};

const CATEGORIES = ['Virtue', 'Academic', 'Service', 'Leadership', 'Sportsmanship', 'Other'];

export default function HousePoints({ uid, isAdmin }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterHouse, setFilterHouse] = useState('all');
  const [newEntry, setNewEntry] = useState({
    house: 'Augustine',
    studentName: '',
    points: 1,
    category: 'Virtue',
    reason: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entriesRef = collection(db, 'housePointEntries');
      const q = query(entriesRef, orderBy('createdAt', 'desc'), limit(200));
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading house points:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!newEntry.studentName.trim() || !newEntry.reason.trim()) return;
    try {
      await addDoc(collection(db, 'housePointEntries'), {
        ...newEntry,
        points: Number(newEntry.points),
        createdAt: new Date().toISOString(),
        addedBy: uid,
      });
      setNewEntry({ house: newEntry.house, studentName: '', points: 1, category: 'Virtue', reason: '' });
      await loadData();
    } catch (err) {
      console.error('Error adding points:', err);
    }
  };

  // Tally totals per house
  const totals = {};
  HOUSES.forEach(h => { totals[h] = 0; });
  entries.forEach(e => {
    if (e.house && e.points) {
      totals[e.house] = (totals[e.house] || 0) + Number(e.points);
    }
  });

  // Tally by category
  const categoryTotals = {};
  CATEGORIES.forEach(c => { categoryTotals[c] = 0; });
  entries.forEach(e => {
    if (e.category && e.points > 0) {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.points);
    }
  });

  const maxPoints = Math.max(...Object.values(totals), 1);
  const sorted = [...HOUSES].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  const filtered = filterHouse === 'all'
    ? entries
    : entries.filter(e => e.house === filterHouse);

  // Top students
  const studentTotals = {};
  entries.forEach(e => {
    if (e.studentName && e.points > 0) {
      const key = e.studentName;
      if (!studentTotals[key]) studentTotals[key] = { name: key, house: e.house, points: 0 };
      studentTotals[key].points += Number(e.points);
    }
  });
  const topStudents = Object.values(studentTotals).sort((a, b) => b.points - a.points).slice(0, 10);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading house points...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">House Points</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Award Points'}
        </button>
      </div>

      {/* Add Points Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 20, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="setup-row">
            <input
              type="text"
              placeholder="Student name (required)"
              value={newEntry.studentName}
              onChange={e => setNewEntry({ ...newEntry, studentName: e.target.value })}
              style={{ flex: 2 }}
            />
            <select
              value={newEntry.house}
              onChange={e => setNewEntry({ ...newEntry, house: e.target.value })}
            >
              {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="setup-row" style={{ marginTop: 8 }}>
            <select
              value={newEntry.category}
              onChange={e => setNewEntry({ ...newEntry, category: e.target.value })}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={newEntry.points}
              onChange={e => setNewEntry({ ...newEntry, points: e.target.value })}
              style={{ maxWidth: 100 }}
            >
              {[1, 2, 3, 5, 10, -1, -2, -3, -5].map(p => (
                <option key={p} value={p}>{p > 0 ? '+' : ''}{p} pts</option>
              ))}
            </select>
          </div>
          <div className="setup-row" style={{ marginTop: 8 }}>
            <input
              type="text"
              placeholder="Reason (e.g. 'Excellent question in Theology')"
              value={newEntry.reason}
              onChange={e => setNewEntry({ ...newEntry, reason: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 3 }}
            />
            <button className="btn btn-gold" onClick={handleAdd}>Award</button>
          </div>
        </div>
      )}

      {/* Leaderboard Bars */}
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

      {/* Top Students & Category Breakdown side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Top Students */}
        <div>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Top Students</h3>
          {topStudents.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>No points awarded yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Student</th><th>House</th><th>Points</th></tr></thead>
              <tbody>
                {topStudents.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td><span className="badge" style={{
                      background: HOUSE_COLORS[s.house]?.light, color: HOUSE_COLORS[s.house]?.bg
                    }}>{s.house}</span></td>
                    <td style={{ fontWeight: 600 }}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Category Breakdown */}
        <div>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Points by Category</h3>
          {CATEGORIES.map(cat => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 13 }}>{cat}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{categoryTotals[cat] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <h3 className="section-title" style={{ marginBottom: 12 }}>
        {filterHouse !== 'all' ? `${filterHouse} Activity` : 'Recent Activity'}
        {filterHouse !== 'all' && (
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => setFilterHouse('all')}>
            Show All
          </button>
        )}
      </h3>
      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No entries yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>House</th>
                <th>Student</th>
                <th>Category</th>
                <th>Points</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="badge" style={{
                      background: HOUSE_COLORS[entry.house]?.light,
                      color: HOUSE_COLORS[entry.house]?.bg,
                    }}>{entry.house}</span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{entry.studentName || '—'}</td>
                  <td style={{ fontSize: 12 }}>{entry.category || '—'}</td>
                  <td style={{
                    fontWeight: 600,
                    color: entry.points > 0 ? '#16A34A' : '#DC2626'
                  }}>{entry.points > 0 ? '+' : ''}{entry.points}</td>
                  <td style={{ fontSize: 13 }}>{entry.reason}</td>
                  <td style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
