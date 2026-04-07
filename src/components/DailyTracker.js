import React, { useState, useCallback, useMemo } from 'react';
import { useTeacherData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import LegendModal from './LegendModal';

const TODAY = new Date().toISOString().split('T')[0];

// ============================================================
// HELPER: Get Monday of the week for a given date string
// ============================================================
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // shift so Monday=0
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

function getMonthKey(dateStr) {
  return dateStr.substring(0, 7); // "2026-04"
}

function formatMonth(monthKey) {
  const [y, m] = monthKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function formatWeekRange(mondayStr) {
  const mon = new Date(mondayStr + 'T00:00:00');
  const fri = new Date(mondayStr + 'T00:00:00');
  fri.setDate(fri.getDate() + 4);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(mon)}–${fmt(fri)}`;
}

// ============================================================
// COMPONENT
// ============================================================
export default function DailyTracker({ uid, masterStudents, adminViewMode, adminUid }) {
  // If adminViewMode, use adminUid to load that teacher's data
  const effectiveUid = adminViewMode ? adminUid : uid;

  const {
    classes, loading, addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, deleteClass,
  } = useTeacherData(effectiveUid, masterStudents);

  const [selectedClass, setSelectedClass] = useState(null);
  const [date, setDate] = useState(TODAY);
  const [showSetup, setShowSetup] = useState(!adminViewMode);
  const [newClassName, setNewClassName] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [legendVirtue, setLegendVirtue] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewMode, setViewMode] = useState('scoring'); // 'scoring' | 'gradebook'
  const [gradebookPeriod, setGradebookPeriod] = useState('weekly'); // 'weekly' | 'monthly' | 'overall'

  const currentClass = classes.find(c => c.id === selectedClass);
  const students = currentClass?.students || [];

  React.useEffect(() => {
    if (!selectedClass && classes.length > 0) setSelectedClass(classes[0].id);
  }, [classes, selectedClass]);

  const handleAddClass = useCallback(async () => {
    if (!newClassName.trim()) return;
    const id = await addClass(newClassName);
    setSelectedClass(id);
    setNewClassName('');
  }, [newClassName, addClass]);

  const handleAddStudent = useCallback(async (studentName) => {
    if (!selectedClass) return;
    await addStudentToClass(selectedClass, studentName);
    setStudentSearch('');
  }, [selectedClass, addStudentToClass]);

  const getScore = (student, virtueKey) => student.scores?.[date]?.[virtueKey] ?? null;
  const isAbsent = (student) => student.scores?.[date]?.absent === true;

  const toggleAbsent = (studentId) => {
    if (!selectedClass) return;
    const stu = students.find(s => s.id === studentId);
    saveDailyScore(selectedClass, studentId, date, 'absent', !isAbsent(stu));
  };

  // ============================================================
  // QUICK SCORE: Clear selection (tap active score to deselect)
  // ============================================================
  const handleScoreTap = (studentId, virtueKey, score) => {
    if (!selectedClass) return;
    const student = students.find(s => s.id === studentId);
    if (!student || isAbsent(student)) return;
    const currentScore = getScore(student, virtueKey);
    if (currentScore === score) {
      saveDailyScore(selectedClass, studentId, date, virtueKey, 0);
    } else {
      saveDailyScore(selectedClass, studentId, date, virtueKey, score);
    }
  };

  // ============================================================
  // QUICK SCORE: Score All per student
  // ============================================================
  const scoreAllForStudent = (studentId, score) => {
    if (!selectedClass) return;
    VIRTUES.forEach(v => {
      saveDailyScore(selectedClass, studentId, date, v.key, score);
    });
  };

  // ============================================================
  // QUICK SCORE: Class-wide default
  // ============================================================
  const setClassDefault = (score) => {
    if (!selectedClass || !window.confirm(`Set all students to ${score} for all virtues on ${date}? This will overwrite existing scores.`)) return;
    students.forEach(student => {
      if (!isAbsent(student)) {
        VIRTUES.forEach(v => {
          saveDailyScore(selectedClass, student.id, date, v.key, score);
        });
      }
    });
  };

  // ============================================================
  // QUICK SCORE: Copy Yesterday
  // ============================================================
  const getPreviousSchoolDay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    do {
      d.setDate(d.getDate() - 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
    return d.toISOString().split('T')[0];
  };

  const copyYesterday = () => {
    if (!selectedClass) return;
    const prevDay = getPreviousSchoolDay(date);
    if (!window.confirm(`Copy scores from ${prevDay} to ${date}? This will overwrite any existing scores for today.`)) return;
    let copied = 0;
    students.forEach(student => {
      const prevScores = student.scores?.[prevDay];
      if (prevScores && !prevScores.absent) {
        VIRTUES.forEach(v => {
          if (prevScores[v.key]) {
            saveDailyScore(selectedClass, student.id, date, v.key, prevScores[v.key]);
          }
        });
        copied++;
      }
      if (prevScores?.absent) {
        saveDailyScore(selectedClass, student.id, date, 'absent', true);
      }
    });
    if (copied === 0) {
      alert(`No scores found for ${prevDay}. Nothing to copy.`);
    }
  };

  // ============================================================
  // GRADEBOOK CALCULATIONS
  // ============================================================
  const gradebookData = useMemo(() => {
    if (!currentClass) return { students: [], periods: [] };

    const allDates = new Set();
    students.forEach(s => {
      Object.keys(s.scores || {}).forEach(d => allDates.add(d));
    });

    const sortedDates = [...allDates].sort();

    const weekBuckets = {};
    const monthBuckets = {};
    sortedDates.forEach(d => {
      const wk = getWeekStart(d);
      if (!weekBuckets[wk]) weekBuckets[wk] = [];
      weekBuckets[wk].push(d);

      const mo = getMonthKey(d);
      if (!monthBuckets[mo]) monthBuckets[mo] = [];
      monthBuckets[mo].push(d);
    });

    const periods = gradebookPeriod === 'weekly'
      ? Object.keys(weekBuckets).sort().reverse()
      : gradebookPeriod === 'monthly'
        ? Object.keys(monthBuckets).sort().reverse()
        : ['overall'];

    const studentGradebook = students
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(student => {
        const periodData = {};
        const allScores = [];

        for (const period of periods) {
          const dates = gradebookPeriod === 'weekly'
            ? weekBuckets[period] || []
            : gradebookPeriod === 'monthly'
              ? monthBuckets[period] || []
              : sortedDates;

          const periodScores = [];
          const virtueScores = {};
          VIRTUES.forEach(v => { virtueScores[v.key] = []; });

          dates.forEach(d => {
            const dayScores = student.scores?.[d];
            if (!dayScores || dayScores.absent) return;
            const dayVals = VIRTUES.map(v => dayScores[v.key] || 0).filter(x => x > 0);
            if (dayVals.length > 0) {
              const dayAvg = dayVals.reduce((a, b) => a + b, 0) / dayVals.length;
              periodScores.push(dayAvg);
              VIRTUES.forEach(v => {
                if (dayScores[v.key] > 0) virtueScores[v.key].push(dayScores[v.key]);
              });
            }
          });

          allScores.push(...periodScores);

          const avg = periodScores.length > 0
            ? periodScores.reduce((a, b) => a + b, 0) / periodScores.length
            : null;

          const virtueAvgs = {};
          VIRTUES.forEach(v => {
            const vals = virtueScores[v.key];
            virtueAvgs[v.key] = vals.length > 0
              ? vals.reduce((a, b) => a + b, 0) / vals.length
              : null;
          });

          periodData[period] = {
            avg,
            pct: avg !== null ? Math.round((avg / 5) * 100) : null,
            daysScored: periodScores.length,
            virtueAvgs,
          };
        }

        const overallAvg = allScores.length > 0
          ? allScores.reduce((a, b) => a + b, 0) / allScores.length
          : null;

        return {
          ...student,
          periodData,
          overallAvg,
          overallPct: overallAvg !== null ? Math.round((overallAvg / 5) * 100) : null,
          totalDaysScored: allScores.length,
        };
      });

    return { students: studentGradebook, periods };
  }, [students, currentClass, gradebookPeriod]);

  // Students from master roster not yet in this class
  const availableStudents = (masterStudents || []).filter(ms =>
    !currentClass?.roster?.includes(ms.name) &&
    ms.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading classes...</div>;

  return (
    <div>
      {legendVirtue && <LegendModal virtue={legendVirtue} onClose={() => setLegendVirtue(null)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, fontSize: 14 }}>{confirmDelete.msg}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => { confirmDelete.action(); setConfirmDelete(null); }}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup Panel — hidden in admin view mode */}
      {!adminViewMode && (
        <div className="setup-panel">
          <div className="setup-header" onClick={() => setShowSetup(!showSetup)}>
            <h3>Class Setup</h3>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{showSetup ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showSetup && (
            <div className="setup-body">
              <div className="setup-row">
                <input type="text" placeholder="New class name (e.g. Theology I)" value={newClassName}
                  onChange={e => setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddClass()} />
                <button className="btn btn-primary" onClick={handleAddClass} style={{ minWidth: 100 }}>+ Add Class</button>
              </div>

              {classes.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>YOUR CLASSES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {classes.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className={`btn ${selectedClass === c.id ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setSelectedClass(c.id)}>
                          {c.name} ({c.students?.length || 0})
                        </button>
                        <button className="btn btn-sm" style={{ background: 'none', color: '#DC2626', padding: '4px 6px', fontSize: 14 }}
                          onClick={() => setConfirmDelete({ msg: `Delete "${c.name}" and all its score data?`, action: () => deleteClass(c.id) })}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedClass && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                    ADD STUDENT TO {currentClass?.name?.toUpperCase()}
                  </div>
                  <input type="text" placeholder="Search master roster..." value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)} style={{ marginBottom: 8, maxWidth: 300 }} />
                  {studentSearch && availableStudents.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {availableStudents.slice(0, 10).map(ms => (
                        <button key={ms.id} className="btn btn-sm btn-secondary"
                          onClick={() => handleAddStudent(ms.name)}>
                          + {ms.name} <span style={{ fontSize: 10, opacity: 0.6 }}>({ms.house})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {studentSearch && availableStudents.length === 0 && (
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
                      No matching students found in master roster. Admin can add them in the Master Roster tab.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin view mode: show class selector without setup */}
      {adminViewMode && classes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {classes.map(c => (
            <button key={c.id}
              className={`btn ${selectedClass === c.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedClass(c.id)}>
              {c.name} ({c.students?.length || 0})
            </button>
          ))}
        </div>
      )}

      {/* View Mode Toggle + Date & Class selector */}
      {selectedClass && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={`btn ${viewMode === 'scoring' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('scoring')}>
              Daily Scoring
            </button>
            <button className={`btn ${viewMode === 'gradebook' ? 'btn-gold' : 'btn-secondary'}`}
              onClick={() => setViewMode('gradebook')}>
              Gradebook
            </button>
          </div>

          {viewMode === 'scoring' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Date:</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
              </div>
              {!adminViewMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Class:</label>
                  <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: 200 }}>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF' }}>
                {students.length} student{students.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================
         SCORING VIEW
         ============================================================ */}
      {viewMode === 'scoring' && selectedClass && (
        <>
          {/* Quick Actions Bar */}
          {students.length > 0 && !adminViewMode && (
            <div className="quick-actions-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>QUICK:</span>
                <button className="btn btn-sm btn-secondary" onClick={copyYesterday}
                  title="Copy scores from the previous school day">
                  Copy Prev Day
                </button>
                <span style={{ fontSize: 11, color: '#D1D5DB' }}>|</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Whole class:</span>
                {[3, 4, 5].map(s => (
                  <button key={s} className="btn btn-sm btn-secondary" onClick={() => setClassDefault(s)}
                    style={{ minWidth: 42 }}>
                    All {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Column headers */}
          {students.length > 0 && (
            <div className="tracker-col-headers">
              <div style={{ minWidth: 140 }}></div>
              <div style={{ width: 28 }}></div>
              <div style={{ width: 100, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>All</span>
              </div>
              {VIRTUES.map(v => (
                <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 170 }}>
                  <span style={{ color: v.color, fontSize: 11, fontWeight: 600 }}>{v.label}</span>
                  <button className="legend-btn" onClick={() => setLegendVirtue(v.key)} title={`${v.label} rubric`}>?</button>
                </div>
              ))}
            </div>
          )}

          {/* Student rows */}
          {selectedClass && students.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
              No students in this class. Search the master roster above to add students.
            </div>
          )}

          {students
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(student => {
              const absent = isAbsent(student);
              return (
                <div key={student.id} className="student-row" style={{ opacity: absent ? 0.4 : 1 }}>
                  <div className="student-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div>
                      <span>{student.name}</span>
                      {student.house && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{student.house}</div>}
                    </div>
                    {!adminViewMode && (
                      <button style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
                        title="Remove from class" onClick={() => setConfirmDelete({
                          msg: `Remove ${student.name} from this class? (They stay in the master roster.)`,
                          action: () => removeStudentFromClass(selectedClass, student.name)
                        })}>×</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 4 }}>
                    <button className={`score-btn absent ${absent ? 'active' : ''}`}
                      onClick={() => !adminViewMode && toggleAbsent(student.id)} title="Mark absent">E</button>
                  </div>

                  {/* Score All buttons */}
                  <div className="score-all-group">
                    {[3, 4, 5].map(s => (
                      <button key={s}
                        className="btn btn-sm score-all-btn"
                        onClick={() => !absent && !adminViewMode && scoreAllForStudent(student.id, s)}
                        disabled={absent || adminViewMode}
                        title={`Set all virtues to ${s}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  <div className="student-virtues">
                    {VIRTUES.map(virtue => (
                      <div key={virtue.key} className="virtue-row">
                        <span className="virtue-label" style={{ color: virtue.color }}>{virtue.label.substring(0, 4)}</span>
                        <div className="score-btns">
                          {[1, 2, 3, 4, 5].map(score => (
                            <button key={score}
                              className={`score-btn s${score} ${getScore(student, virtue.key) === score ? 'active' : ''}`}
                              onClick={() => !adminViewMode && handleScoreTap(student.id, virtue.key, score)}
                              disabled={absent || adminViewMode}>
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </>
      )}

      {/* ============================================================
         GRADEBOOK VIEW
         ============================================================ */}
      {viewMode === 'gradebook' && selectedClass && (
        <div>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>VIEW:</span>
            {[
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'overall', label: 'Overall' },
            ].map(p => (
              <button key={p.id}
                className={`btn btn-sm ${gradebookPeriod === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGradebookPeriod(p.id)}>
                {p.label}
              </button>
            ))}
            {!adminViewMode && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Class:</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: 200 }}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Gradebook Table */}
          {gradebookData.students.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No students in this class.</div>
          ) : gradebookPeriod === 'overall' ? (
            <div>
              <h3 className="section-title" style={{ marginBottom: 4 }}>
                Overall Averages — {currentClass?.name}
              </h3>
              <div className="gradebook-hint">
                The Grade % column is the participation grade to enter in your gradebook.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.substring(0, 4)}</th>)}
                      <th>Avg</th>
                      <th style={{ background: '#FFFBEB' }}>Grade %</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradebookData.students.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        {VIRTUES.map(v => {
                          const allVals = [];
                          Object.values(s.scores || {}).forEach(dayScores => {
                            if (dayScores.absent) return;
                            if (dayScores[v.key] > 0) allVals.push(dayScores[v.key]);
                          });
                          const avg = allVals.length > 0 ? (allVals.reduce((a, b) => a + b, 0) / allVals.length) : null;
                          return (
                            <td key={v.key} style={{ color: avg !== null && avg < 3 ? '#DC2626' : undefined }}>
                              {avg !== null ? avg.toFixed(1) : '—'}
                            </td>
                          );
                        })}
                        <td style={{
                          fontWeight: 600,
                          color: s.overallAvg !== null && s.overallAvg < 3 ? '#DC2626' : '#1B3A5C'
                        }}>
                          {s.overallAvg !== null ? s.overallAvg.toFixed(2) : '—'}
                        </td>
                        <td className="gradebook-grade-cell">
                          {s.overallPct !== null ? `${s.overallPct}%` : '—'}
                        </td>
                        <td style={{ color: '#9CA3AF' }}>{s.totalDaysScored}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              {gradebookData.periods.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No scoring data yet.</div>
              ) : (
                gradebookData.periods.map(period => {
                  const periodLabel = gradebookPeriod === 'weekly'
                    ? `Week of ${formatWeekRange(period)}`
                    : formatMonth(period);
                  return (
                    <div key={period} style={{ marginBottom: 24 }}>
                      <h3 className="section-title" style={{ marginBottom: 4 }}>{periodLabel}</h3>
                      <div className="gradebook-hint">
                        Grade % = participation grade for this {gradebookPeriod === 'weekly' ? 'week' : 'month'}
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Student</th>
                              {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.substring(0, 4)}</th>)}
                              <th>Avg</th>
                              <th style={{ background: '#FFFBEB' }}>Grade %</th>
                              <th>Days</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gradebookData.students.map(s => {
                              const pd = s.periodData[period];
                              if (!pd) return null;
                              return (
                                <tr key={s.id}>
                                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                                  {VIRTUES.map(v => (
                                    <td key={v.key} style={{ color: pd.virtueAvgs[v.key] !== null && pd.virtueAvgs[v.key] < 3 ? '#DC2626' : undefined }}>
                                      {pd.virtueAvgs[v.key] !== null ? pd.virtueAvgs[v.key].toFixed(1) : '—'}
                                    </td>
                                  ))}
                                  <td style={{
                                    fontWeight: 600,
                                    color: pd.avg !== null && pd.avg < 3 ? '#DC2626' : '#1B3A5C'
                                  }}>
                                    {pd.avg !== null ? pd.avg.toFixed(2) : '—'}
                                  </td>
                                  <td className="gradebook-grade-cell">
                                    {pd.pct !== null ? `${pd.pct}%` : '—'}
                                  </td>
                                  <td style={{ color: '#9CA3AF' }}>{pd.daysScored}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Overall summary at bottom */}
              <div style={{ marginTop: 8, padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <h3 className="section-title" style={{ marginBottom: 8 }}>Overall Summary — {currentClass?.name}</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Overall Avg</th>
                        <th style={{ background: '#FFFBEB' }}>Grade %</th>
                        <th>Total Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradebookData.students.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td style={{
                            fontWeight: 600,
                            color: s.overallAvg !== null && s.overallAvg < 3 ? '#DC2626' : '#1B3A5C'
                          }}>
                            {s.overallAvg !== null ? s.overallAvg.toFixed(2) : '—'}
                          </td>
                          <td className="gradebook-grade-cell">
                            {s.overallPct !== null ? `${s.overallPct}%` : '—'}
                          </td>
                          <td style={{ color: '#9CA3AF' }}>{s.totalDaysScored}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedClass && classes.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Create your first class above to get started.</div>
      )}
    </div>
  );
}
