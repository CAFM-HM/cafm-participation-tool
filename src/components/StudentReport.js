import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore';
import { db, teacherDisplayName } from '../firebase';
import { VIRTUES, VIRTUE_SENTENCES, OPENINGS, CLOSINGS, MIXED_OPENINGS, getOpenings, getBridgingSentences, isMixedPerformance } from '../data/virtueData';

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

// Rebuild narrative from saved narrative config data
function rebuildNarrative(studentData, className) {
  if (!studentData || !studentData.scores || !studentData.sentenceSelections) return null;
  const { name, pronoun, scores, sentenceSelections, openingIndex, closingIndex } = studentData;
  
  const vals = VIRTUES.map(v => scores[v.key]).filter(s => s !== null && s !== undefined);
  if (vals.length < 4) return null;
  const overall = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  
  if (openingIndex === null || openingIndex === undefined) return null;
  if (closingIndex === null || closingIndex === undefined) return null;
  for (const v of VIRTUES) {
    if (sentenceSelections[v.key] === null || sentenceSelections[v.key] === undefined) return null;
  }

  const pr = pronoun || 'he';
  const displayName = name || '[Student]';
  const displayClass = className || '[Class]';

  const openings = getOpenings(overall, scores);
  const opening = (openings[openingIndex] || '')
    .replace('[S]', displayName)
    .replace('[C]', displayClass);

  const virtueParts = VIRTUES.map(v => {
    const score = scores[v.key];
    const idx = sentenceSelections[v.key];
    return VIRTUE_SENTENCES[v.key]?.[score]?.[pr]?.[idx] || '';
  });

  const bridges = getBridgingSentences(scores, pr);
  const closingOptions = [...(CLOSINGS[overall]?.[pr] || []), ...(CLOSINGS[overall]?.n || [])];
  const closing = closingOptions[closingIndex] || '';

  return [opening, ...virtueParts, ...bridges, closing].filter(Boolean).join(' ');
}

export default function StudentReport({ studentName, onClose }) {
  const [housePoints, setHousePoints] = useState([]);
  const [conductEntries, setConductEntries] = useState([]);
  const [classData, setClassData] = useState([]);
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // House points (includes merits and demerits)
      const hpSnap = await getDocs(query(collection(db, 'housePointEntries'), orderBy('createdAt', 'desc')));
      const allEntries = hpSnap.docs.map(d => d.data()).filter(e => e.studentName?.toLowerCase() === studentName.toLowerCase());
      setHousePoints(allEntries);
      setConductEntries(allEntries);

      // Participation + narratives
      const teacherIds = ['RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2', 'hvThHfEBFAY7VrG3YQ3djt0Icxi1', 'xn858oNYT3XOP6afwXh9qnT06cx2'];
      const classes = [];
      const foundNarratives = [];

      for (const uid of teacherIds) {
        try {
          // Load class participation data
          const classSnap = await getDocs(collection(db, 'teachers', uid, 'classes'));
          for (const cDoc of classSnap.docs) {
            const raw = cDoc.data();
            if ((raw.roster || []).some(n => n.toLowerCase() === studentName.toLowerCase())) {
              const actualName = raw.roster.find(n => n.toLowerCase() === studentName.toLowerCase());
              const scores = parseStudentScores(raw.scores, actualName);
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

          // Load narrative config for this teacher
          try {
            const narrativeSnap = await getDoc(doc(db, 'teachers', uid, 'config', 'narrative'));
            if (narrativeSnap.exists()) {
              const config = narrativeSnap.data();
              const stuNarrative = (config.students || []).find(
                s => s.name?.toLowerCase() === studentName.toLowerCase()
              );
              if (stuNarrative) {
                const text = rebuildNarrative(stuNarrative, config.className);
                if (text) {
                  foundNarratives.push({
                    className: config.className || 'Unknown Class',
                    teacher: teacherDisplayName(uid),
                    text: text + (stuNarrative.comment ? ' ' + stuNarrative.comment : ''),
                  });
                }
              }
            }
          } catch (e) { /* no narrative config */ }
        } catch (e) { /* skip teacher */ }
      }
      setClassData(classes);
      setNarratives(foundNarratives);
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
      .narrative{background:#FAF8F2;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:12px;font-family:'Libre Baskerville',serif;font-size:13px;line-height:1.8;color:#374151}
      .narrative-label{font-size:11px;font-weight:600;color:#6B7280;margin-bottom:4px}
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

  const thStyle = { textAlign: 'left', padding: '6px 8px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase', color: '#6B7280' };
  const tdStyle = { padding: '6px 8px', borderBottom: '1px solid #F3F4F6' };
  const h2Style = { fontFamily: 'var(--font-display)', fontSize: 15, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 };

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

          {/* Participation Narratives */}
          {narratives.length > 0 && (
            <>
              <h2 style={h2Style}>Participation Narratives</h2>
              {narratives.map((n, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>
                    {n.className} — {n.teacher}
                  </div>
                  <div style={{
                    background: '#FAF8F2', border: '1px solid #E5E7EB', borderRadius: 8,
                    padding: 16, fontFamily: 'var(--font-display)', fontSize: 13, lineHeight: 1.8, color: '#374151'
                  }}>
                    {n.text}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Participation Scores */}
          <h2 style={h2Style}>Participation Scores</h2>
          {classData.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No participation data found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Teacher</th>
                  <th style={thStyle}>Days</th>
                  {VIRTUES.map(v => <th key={v.key} style={{ ...thStyle, color: v.color }}>{v.label.substring(0, 4)}</th>)}
                  <th style={thStyle}>Avg</th>
                  <th style={thStyle}>Grade</th>
                  <th style={thStyle}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {classData.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={tdStyle}>{c.teacher}</td>
                    <td style={tdStyle}>{c.daysScored}</td>
                    {VIRTUES.map(v => (
                      <td key={v.key} style={tdStyle}>{c.virtueAvgs[v.key] !== null ? c.virtueAvgs[v.key].toFixed(1) : '—'}</td>
                    ))}
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{c.overallAvg !== null ? c.overallAvg.toFixed(2) : '—'}</td>
                    <td style={tdStyle}>{c.overallAvg !== null ? Math.round((c.overallAvg / 5) * 100) + '%' : '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: c.trend === 'Improving' ? '#16A34A' : c.trend === 'Declining' ? '#DC2626' : '#6B7280' }}>
                      {c.trend === 'Improving' ? '↑' : c.trend === 'Declining' ? '↓' : '→'} {c.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* House Points Detail */}
          <h2 style={h2Style}>House Points ({totalHP})</h2>
          {housePoints.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No house points recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
              <thead><tr>
                <th style={thStyle}>Date</th><th style={thStyle}>Type</th><th style={thStyle}>Category</th><th style={thStyle}>Points</th><th style={thStyle}>Reason</th>
              </tr></thead>
              <tbody>
                {housePoints.map((e, i) => {
                  const isMerit = e.type === 'merit' || (!e.type && e.points > 0);
                  return (
                    <tr key={i}>
                      <td style={tdStyle}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                      <td style={tdStyle}><span style={{ color: isMerit ? '#16A34A' : '#DC2626', fontWeight: 600, fontSize: 12 }}>{isMerit ? '★ Merit' : '✗ Demerit'}</span></td>
                      <td style={tdStyle}>{e.category || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: isMerit ? '#16A34A' : '#DC2626' }}>{e.points > 0 ? '+' : ''}{e.points}</td>
                      <td style={tdStyle}>{e.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
