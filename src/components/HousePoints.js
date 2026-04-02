import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { HOUSES } from '../data/virtueData';

const HOUSE_COLORS = {
  Augustine: { bg: '#1B3A5C', text: '#FFFFFF', light: '#E8EEF4' },
  Athanasius: { bg: '#8B2332', text: '#FFFFFF', light: '#F5E4E7' },
  Chrysostom: { bg: '#C9A227', text: '#1F2937', light: '#FDF6E3' },
  Ambrose: { bg: '#2E7D5B', text: '#FFFFFF', light: '#E4F2EB' },
};

const HOUSE_MOTTOS = {
  Augustine: 'Tolle Lege',
  Athanasius: 'Contra Mundum',
  Chrysostom: 'Golden-Mouthed',
  Ambrose: 'Doctor of the Church',
};

export default function HousePoints({ uid, isAdmin }) {
  const [houseData, setHouseData] = useState({});
  const [loading, setLoading] = useState(true);
  const [newEntry, setNewEntry] = useState({ house: '', points: '', reason: '' });

  const loadHouseData = useCallback(async () => {
    setLoading(true);
    try {
      const ref = doc(db, 'school', 'housePoints');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setHouseData(snap.data());
      } else {
        // Initialize
        const init = {};
        HOUSES.forEach(h => { init[h] = { total: 0, log: [] }; });
        setHouseData(init);
      }
    } catch (err) {
      console.error('Error loading house points:', err);
      const init = {};
      HOUSES.forEach(h => { init[h] = { total: 0, log: [] }; });
      setHouseData(init);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadHouseData(); }, [loadHouseData]);

  const addPoints = async () => {
    if (!newEntry.house || !newEntry.points) return;
    const pts = parseInt(newEntry.points);
    if (isNaN(pts)) return;

    const updated = { ...houseData };
    if (!updated[newEntry.house]) updated[newEntry.house] = { total: 0, log: [] };
    updated[newEntry.house].total += pts;
    updated[newEntry.house].log = [
      { points: pts, reason: newEntry.reason || 'House points', date: new Date().toISOString(), by: uid },
      ...(updated[newEntry.house].log || []).slice(0, 99),
    ];

    try {
      const ref = doc(db, 'school', 'housePoints');
      await setDoc(ref, updated);
      setHouseData(updated);
      setNewEntry({ house: '', points: '', reason: '' });
    } catch (err) {
      console.error('Error saving house points:', err);
    }
  };

  // Sort houses by points
  const sortedHouses = [...HOUSES].sort((a, b) => (houseData[b]?.total || 0) - (houseData[a]?.total || 0));
  const maxPoints = Math.max(...HOUSES.map(h => houseData[h]?.total || 0), 1);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading house points...</div>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 20 }}>House Leaderboard</h2>

      {/* Leaderboard */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {sortedHouses.map((house, rank) => {
          const colors = HOUSE_COLORS[house];
          const total = houseData[house]?.total || 0;
          const pct = (total / maxPoints) * 100;
          return (
            <div key={house} style={{
              background: colors.light,
              border: `2px solid ${colors.bg}`,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: colors.bg, color: colors.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
                flexShrink: 0,
              }}>
                {rank + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: colors.bg }}>
                  {house}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>{HOUSE_MOTTOS[house]}</div>
                <div style={{ marginTop: 6, height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: colors.bg, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: colors.bg, minWidth: 60, textAlign: 'right' }}>
                {total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Points Form */}
      <div className="card">
        <div className="card-header"><h3 className="section-title">Award Points</h3></div>
        <div className="setup-row">
          <select value={newEntry.house} onChange={e => setNewEntry({ ...newEntry, house: e.target.value })} style={{ flex: 1 }}>
            <option value="">Select house...</option>
            {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <input type="text" placeholder="Points (e.g. 5 or -2)" value={newEntry.points} onChange={e => setNewEntry({ ...newEntry, points: e.target.value })} style={{ width: 100 }} />
          <input type="text" placeholder="Reason" value={newEntry.reason} onChange={e => setNewEntry({ ...newEntry, reason: e.target.value })} style={{ flex: 2 }} />
          <button className="btn btn-primary" onClick={addPoints}>Award</button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header"><h3 className="section-title">Recent Activity</h3></div>
        {(() => {
          const allLogs = [];
          HOUSES.forEach(h => {
            (houseData[h]?.log || []).forEach(entry => {
              allLogs.push({ ...entry, house: h });
            });
          });
          allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
          const recent = allLogs.slice(0, 20);

          if (recent.length === 0) return <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No house points awarded yet.</div>;

          return (
            <div>
              {recent.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: HOUSE_COLORS[entry.house]?.bg || '#666',
                    color: HOUSE_COLORS[entry.house]?.text || '#FFF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {entry.house?.charAt(0)}
                  </span>
                  <span style={{ fontWeight: 600, color: entry.points > 0 ? '#16A34A' : '#DC2626' }}>
                    {entry.points > 0 ? '+' : ''}{entry.points}
                  </span>
                  <span style={{ flex: 1, color: '#374151' }}>{entry.reason}</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
