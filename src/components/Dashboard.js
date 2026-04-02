import React, { useState, useMemo } from 'react';
import { useAdminData, useHousePoints } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import { teacherDisplayName, UID_MAP } from '../firebase';
import StudentReport from './StudentReport';

export default function Dashboard({ masterStudents }) {
  const { allTeachers, loading, refresh } = useAdminData();
  const { entries: houseEntries, loading: houseLoading } = useHousePoints();
  const [view, setView] = useState('summary');
  const [reportStudent, setReportStudent] = useState(null);

  // Count demerits per student
  const demeritCounts = useMemo(() => {
    const counts = {};
    (houseEntries || []).forEach(e => {
      if ((e.type === 'demerit' || (!e.type && e.points < 0)) && e.studentName) {
        const key = e.studentName.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [houseEntries]);

  const stats = useMemo(() => {
    let totalStudents = 0, totalClasses = 0, totalTeachers = allTeachers.length, belowThree = 0;
    const teacherSummaries = [], classSummaries = [], studentRows = [];

    for (const teacher of allTeachers) {
      let teacherDays = 0, lastActive = null;
      for (const cls of teacher.classes || []) {
        totalClasses++;
        const classScores = [];
        for (const stu of cls.students || []) {
          totalStudents++;
          const allDayScores = [];
          for (const [dateStr, dayScores] of Object.entries(stu.scores || {})) {
            if (dayScores.absent) continue;
            const dayAvg = VIRTUES.reduce((sum, v) => sum + (dayScores[v.key] || 0), 0) / VIRTUES.length;
            if (dayAvg > 0) { allDayScores.push(dayAvg); teacherDays++; if (!lastActive || dateStr > lastActive) lastActive = dateStr; }
          }
          const overallAvg = allDayScores.length > 0 ? allDayScores.reduce((a, b) => a + b, 0) / allDayScores.length : null;
          if (overallAvg !== null && overallAvg < 3) belowThree++;
          classScores.push(overallAvg);
          const virtueAvgs = {};
          VIRTUES.forEach(v => {
            const vals = [];
            for (const ds of Object.values(stu.scores || {})) { if (ds[v.key]) vals.push(ds[v.key]); }
            virtueAvgs[v.key] = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
          });
          const masterStudent = (masterStudents || []).find(ms => ms.name.toLowerCase() === stu.name.toLowerCase());
          const stuDemerits = demeritCounts[stu.name.toLowerCase()] || 0;
          studentRows.push({
            name: stu.name, house: masterStudent?.house || '', className: cls.name,
            teacher: teacherDisplayName(teacher.uid),
            overallAvg: overallAvg !== null ? overallAvg.toFixed(2) : '—',
            gradePct: overallAvg !== null ? Math.round((overallAvg / 5) * 100) + '%' : '—',
            daysScored: allDayScores.length, ...virtueAvgs,
            isBelowThree: overallAvg !== null && overallAvg < 3,
            demerits: stuDemerits,
          });
        }
        const validScores = classScores.filter(s => s !== null);
        const classAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;
        classSummaries.push({
          name: cls.name, teacher: teacherDisplayName(teacher.uid), studentCount: cls.students?.length || 0,
          avg: classAvg !== null ? classAvg.toFixed(2) : '—', gradePct: classAvg !== null ? Math.round((classAvg / 5) * 100) + '%' : '—',
          isBelowThree: classAvg !== null && classAvg < 3,
        });
      }
      let status = 'Inactive';
      if (lastActive) { const d = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000); if (d <= 3) status = 'Active'; else if (d <= 10) status = 'Stale'; }
      teacherSummaries.push({ name: teacherDisplayName(teacher.uid), email: UID_MAP[teacher.uid] || teacher.uid, classCount: (teacher.classes || []).length, daysScored: teacherDays, lastActive, status });
    }
    classSummaries.sort((a, b) => { if (a.avg === '—') return 1; if (b.avg === '—') return -1; return parseFloat(a.avg) - parseFloat(b.avg); });
    studentRows.sort((a, b) => a.name.localeCompare(b.name));
    return { totalStudents, totalClasses, totalTeachers, belowThree, teacherSummaries, classSummaries, studentRows };
  }, [allTeachers, masterStudents, demeritCounts]);

  // Attention Needed: students below 3.0 OR 3+ demerits (deduplicated by name)
  const attentionNeeded = useMemo(() => {
    const seen = new Set();
    const flagged = [];
    stats.studentRows.forEach(s => {
      const reasons = [];
      if (s.isBelowThree) reasons.push(`Avg ${s.overallAvg} (below 3.0)`);
      if (s.demerits >= 3) reasons.push(`${s.demerits} demerits`);
      if (reasons.length > 0 && !seen.has(s.name.toLowerCase())) {
        seen.add(s.name.toLowerCase());
        flagged.push({ ...s, reasons });
      }
    });
    return flagged;
  }, [stats.studentRows]);

  const exportCSV = () => {
    const headers = ['Student', 'House', 'Class', 'Teacher', 'Overall Avg', 'Grade %', 'Days Scored', 'Demerits', ...VIRTUES.map(v => v.label)];
    const rows = stats.studentRows.map(s => [s.name, s.house, s.className, s.teacher, s.overallAvg, s.gradePct, s.daysScored, s.demerits, ...VIRTUES.map(v => s[v.key])]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `cafm-dashboard-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  if (loading || houseLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading dashboard...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Admin Dashboard</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={refresh}>↻ Refresh</button>
          <button className="btn btn-gold" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Attention Needed */}
      {attentionNeeded.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#991B1B' }}>
              Attention Needed ({attentionNeeded.length} student{attentionNeeded.length !== 1 ? 's' : ''})
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #FECACA', fontSize: 11, textTransform: 'uppercase', color: '#991B1B' }}>Student</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #FECACA', fontSize: 11, textTransform: 'uppercase', color: '#991B1B' }}>House</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #FECACA', fontSize: 11, textTransform: 'uppercase', color: '#991B1B' }}>Concern</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #FECACA' }}></th>
              </tr>
            </thead>
            <tbody>
              {attentionNeeded.map((s, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #FEE2E2', fontWeight: 600, color: '#991B1B' }}>{s.name}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #FEE2E2' }}>{s.house || '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #FEE2E2' }}>
                    {s.reasons.map((r, j) => (
                      <span key={j} className="badge badge-red" style={{ marginRight: 4 }}>{r}</span>
                    ))}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #FEE2E2' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setReportStudent(s.name)}>Report</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.totalStudents}</div><div className="stat-label">Students</div></div>
        <div className="stat-card"><div className="stat-value">{stats.totalClasses}</div><div className="stat-label">Classes</div></div>
        <div className="stat-card"><div className="stat-value">{stats.totalTeachers}</div><div className="stat-label">Teachers</div></div>
        <div className={`stat-card ${stats.belowThree > 0 ? 'alert' : ''}`}><div className="stat-value">{stats.belowThree}</div><div className="stat-label">Below 3.0</div></div>
      </div>

      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ id: 'summary', label: 'Teacher Usage' }, { id: 'classes', label: 'Class Averages' }, { id: 'students', label: 'Student Overview' }].map(v => (
          <button key={v.id} className={`btn ${view === v.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      {/* Teacher Usage */}
      {view === 'summary' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Teacher</th><th>Email</th><th>Classes</th><th>Days Scored</th><th>Last Active</th><th>Status</th></tr></thead>
            <tbody>{stats.teacherSummaries.map((t, i) => (
              <tr key={i}><td style={{ fontWeight: 500 }}>{t.name}</td><td style={{ fontSize: 12, color: '#6B7280' }}>{t.email}</td><td>{t.classCount}</td><td>{t.daysScored}</td><td>{t.lastActive || '—'}</td>
              <td><span className={`badge ${t.status === 'Active' ? 'badge-green' : t.status === 'Stale' ? 'badge-gray' : 'badge-red'}`}>{t.status}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Class Averages */}
      {view === 'classes' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Avg Score</th><th>Grade %</th></tr></thead>
            <tbody>{stats.classSummaries.map((c, i) => (
              <tr key={i}><td style={{ fontWeight: 500 }}>{c.name}</td><td>{c.teacher}</td><td>{c.studentCount}</td>
              <td style={{ color: c.isBelowThree ? '#DC2626' : undefined, fontWeight: c.isBelowThree ? 600 : undefined }}>{c.avg}</td>
              <td style={{ color: c.isBelowThree ? '#DC2626' : undefined }}>{c.gradePct}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Student Overview */}
      {view === 'students' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Student</th><th>Class</th><th>House</th><th>Days</th>
              {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.substring(0, 4)}</th>)}
              <th>Avg</th><th>Grade</th><th>Dem.</th><th></th></tr></thead>
            <tbody>{stats.studentRows.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500, color: s.isBelowThree ? '#DC2626' : undefined }}>{s.name}</td>
                <td>{s.className}</td><td>{s.house}</td><td>{s.daysScored}</td>
                {VIRTUES.map(v => <td key={v.key}>{s[v.key]}</td>)}
                <td style={{ color: s.isBelowThree ? '#DC2626' : undefined, fontWeight: s.isBelowThree ? 600 : undefined }}>{s.overallAvg}</td>
                <td>{s.gradePct}</td>
                <td style={{ color: s.demerits >= 3 ? '#DC2626' : undefined, fontWeight: s.demerits >= 3 ? 600 : undefined }}>{s.demerits || '—'}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={() => setReportStudent(s.name)}>Report</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {reportStudent && <StudentReport studentName={reportStudent} onClose={() => setReportStudent(null)} />}
    </div>
  );
}
