import React, { useState, useMemo } from 'react';
import { useAdminData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import { teacherDisplayName, UID_MAP } from '../firebase';
import StudentReport from './StudentReport';
import DailyTracker from './DailyTracker';

export default function Dashboard({ masterStudents }) {
  const { allTeachers, loading, refresh } = useAdminData();
  const [view, setView] = useState('summary');
  const [reportStudent, setReportStudent] = useState(null);
  const [teacherViewUid, setTeacherViewUid] = useState(null);

  const stats = useMemo(() => {
    let totalClasses = 0, totalTeachers = allTeachers.length, belowThree = 0;
    const uniqueStudents = new Set();
    const teacherSummaries = [], classSummaries = [], studentRows = [];

    for (const teacher of allTeachers) {
      const teacherDates = new Set();
      let lastActive = null;
      for (const cls of teacher.classes || []) {
        totalClasses++;
        const classScores = [];
        for (const stu of cls.students || []) {
          uniqueStudents.add(stu.name.toLowerCase());
          const allDayScores = [];
          for (const [dateStr, dayScores] of Object.entries(stu.scores || {})) {
            if (dayScores.absent) continue;
            const dayAvg = VIRTUES.reduce((sum, v) => sum + (dayScores[v.key] || 0), 0) / VIRTUES.length;
            if (dayAvg > 0) { allDayScores.push(dayAvg); teacherDates.add(dateStr); if (!lastActive || dateStr > lastActive) lastActive = dateStr; }
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
          studentRows.push({
            name: stu.name, house: masterStudent?.house || '', className: cls.name,
            teacher: teacherDisplayName(teacher.uid),
            overallAvg: overallAvg !== null ? overallAvg.toFixed(2) : '—',
            gradePct: overallAvg !== null ? Math.round((overallAvg / 5) * 100) + '%' : '—',
            daysScored: allDayScores.length, ...virtueAvgs,
            isBelowThree: overallAvg !== null && overallAvg < 3,
          });
        }
        const validScores = classScores.filter(s => s !== null);
        const classAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;
        classSummaries.push({
          name: cls.name, teacher: teacherDisplayName(teacher.uid), teacherUid: teacher.uid,
          studentCount: cls.students?.length || 0,
          avg: classAvg !== null ? classAvg.toFixed(2) : '—', gradePct: classAvg !== null ? Math.round((classAvg / 5) * 100) + '%' : '—',
          isBelowThree: classAvg !== null && classAvg < 3,
        });
      }
      let status = 'Inactive';
      if (lastActive) { const d = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000); if (d <= 3) status = 'Active'; else if (d <= 10) status = 'Stale'; }
      teacherSummaries.push({ name: teacherDisplayName(teacher.uid), uid: teacher.uid, email: UID_MAP[teacher.uid] || teacher.uid, classCount: (teacher.classes || []).length, daysScored: teacherDates.size, lastActive, status });
    }
    classSummaries.sort((a, b) => { if (a.avg === '—') return 1; if (b.avg === '—') return -1; return parseFloat(a.avg) - parseFloat(b.avg); });
    studentRows.sort((a, b) => a.name.localeCompare(b.name));
    return { totalStudents: uniqueStudents.size, totalClasses, totalTeachers, belowThree, teacherSummaries, classSummaries, studentRows };
  }, [allTeachers, masterStudents]);

  const exportCSV = () => {
    const headers = ['Student', 'House', 'Class', 'Teacher', 'Overall Avg', 'Grade %', 'Days Scored', ...VIRTUES.map(v => v.label)];
    const rows = stats.studentRows.map(s => [s.name, s.house, s.className, s.teacher, s.overallAvg, s.gradePct, s.daysScored, ...VIRTUES.map(v => s[v.key])]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `cafm-dashboard-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading dashboard...</div>;

  // ============================================================
  // TEACHER VIEW MODE — show their DailyTracker + Gradebook
  // ============================================================
  if (teacherViewUid) {
    const teacherName = teacherDisplayName(teacherViewUid);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setTeacherViewUid(null)}>
            ← Back to Dashboard
          </button>
          <h2 className="section-title">
            Viewing as: {teacherName}
          </h2>
          <span className="badge badge-green">Teacher View</span>
        </div>
        <DailyTracker
          uid={null}
          masterStudents={masterStudents}
          adminViewMode={true}
          adminUid={teacherViewUid}
        />
      </div>
    );
  }

  // ============================================================
  // NORMAL DASHBOARD
  // ============================================================
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Admin Dashboard</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={refresh}>↻ Refresh</button>
          <button className="btn btn-gold" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.totalStudents}</div><div className="stat-label">Students</div></div>
        <div className="stat-card"><div className="stat-value">{stats.totalClasses}</div><div className="stat-label">Classes</div></div>
        <div className="stat-card"><div className="stat-value">{stats.totalTeachers}</div><div className="stat-label">Teachers</div></div>
        <div className={`stat-card ${stats.belowThree > 0 ? 'alert' : ''}`}><div className="stat-value">{stats.belowThree}</div><div className="stat-label">Below 3.0</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'summary', label: 'Teacher Usage' },
          { id: 'classes', label: 'Class Averages' },
          { id: 'students', label: 'Student Overview' },
        ].map(v => (
          <button key={v.id} className={`btn ${view === v.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      {view === 'summary' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Teacher</th><th>Email</th><th>Classes</th><th>Days Scored</th><th>Last Active</th><th>Status</th><th></th></tr></thead>
            <tbody>{stats.teacherSummaries.map((t, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td style={{ fontSize: 12, color: '#6B7280' }}>{t.email}</td>
                <td>{t.classCount}</td>
                <td>{t.daysScored}</td>
                <td>{t.lastActive || '—'}</td>
                <td><span className={`badge ${t.status === 'Active' ? 'badge-green' : t.status === 'Stale' ? 'badge-gray' : 'badge-red'}`}>{t.status}</span></td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => setTeacherViewUid(t.uid)}>
                    View Classes
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {view === 'classes' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Avg Score</th><th>Grade %</th><th></th></tr></thead>
            <tbody>{stats.classSummaries.map((c, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td>{c.teacher}</td>
                <td>{c.studentCount}</td>
                <td style={{ color: c.isBelowThree ? '#DC2626' : undefined, fontWeight: c.isBelowThree ? 600 : undefined }}>{c.avg}</td>
                <td style={{ color: c.isBelowThree ? '#DC2626' : undefined }}>{c.gradePct}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => setTeacherViewUid(c.teacherUid)}>
                    View
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {view === 'students' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Student</th><th>Class</th><th>House</th><th>Days</th>
              {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.substring(0, 4)}</th>)}
              <th>Avg</th><th>Grade</th><th></th></tr></thead>
            <tbody>{stats.studentRows.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500, color: s.isBelowThree ? '#DC2626' : undefined }}>{s.name}</td>
                <td>{s.className}</td><td>{s.house}</td><td>{s.daysScored}</td>
                {VIRTUES.map(v => <td key={v.key}>{s[v.key]}</td>)}
                <td style={{ color: s.isBelowThree ? '#DC2626' : undefined, fontWeight: s.isBelowThree ? 600 : undefined }}>{s.overallAvg}</td>
                <td>{s.gradePct}</td>
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
