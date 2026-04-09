import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTeacherData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import LegendModal from './LegendModal';

const TODAY = new Date().toISOString().split('T')[0];

// ============================================================
// DATE HELPERS
// ============================================================
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

function getMonthKey(dateStr) {
  return dateStr.substring(0, 7);
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
  return `${fmt(mon)} – ${fmt(fri)}`;
}

function getPreviousSchoolDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().split('T')[0];
}

// ============================================================
// COMPONENT
// ============================================================
export default function DailyTracker({ uid, masterStudents, adminViewMode, adminUid }) {
  const effectiveUid = adminViewMode ? adminUid : uid;

  const {
    classes, loading, addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, saveBulkScores, deleteClass,
  } = useTeacherData(effectiveUid, masterStudents);

  const [selectedClass, setSelectedClass] = useState(null);
  const [date, setDate] = useState(TODAY);
  const [showSetup, setShowSetup] = useState(!adminViewMode);
  const [newClassName, setNewClassName] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [legendVirtue, setLegendVirtue] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewMode, setViewMode] = useState('scoring');
  const [gradebookPeriod, setGradebookPeriod] = useState('weekly');
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);

  // Undo state: snapshot before bulk action
  const undoSnapshot = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');

  const currentClass = classes.find(c => c.id === selectedClass);
  const students = currentClass?.students || [];

  React.useEffect(() => {
    if (!selectedClass && classes.length > 0) setSelectedClass(classes[0].id);
  }, [classes, selectedClass]);

  // Reset period index when switching period type
  React.useEffect(() => { setSelectedPeriodIdx(0); }, [gradebookPeriod]);

  // ============================================================
  // UNDO: Capture snapshot before bulk action
  // ============================================================
  const captureSnapshot = (label) => {
    const snap = {};
    students.forEach(s => {
      const dayScores = s.scores?.[date];
      snap[s.id] = dayScores ? { ...dayScores } : null;
    });
    undoSnapshot.current = snap;
    setCanUndo(true);
    setUndoLabel(label);
  };

  const performUndo = () => {
    if (!undoSnapshot.current || !selectedClass) return;
    const snap = undoSnapshot.current;
    const updates = [];
    students.forEach(student => {
      const prev = snap[student.id];
      if (prev === null) {
        // Was empty — clear all virtues
        VIRTUES.forEach(v => updates.push({ studentId: student.id, virtueKey: v.key, score: 0 }));
        updates.push({ studentId: student.id, virtueKey: 'absent', score: false });
      } else {
        VIRTUES.forEach(v => updates.push({ studentId: student.id, virtueKey: v.key, score: prev[v.key] || 0 }));
        updates.push({ studentId: student.id, virtueKey: 'absent', score: prev.absent || false });
      }
    });
    saveBulkScores(selectedClass, date, updates);
    undoSnapshot.current = null;
    setCanUndo(false);
    setUndoLabel('');
  };

  // ============================================================
  // HANDLERS
  // ============================================================
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

  // Clear selection (tap active score to deselect)
  const handleScoreTap = (studentId, virtueKey, score) => {
    if (!selectedClass) return;
    const student = students.find(s => s.id === studentId);
    if (!student || isAbsent(student)) return;
    const currentScore = getScore(student, virtueKey);
    saveDailyScore(selectedClass, studentId, date, virtueKey, currentScore === score ? null : score);
  };

  // Score All per student
  const scoreAllForStudent = (studentId, score) => {
    if (!selectedClass) return;
    const updates = VIRTUES.map(v => ({ studentId, virtueKey: v.key, score }));
    saveBulkScores(selectedClass, date, updates);
  };

  // Class-wide default
  const setClassDefault = (score) => {
    if (!selectedClass) return;
    if (!window.confirm(`Set all students to ${score} for all virtues on ${date}?`)) return;
    captureSnapshot(`All ${score}`);
    const updates = [];
    students.forEach(student => {
      if (!isAbsent(student)) {
        VIRTUES.forEach(v => updates.push({ studentId: student.id, virtueKey: v.key, score }));
      }
    });
    saveBulkScores(selectedClass, date, updates);
  };

  // Copy Yesterday
  const copyYesterday = () => {
    if (!selectedClass) return;
    const prevDay = getPreviousSchoolDay(date);
    if (!window.confirm(`Copy scores from ${prevDay} to ${date}?`)) return;
    captureSnapshot('Copy Prev Day');
    const updates = [];
    let copied = 0;
    students.forEach(student => {
      const prevScores = student.scores?.[prevDay];
      if (prevScores && !prevScores.absent) {
        VIRTUES.forEach(v => {
          if (prevScores[v.key]) updates.push({ studentId: student.id, virtueKey: v.key, score: prevScores[v.key] });
        });
        copied++;
      }
      if (prevScores?.absent) updates.push({ studentId: student.id, virtueKey: 'absent', score: true });
    });
    if (copied === 0) {
      alert(`No scores found for ${prevDay}. Nothing to copy.`);
      setCanUndo(false);
    } else {
      saveBulkScores(selectedClass, date, updates);
    }
  };

  // ============================================================
  // GRADEBOOK CALCULATIONS
  // ============================================================
  const gradebookData = useMemo(() => {
    if (!currentClass) return { students: [], periods: [] };

    const allDates = new Set();
    students.forEach(s => Object.keys(s.scores || {}).forEach(d => allDates.add(d)));
    const sortedDates = [...allDates].sort();

    const weekBuckets = {}, monthBuckets = {};
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
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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
            const dayVals = VIRTUES.map(v => dayScores[v.key]).filter(x => x !== null && x !== undefined && !isNaN(x));
            if (dayVals.length > 0) {
              periodScores.push(dayVals.reduce((a, b) => a + b, 0) / dayVals.length);
              VIRTUES.forEach(v => { const val = dayScores[v.key]; if (val !== null && val !== undefined && !isNaN(val)) virtueScores[v.key].push(val); });
            }
          });

          allScores.push(...periodScores);
          const avg = periodScores.length > 0 ? periodScores.reduce((a, b) => a + b, 0) / periodScores.length : null;
          const virtueAvgs = {};
          VIRTUES.forEach(v => {
            const vals = virtueScores[v.key];
            virtueAvgs[v.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          });
          periodData[period] = { avg, pct: avg !== null ? Math.round((avg / 5) * 100) : null, daysScored: periodScores.length, virtueAvgs };
        }

        const overallAvg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
        return { ...student, periodData, overallAvg, overallPct: overallAvg !== null ? Math.round((overallAvg / 5) * 100) : null, totalDaysScored: allScores.length };
      });

    return { students: studentGradebook, periods };
  }, [students, currentClass, gradebookPeriod]);

  // Period navigation
  const currentPeriod = gradebookData.periods[selectedPeriodIdx];
  const hasPrevPeriod = selectedPeriodIdx < gradebookData.periods.length - 1;
  const hasNextPeriod = selectedPeriodIdx > 0;

  const availableStudents = (masterStudents || []).filter(ms =>
    !currentClass?.roster?.includes(ms.name) &&
    ms.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading classes...</div>;

  // ============================================================
  // RENDER: Gradebook table for a single period
  // ============================================================
  const renderGradebookTable = (period, showHint) => {
    if (!period) return null;
    const periodLabel = gradebookPeriod === 'weekly'
      ? `Week of ${formatWeekRange(period)}`
      : gradebookPeriod === 'monthly'
        ? formatMonth(period)
        : `Overall — ${currentClass?.name}`;

    return (
      <div>
        {showHint && (
          <div className="gradebook-hint">
            The Grade % column is the participation grade to enter in your gradebook.
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                {VIRTUES.map(v => <th key={v.key} style={{ color: v.color }}>{v.label.substring(0, 4)}</th>)}
                <th>Avg</th>
                <th className="gradebook-grade-header">Grade %</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {gradebookData.students.map(s => {
                const pd = gradebookPeriod === 'overall'
                  ? s.periodData['overall']
                  : s.periodData[period];
                if (!pd) return null;
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    {VIRTUES.map(v => (
                      <td key={v.key} style={{ color: pd.virtueAvgs[v.key] !== null && pd.virtueAvgs[v.key] < 3 ? '#DC2626' : undefined }}>
                        {pd.virtueAvgs[v.key] !== null ? pd.virtueAvgs[v.key].toFixed(1) : '—'}
                      </td>
                    ))}
                    <td style={{ fontWeight: 600, color: pd.avg !== null && pd.avg < 3 ? '#DC2626' : '#1B3A5C' }}>
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
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
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

      {/* ── Setup Panel (teacher only) ── */}
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
                      No matching students in master roster.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Admin class selector ── */}
      {adminViewMode && classes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {classes.map(c => (
            <button key={c.id} className={`btn ${selectedClass === c.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedClass(c.id)}>
              {c.name} ({c.students?.length || 0})
            </button>
          ))}
        </div>
      )}

      {/* ── View toggle ── */}
      {selectedClass && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={`btn ${viewMode === 'scoring' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('scoring')}>Daily Scoring</button>
          <button className={`btn ${viewMode === 'gradebook' ? 'btn-gold' : 'btn-secondary'}`}
            onClick={() => setViewMode('gradebook')}>Gradebook</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
         SCORING VIEW
         ════════════════════════════════════════════════════════════ */}
      {viewMode === 'scoring' && selectedClass && (
        <>
          {/* Date / class row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="field-label">Date:</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
            </div>
            {!adminViewMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="field-label">Class:</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: 200 }}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF' }}>
              {students.length} student{students.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Quick actions bar */}
          {students.length > 0 && !adminViewMode && (
            <div className="quick-actions-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="field-label">QUICK:</span>
                <button className="btn btn-sm btn-secondary" onClick={copyYesterday}>Copy Prev Day</button>
                <span style={{ color: '#D1D5DB' }}>|</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Whole class:</span>
                {[3, 4, 5].map(s => (
                  <button key={s} className="btn btn-sm btn-secondary" onClick={() => setClassDefault(s)} style={{ minWidth: 42 }}>
                    All {s}
                  </button>
                ))}
                {canUndo && (
                  <>
                    <span style={{ color: '#D1D5DB' }}>|</span>
                    <button className="btn btn-sm btn-danger" onClick={performUndo} title={`Undo "${undoLabel}"`}>
                      Undo {undoLabel}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Student scoring grid */}
          {students.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
              No students in this class. Search the master roster above to add students.
            </div>
          )}

          {students.length > 0 && students
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(student => {
              const absent = isAbsent(student);
              return (
                <div key={student.id} className="student-scoring-row" style={{ opacity: absent ? 0.4 : 1 }}>
                  {/* Left: name + absent + score-all */}
                  <div className="student-scoring-left">
                    <div className="student-name-block">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="student-name-text">{student.name}</span>
                        {!adminViewMode && (
                          <button className="remove-btn" title="Remove from class"
                            onClick={() => setConfirmDelete({
                              msg: `Remove ${student.name} from this class? (They stay in the master roster.)`,
                              action: () => removeStudentFromClass(selectedClass, student.name)
                            })}>×</button>
                        )}
                      </div>
                      {student.house && <div className="student-house-label">{student.house}</div>}
                    </div>
                    <button className={`score-btn absent ${absent ? 'active' : ''}`}
                      onClick={() => !adminViewMode && toggleAbsent(student.id)} title="Mark absent">E</button>
                    <div className="score-all-group">
                      {[3, 4, 5].map(s => (
                        <button key={s} className="score-all-chip"
                          onClick={() => !absent && !adminViewMode && scoreAllForStudent(student.id, s)}
                          disabled={absent || adminViewMode} title={`All ${s}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  {/* Right: virtue rows */}
                  <div className="student-virtues">
                    {VIRTUES.map(virtue => (
                      <div key={virtue.key} className="virtue-row">
                        <span className="virtue-label" style={{ color: virtue.color }}>{virtue.label.substring(0, 4)}</span>
                        <div className="score-btns">
                          {[0, 1, 2, 3, 4, 5].map(score => (
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

      {/* ════════════════════════════════════════════════════════════
         GRADEBOOK VIEW
         ════════════════════════════════════════════════════════════ */}
      {viewMode === 'gradebook' && selectedClass && (
        <div>
          {/* Period type + class selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[{ id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }, { id: 'overall', label: 'Overall' }].map(p => (
              <button key={p.id} className={`btn btn-sm ${gradebookPeriod === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGradebookPeriod(p.id)}>{p.label}</button>
            ))}
            {!adminViewMode && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="field-label">Class:</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: 200 }}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {gradebookData.students.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No students in this class.</div>
          ) : gradebookPeriod === 'overall' ? (
            <>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Overall — {currentClass?.name}</h3>
              {renderGradebookTable('overall', true)}
            </>
          ) : (
            <>
              {gradebookData.periods.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No scoring data yet.</div>
              ) : (
                <>
                  {/* Period navigation */}
                  <div className="period-nav">
                    <button className="btn btn-sm btn-secondary" disabled={!hasPrevPeriod}
                      onClick={() => setSelectedPeriodIdx(i => i + 1)}>
                      ← Older
                    </button>
                    <span className="period-nav-label">
                      {gradebookPeriod === 'weekly'
                        ? `Week of ${formatWeekRange(currentPeriod)}`
                        : formatMonth(currentPeriod)}
                    </span>
                    <button className="btn btn-sm btn-secondary" disabled={!hasNextPeriod}
                      onClick={() => setSelectedPeriodIdx(i => i - 1)}>
                      Newer →
                    </button>
                  </div>

                  {renderGradebookTable(currentPeriod, true)}
                </>
              )}

              {/* Overall summary always at bottom */}
              <div className="gradebook-overall-box">
                <h3 className="section-title" style={{ marginBottom: 8 }}>Overall — {currentClass?.name}</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>Student</th><th>Overall Avg</th><th className="gradebook-grade-header">Grade %</th><th>Total Days</th></tr>
                    </thead>
                    <tbody>
                      {gradebookData.students.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td style={{ fontWeight: 600, color: s.overallAvg !== null && s.overallAvg < 3 ? '#DC2626' : '#1B3A5C' }}>
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
            </>
          )}
        </div>
      )}

      {!selectedClass && classes.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Create your first class above to get started.</div>
      )}
    </div>
  );
}
