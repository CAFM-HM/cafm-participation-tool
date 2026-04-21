import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { complianceStatus } from './Compliance';

// Read-only summary of compliance status for the Board overview.
// Shows counts + a short list of anything overdue or due within 30 days.
export default function BoardComplianceSummary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'complianceItems'));
        if (!cancelled) setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(it => !it.archived));
      } catch (err) {
        console.error('Board compliance summary load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="home-card">
        <div className="home-card-header"><h3>Compliance Status</h3></div>
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const counts = { overdue: 0, red: 0, orange: 0, yellow: 0, current: 0, none: 0 };
  items.forEach(it => { counts[complianceStatus(it.nextDue)]++; });

  const urgent = items
    .map(it => ({ ...it, _status: complianceStatus(it.nextDue) }))
    .filter(it => it._status === 'overdue' || it._status === 'red')
    .sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'))
    .slice(0, 6);

  const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  // Set up status pills data
  const pills = [
    { key: 'overdue', label: 'Overdue',    count: counts.overdue, bg: '#7F1D1D' },
    { key: 'red',     label: '≤ 30 days',  count: counts.red,     bg: '#DC2626' },
    { key: 'orange',  label: '≤ 60 days',  count: counts.orange,  bg: '#EA580C' },
    { key: 'yellow',  label: '≤ 90 days',  count: counts.yellow,  bg: '#CA8A04' },
    { key: 'current', label: 'Current',    count: counts.current, bg: '#15803D' },
  ];

  if (items.length === 0) {
    return (
      <div className="home-card">
        <div className="home-card-header"><h3>Compliance Status</h3></div>
        <div style={{ color: '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>No compliance items tracked yet.</div>
      </div>
    );
  }

  return (
    <div className="home-card">
      <div className="home-card-header">
        <h3>Compliance Status</h3>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{items.length} tracked</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6, marginBottom: 10 }}>
        {pills.map(p => (
          <div key={p.key} style={{
            padding: '6px 4px', borderRadius: 6, textAlign: 'center',
            background: p.count > 0 ? p.bg : '#F3F4F6',
            color: p.count > 0 ? '#FFFFFF' : '#9CA3AF',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{p.count}</div>
            <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>{p.label}</div>
          </div>
        ))}
      </div>

      {urgent.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Needs Attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {urgent.map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 6px', borderRadius: 4, background: it._status === 'overdue' ? '#FEE2E2' : '#FEF3C7' }}>
                <span style={{ color: '#1B3A5C', fontWeight: 500, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                <span style={{ color: it._status === 'overdue' ? '#991B1B' : '#92400E', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>
                  {it._status === 'overdue' ? 'Overdue' : fmtDate(it.nextDue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#15803D', fontWeight: 500 }}>
          ✓ Nothing overdue or due within 30 days.
        </div>
      )}
    </div>
  );
}
