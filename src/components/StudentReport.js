import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, teacherDisplayName } from '../firebase';
import { VIRTUES } from '../data/virtueData';

const VIRTUE_LONG = { D: 'discipline', A: 'attention', C: 'charity', I: 'inquiry' };

function parseStudentScores(allScores, studentName) {
  const result = {};
  for (const [dateStr, dateData] of Object.entries(allScores || {})) {
    const sd = dateData?.[studentName];
    if (sd) {
      result[dateStr] = {};
      for (const [k, v] of Object.entries(sd)) {
        if (VIRTUE_LONG[k]) result[dateStr][VIRTUE_LONG[k]] = v;
        else if (k === 'E') result[dateStr].absent = v;
      }
    }
  }
  return result;
}

export default function StudentReport({ studentName, onClose }) {
  const [housePoints, setHousePoints] = useState([]);
  const [conductEntries, setConductEntries] = useState([]);
  const [classData, setClassData] = useState([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // House points (includes merits and demerits)
      const hpSnap = await getDocs(query(collection(db, 'housePointEntries'), orderBy('createdAt', 'desc')));
      const allEntries = hpSnap.docs.map(d => d.data()).filter(e => e.studentName?.toLowerCase() === studentName.toLowerCase());
      setHousePoints(allEntries);
      // Derive conduct from house points
      setConductEntries(allEntries);

      // Participation — read all teachers' classes to find this student
      const teacherIds = ['RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2', 'hvThHfEBFAY7VrG3YQ3djt0Icxi1', 'xn858oNYT3XOP6afwXh9qnT06cx2'];
      const classes = [];
      for (const uid of teacherIds) {
        try {
          const classSnap = await getDocs(collection(db, 'teachers', uid, 'classes'));
          for (const cDoc of classSnap.docs) {
            const raw = cDoc.data();
            if ((raw.roster || []).some(n => n.toLowerCase() === studentName.toLowerCase())) {
              const scores = parseStudentScores(raw.scores, raw.roster.find(n => n.toLowerCase() === studentName.toLowerCase()));
              const virtueAvgs = {};
              VIRTUES.forEach(v => {
                const vals = [];
                for (const ds of Object.values(scores)) { if (ds[v.key]) vals.push(ds[v.key]); }
                virtueAvgs[v.key] = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
              });
              const allDayAvgs = [];
              for (const ds of Object.values(scores)) {
                if (ds.absent) continue;
                const avg = VIRTUES.reduce((s, v) => s + (ds[v.key] || 0), 0) / VIRTUES.length;
                if (avg > 0) allDayAvgs.push(avg);
              }
              // Trend: compare first half to second half
              let trend = 'Steady';
              if (allDayAvgs.length >= 4) {
                const mid = Math.floor(allDayAvgs.length / 2);
                const firstHalf = allDayAvgs.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
                const secondHalf = allDayAvgs.slice(mid).reduce((a, b) => a + b, 0) / (allDayAvgs.length - mid);
                if (secondHalf - firstHalf >= 0.3) trend = 'Improving';
                else if (firstHalf - secondHalf >= 0.3) trend = 'Declining';
              }
              classes.push({
                name: raw.cls || raw.name || 'Unnamed',
                teacher: teacherDisplayName(uid),
                daysScored: allDayAvgs.length,
                overallAvg: allDayAvgs.length > 0 ? (allDayAvgs.reduce((a, b) => a + b, 0) / allDayAvgs.length) : null,
                virtueAvgs,
                trend,
              });
            }
          }
        } catch (e) { /* skip */ }
      }
      setClassData(classes);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [studentName]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalHP = housePoints.reduce((s, e) => s + (e.points || 0), 0);
  const merits = conductEntries.filter(e => e.type === 'merit' || (!e.type && e.points > 0));
  const demerits = conductEntries.filter(e => e.type === 'demerit' || (!e.type && e.points < 0));

  const handlePrint = () => {
    const content = reportRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Report — ${studentName}</title>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>body{font-family:'DM Sans',sans-serif;color:#1F2937;padding:32px;max-width:800px;margin:0 auto}
      h1{font-family:'Libre Baskerville',serif;color:#1B3A5C;font-size:22px;margin-bottom:4px}
      h2{font-family:'Libre Baskerville',serif;color:#1B3A5C;font-size:15px;margin-top:24px;margin-bottom:8px;border-bottom:2px solid #E5E7EB;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
      th{text-align:left;padding:6px 8px;background:#F9FAFB;border-bottom:2px solid #E5E7EB;font-size:11px;text-transform:uppercase;color:#6B7280}
      td{padding:6px 8px;border-bottom:1px solid #F3F4F6}
      .stat-row{display:flex;gap:12px;margin-bottom:16px}
      .stat-box{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px;text-align:center;flex:1}
      .stat-val{font-family:'Libre Baskerville',serif;font-size:22px;font-weight:700;color:#1B3A5C}
      .stat-lbl{font-size:11px;color:#6B7280}
      .trend-up{color:#16A34A}.trend-down{color:#DC2626}.trend-flat{color:#6B7280}
      .empty{color:#9CA3AF;font-style:italic;font-size:13px}
      @media print{body{padding:16px}}</style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: 700, padding: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}>Loading report...</div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 780, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Student Report</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold btn-sm" onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="modal-body" ref={reportRef}>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: '#6B7280' }}>Chesterton Academy of the Florida Martyrs</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#1B3A5C', margin: '4px 0' }}>{studentName}</h1>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Student Report — {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 80, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#1B3A5C' }}>{totalHP}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>House Points</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#16A34A' }}>{merits.length}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>Merits</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: demerits.length > 0 ? '#FEF2F2' : '#F9FAFB', border: `1px solid ${demerits.length > 0 ? '#FECACA' : '#E5E7EB'}`, borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: demerits.length > 0 ? '#DC2626' : '#6B7280' }}>{demerits.length}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>Demerits</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#1B3A5C' }}>{classData.length}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>Classes</div>
            </div>
          </div>

          {/* Participation by Class */}
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
            Participation
          </h2>
          {classData.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No participation data found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Class</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Teacher</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Days</th>
                  {VIRTUES.map(v => (
                    <th key={v.key} style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: v.color }}>{v.label.substring(0, 4)}</th>
                  ))}
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Avg</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Grade</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {classData.map((c, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{c.teacher}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{c.daysScored}</td>
                    {VIRTUES.map(v => (
                      <td key={v.key} style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>
                        {c.virtueAvgs[v.key] !== null ? c.virtueAvgs[v.key].toFixed(1) : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', fontWeight: 600 }}>
                      {c.overallAvg !== null ? c.overallAvg.toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>
                      {c.overallAvg !== null ? Math.round((c.overallAvg / 5) * 100) + '%' : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', fontWeight: 500, color: c.trend === 'Improving' ? '#16A34A' : c.trend === 'Declining' ? '#DC2626' : '#6B7280' }}>
                      {c.trend === 'Improving' ? '↑' : c.trend === 'Declining' ? '↓' : '→'} {c.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* House Points */}
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
            House Points ({totalHP})
          </h2>
          {housePoints.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No house points recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
              <thead><tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Category</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Points</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Reason</th>
              </tr></thead>
              <tbody>
                {housePoints.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.category || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', fontWeight: 600, color: e.points > 0 ? '#16A34A' : '#DC2626' }}>{e.points > 0 ? '+' : ''}{e.points}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Merits */}
          {merits.length > 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#16A34A', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>Merits ({merits.length})</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Description</th>
                </tr></thead>
                <tbody>{merits.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.date}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.category}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.description}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}

          {/* Demerits */}
          {demerits.length > 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#DC2626', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>Demerits ({demerits.length})</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' }}>Description</th>
                </tr></thead>
                <tbody>{demerits.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.date}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.category}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6' }}>{e.description}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}

          {conductEntries.length === 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>Conduct Record</h2>
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No merits or demerits recorded.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
