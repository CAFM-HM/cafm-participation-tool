import React, { useMemo } from 'react';
import { useAdminData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';

export default function Dashboard() {
  const { allTeachers, loading, refresh } = useAdminData();

  // Compute stats
  const stats = useMemo(() => {
    let totalStudents = 0;
    let totalClasses = 0;
    let belowThreshold = 0;
    const teacherSummaries = [];
    const classSummaries = [];
    const studentRows = [];

    allTeachers.forEach(teacher => {
      let teacherDays = 0;
      let lastActive = null;

      (teacher.classes || []).forEach(cls => {
        totalClasses++;
        const classScores = [];

        (cls.students || []).forEach(student => {
          totalStudents++;
          const allDayScores = student.scores || {};
          const dates = Object.keys(allDayScores);
          teacherDays = Math.max(teacherDays, dates.length);

          // Track last active
          dates.forEach(d => {
            if (!lastActive || d > lastActive) lastActive = d;
          });

          // Compute student average across all days
          let totalSum = 0;
          let totalCount = 0;
          const virtueAvgs = {};
          VIRTUES.forEach(v => { virtueAvgs[v.key] = { sum: 0, count: 0 }; });

          dates.forEach(date => {
            const dayScores = allDayScores[date] || {};
            VIRTUES.forEach(v => {
              const s = dayScores[v.key];
              if (s !== null && s !== undefined && s > 0) {
                totalSum += s;
                totalCount++;
                virtueAvgs[v.key].sum += s;
                virtueAvgs[v.key].count++;
              }
            });
          });

          const avg = totalCount > 0 ? totalSum / totalCount : null;
          if (avg !== null && avg < 3.0) belowThreshold++;

          const virtueScores = {};
          VIRTUES.forEach(v => {
            virtueScores[v.key] = virtueAvgs[v.key].count > 0
              ? (virtueAvgs[v.key].sum / virtueAvgs[v.key].count).toFixed(1)
              : '—';
          });

          if (avg !== null) classScores.push(avg);

          studentRows.push({
            name: student.name,
            teacher: teacher.displayName || teacher.email || teacher.uid,
            className: cls.name,
            avg: avg !== null ? avg.toFixed(1) : '—',
            grade: avg !== null ? Math.round((avg / 5) * 100) + '%' : '—',
            ...virtueScores,
            daysScored: dates.length,
            house: student.house || '—',
          });
        });

        const classAvg = classScores.length > 0
          ? (classScores.reduce((a, b) => a + b, 0) / classScores.length).toFixed(1)
          : null;

        classSummaries.push({
          name: cls.name,
          teacher: teacher.displayName || teacher.email || teacher.uid,
          studentCount: (cls.students || []).length,
          avg: classAvg,
          grade: classAvg ? Math.round((parseFloat(classAvg) / 5) * 100) + '%' : '—',
        });
      });

      // Determine activity status
      let status = 'Inactive';
      if (lastActive) {
        const daysSince = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000);
        if (daysSince <= 3) status = 'Active';
        else if (daysSince <= 14) status = 'Stale';
      }

      teacherSummaries.push({
        name: teacher.displayName || teacher.email || teacher.uid,
        email: teacher.email || '',
        classCount: (teacher.classes || []).length,
        daysScored: teacherDays,
        lastActive: lastActive || 'Never',
        status,
      });
    });

    // Sort
    classSummaries.sort((a, b) => (a.avg || 0) - (b.avg || 0));
    studentRows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return {
      totalStudents,
      totalClasses,
      totalTeachers: allTeachers.length,
      belowThreshold,
      teacherSummaries,
      classSummaries,
      studentRows,
    };
  }, [allTeachers]);

  // CSV export
  const exportCSV = () => {
    const headers = ['Student', 'Teacher', 'Class', 'House', 'Days Scored',
      ...VIRTUES.map(v => v.label), 'Average', 'Grade %'];
    const rows = stats.studentRows.map(r => [
      r.name, r.teacher, r.className, r.house, r.daysScored,
      ...VIRTUES.map(v => r[v.key]), r.avg, r.grade
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cafm_dashboard_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading dashboard data...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="section-title">Admin Dashboard</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={refresh}>↻ Refresh</button>
          <button className="btn btn-gold btn-sm" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalStudents}</div>
          <div className="stat-label">Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalClasses}</div>
          <div className="stat-label">Classes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalTeachers}</div>
          <div className="stat-label">Teachers</div>
        </div>
        <div className={`stat-card ${stats.belowThreshold > 0 ? 'alert' : ''}`}>
          <div className="stat-value">{stats.belowThreshold}</div>
          <div className="stat-label">Below 3.0</div>
        </div>
      </div>

      {/* Teacher Usage */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="section-title">Teacher Usage</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Teacher</th><th>Classes</th><th>Days Scored</th><th>Last Active</th><th>Status</th></tr>
            </thead>
            <tbody>
              {stats.teacherSummaries.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{t.classCount}</td>
                  <td>{t.daysScored}</td>
                  <td style={{ fontSize: 12 }}>{t.lastActive}</td>
                  <td>
                    <span className={`badge ${t.status === 'Active' ? 'badge-green' : t.status === 'Stale' ? 'badge-gray' : 'badge-red'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
              {stats.teacherSummaries.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF' }}>No teacher data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Class Averages */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="section-title">Class Averages</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Class</th><th>Teacher</th><th>Students</th><th>Avg Score</th><th>Grade %</th></tr>
            </thead>
            <tbody>
              {stats.classSummaries.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.teacher}</td>
                  <td>{c.studentCount}</td>
                  <td style={{ color: c.avg && parseFloat(c.avg) < 3.0 ? '#DC2626' : '#374151', fontWeight: 600 }}>{c.avg ?? '—'}</td>
                  <td>{c.grade}</td>
                </tr>
              ))}
              {stats.classSummaries.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF' }}>No class data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Overview */}
      <div className="card">
        <div className="card-header"><h3 className="section-title">Student Overview</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th><th>Class</th><th>House</th><th>Days</th>
                {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.slice(0, 4)}</th>)}
                <th>Avg</th><th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {stats.studentRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ fontSize: 12 }}>{r.className}</td>
                  <td style={{ fontSize: 12 }}>{r.house}</td>
                  <td>{r.daysScored}</td>
                  {VIRTUES.map(v => <td key={v.key}>{r[v.key]}</td>)}
                  <td style={{ fontWeight: 600, color: r.avg !== '—' && parseFloat(r.avg) < 3.0 ? '#DC2626' : '#374151' }}>{r.avg}</td>
                  <td>{r.grade}</td>
                </tr>
              ))}
              {stats.studentRows.length === 0 && (
                <tr><td colSpan={8 + VIRTUES.length} style={{ textAlign: 'center', color: '#9CA3AF' }}>No student data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
