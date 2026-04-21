import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { complianceStatus } from './Compliance';

// A red/orange banner that appears at the top of the Home page when there are
// compliance items that are overdue or due within 30 days.
// Admin-only — gate with isAdmin in the parent.
export default function HomeComplianceBanner({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'complianceItems'));
        if (!cancelled) setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(it => !it.archived));
      } catch (err) {
        console.error('Home compliance banner load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || dismissed) return null;

  const urgent = items
    .map(it => ({ ...it, _status: complianceStatus(it.nextDue) }))
    .filter(it => it._status === 'overdue' || it._status === 'red');

  if (urgent.length === 0) return null;

  const overdueCount = urgent.filter(it => it._status === 'overdue').length;
  const dueSoonCount = urgent.length - overdueCount;
  const isOverdue = overdueCount > 0;

  const bg = isOverdue ? '#7F1D1D' : '#B45309';
  const headline = isOverdue
    ? `${overdueCount} compliance item${overdueCount === 1 ? '' : 's'} overdue${dueSoonCount > 0 ? ` · ${dueSoonCount} more due within 30 days` : ''}`
    : `${dueSoonCount} compliance item${dueSoonCount === 1 ? '' : 's'} due within 30 days`;

  // Show top 4 by due date
  const top = urgent.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999')).slice(0, 4);

  return (
    <div style={{
      background: bg, color: '#FFFFFF', borderRadius: 8, padding: '12px 16px', marginBottom: 16,
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>{isOverdue ? '⛔' : '⚠️'}</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{headline}</div>
        <div style={{ fontSize: 12, opacity: 0.95, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
          {top.map(it => (
            <span key={it.id}>
              • {it.title}{it._status === 'overdue' ? ' (overdue)' : ''}
            </span>
          ))}
          {urgent.length > top.length && (
            <span style={{ fontStyle: 'italic', opacity: 0.8 }}>+ {urgent.length - top.length} more</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {onNavigate && (
          <button
            onClick={() => onNavigate('compliance')}
            style={{ background: '#FFFFFF', color: bg, border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          >Open Compliance →</button>
        )}
        <button
          onClick={() => setDismissed(true)}
          title="Hide until next page load"
          style={{ background: 'transparent', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
        >Dismiss</button>
      </div>
    </div>
  );
}
