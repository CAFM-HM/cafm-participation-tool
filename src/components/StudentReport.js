import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { VIRTUES } from '../data/virtueData';

export default function StudentReport({ studentName, onClose }) {
  const [housePoints, setHousePoints] = useState([]);
  const [conductEntries, setConductEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef(null);

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      // Load house points for this student
      const hpRef = collection(db, 'housePointEntries');
      const hpSnap = await getDocs(query(hpRef, orderBy('createdAt', 'desc')));
      setHousePoints(hpSnap.docs
        .map(d => d.data())
        .filter(e => e.studentName?.toLowerCase() === studentName.toLowerCase())
      );

      // Load conduct entries for this student
      const ceRef = collection(db, 'conductEntries');
      const ceSnap = await getDocs(query(ceRef, orderBy('date', 'desc')));
      setConductEntries(ceSnap.docs
        .map(d => d.data())
        .filter(e => e.studentName?.toLowerCase() === studentName.toLowerCase())
      );
    } catch (err) {
      console.error('Error loading report data:', err);
    }
    setLoading(false);
  }, [studentName]);

  useEffect(() => { loadReportData(); }, [loadReportData]);

  const totalHousePoints = housePoints.reduce((sum, e) => sum + (e.points || 0), 0);
  const meritCount = conductEntries.filter(e => e.type === 'merit').length;
  const demeritCount = conductEntries.filter(e => e.type === 'demerit').length;

  const handlePrint = () => {
    const content = reportRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Report — ${studentName}</title>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'DM Sans', sans-serif; color: #1F2937; padding: 32px; max-width: 800px; margin: 0 auto; }
          h1 { font-family: 'Libre Baskerville', serif; color: #1B3A5C; font-size: 22px; margin-bottom: 4px; }
          h2 { font-family: 'Libre Baskerville', serif; color: #1B3A5C; font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #E5E7EB; padding-bottom: 4px; }
          .subtitle { font-size: 13px; color: #6B7280; margin-bottom: 20px; }
          .header-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
          .school-name { font-family: 'Libre Baskerville', serif; font-size: 12px; color: #6B7280; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          th { text-align: left; padding: 6px 8px; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; font-size: 11px; text-transform: uppercase; color: #6B7280; }
          td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; }
          .stat-row { display: flex; gap: 16px; margin-bottom: 12px; }
          .stat-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; text-align: center; flex: 1; }
          .stat-value { font-family: 'Libre Baskerville', serif; font-size: 24px; font-weight: 700; color: #1B3A5C; }
          .stat-label { font-size: 11px; color: #6B7280; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
          .badge-green { background: #F0FDF4; color: #16A34A; }
          .badge-red { background: #FEF2F2; color: #DC2626; }
          .empty { color: #9CA3AF; font-style: italic; font-size: 13px; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: 700, padding: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          Loading report...
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 750, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Student Report</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold btn-sm" onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="modal-body" ref={reportRef}>
          {/* Header */}
          <div className="header-bar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: '#6B7280' }}>
                Chesterton Academy of the Florida Martyrs
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#1B3A5C', margin: '4px 0' }}>
                {studentName}
              </h1>
              <div style={{ fontSize: 13, color: '#6B7280' }}>
                Student Report — {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#1B3A5C' }}>{totalHousePoints}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>House Points</div>
            </div>
            <div style={{ flex: 1, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#16A34A' }}>{meritCount}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>Merits</div>
            </div>
            <div style={{ flex: 1, background: demeritCount > 0 ? '#FEF2F2' : '#F9FAFB', border: `1px solid ${demeritCount > 0 ? '#FECACA' : '#E5E7EB'}`, borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: demeritCount > 0 ? '#DC2626' : '#6B7280' }}>{demeritCount}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>Demerits</div>
            </div>
          </div>

          {/* House Points Detail */}
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
            House Points ({totalHousePoints})
          </h2>
          {housePoints.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No house points recorded.</div>
          ) : (
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr><th>Date</th><th>Category</th><th>Points</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {housePoints.map((e, i) => (
                  <tr key={i}>
                    <td>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                    <td>{e.category || '—'}</td>
                    <td style={{ fontWeight: 600, color: e.points > 0 ? '#16A34A' : '#DC2626' }}>
                      {e.points > 0 ? '+' : ''}{e.points}
                    </td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Merits */}
          {meritCount > 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#16A34A', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
                Merits ({meritCount})
              </h2>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr><th>Date</th><th>Category</th><th>Description</th></tr>
                </thead>
                <tbody>
                  {conductEntries.filter(e => e.type === 'merit').map((e, i) => (
                    <tr key={i}>
                      <td>{e.date}</td>
                      <td>{e.category}</td>
                      <td>{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Demerits */}
          {demeritCount > 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#DC2626', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
                Demerits ({demeritCount})
              </h2>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr><th>Date</th><th>Category</th><th>Description</th></tr>
                </thead>
                <tbody>
                  {conductEntries.filter(e => e.type === 'demerit').map((e, i) => (
                    <tr key={i}>
                      <td>{e.date}</td>
                      <td>{e.category}</td>
                      <td>{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {conductEntries.length === 0 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#1B3A5C', marginTop: 20, marginBottom: 8, borderBottom: '2px solid #E5E7EB', paddingBottom: 4 }}>
                Conduct Record
              </h2>
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>No merits or demerits recorded.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
