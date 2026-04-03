import React, { useState, useCallback } from 'react';
import { useTeacherData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import LegendModal from './LegendModal';

const TODAY = new Date().toISOString().split('T')[0];

const SCORE_COLORS = {
  0: { bg: '#F3F4F6', color: '#6B7280' },
  1: { bg: '#FEE2E2', color: '#DC2626' },
  2: { bg: '#FFEDD5', color: '#EA580C' },
  3: { bg: '#FEF9C3', color: '#CA8A04' },
  4: { bg: '#DCFCE7', color: '#16A34A' },
  5: { bg: '#E8EEF4', color: '#1B3A5C' },
};

export default function DailyTracker({ uid, masterStudents }) {
  const {
    classes, loading, addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, deleteClass,
  } = useTeacherData(uid, masterStudents);

  const [selectedClass, setSelectedClass] = useState(null);
  const [date, setDate] = useState(TODAY);
  const [showSetup, setShowSetup] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const [newClassName, setNewClassName] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [legendVirtue, setLegendVirtue] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  // Set All: give every non-absent student the same score for a virtue
  const setAllScores = useCallback((virtueKey, score) => {
    if (!selectedClass) return;
    students.forEach(stu => {
      if (!isAbsent(stu)) {
        saveDailyScore(selectedClass, stu.id, date, virtueKey, score);
      }
    });
  }, [selectedClass, students, date, saveDailyScore]);

  const availableStudents = (masterStudents || []).filter(ms =>
    !currentClass?.roster?.includes(ms.name) &&
    ms.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const sortedStudents = [...students].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

      {/* Setup Panel */}
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
                <input type="text" placeholder="Filter students..." value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)} style={{ marginBottom: 8, maxWidth: 300 }} />
                {availableStudents.length > 0 ? (
                  <div style={{
                    maxHeight: 200, overflowY: 'auto', border: '1px solid #D1D5DB',
                    borderRadius: 6, background: '#fff',
                  }}>
                    {availableStudents.map(ms => (
                      <div key={ms.id}
                        onClick={() => handleAddStudent(ms.name)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid #F3F4F6',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <span style={{ fontWeight: 500 }}>{ms.name}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{ms.house || 'No house'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9CA3AF', padding: 8 }}>
                    {(masterStudents || []).length === 0
                      ? 'No students in master roster. Admin can add them in the Master Roster tab.'
                      : 'All students are already in this class.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date, Class, View Toggle */}
      {selectedClass && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Date:</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Class:</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: 200 }}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{students.length} students</span>
            <button className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('grid')}>Quick Score</button>
            <button className={`btn btn-sm ${viewMode === 'card' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('card')}>Detailed</button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* GRID VIEW — Quick Score with Set All */}
      {/* ============================================================ */}
      {selectedClass && viewMode === 'grid' && students.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280', minWidth: 150 }}>Student</th>
                <th style={{ padding: '8px 6px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, fontWeight: 600, color: '#6B7280', width: 36, textAlign: 'center' }}>E</th>
                {VIRTUES.map(v => (
                  <th key={v.key} style={{ padding: '4px 2px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', textAlign: 'center', minWidth: 180 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: v.color, marginBottom: 4, cursor: 'pointer' }}
                      onClick={() => setLegendVirtue(v.key)}>
                      {v.label} <span style={{ fontSize: 9, opacity: 0.6 }}>?</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                      {[0, 1, 2, 3, 4, 5].map(score => (
                        <button key={score} onClick={() => setAllScores(v.key, score)}
                          title={`Set all to ${score}`}
                          style={{
                            width: 28, height: 22, borderRadius: 4, border: 'none',
                            background: SCORE_COLORS[score].bg, color: SCORE_COLORS[score].color,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            opacity: 0.7, transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.target.style.opacity = 1}
                          onMouseLeave={e => e.target.style.opacity = 0.7}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </th>
                ))}
                <th style={{ padding: '8px 6px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, fontWeight: 600, color: '#6B7280', textAlign: 'center', width: 44 }}>Avg</th>
                <th style={{ padding: '8px 6px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', fontSize: 11, fontWeight: 600, color: '#6B7280', textAlign: 'center', width: 50 }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(student => {
                const absent = isAbsent(student);
                const scores = VIRTUES.map(v => getScore(student, v.key)).filter(s => s !== null && s !== undefined);
                const scoredValues = scores.filter(s => s > 0);
                const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
                const gradePct = avg !== null ? Math.round((avg / 5) * 100) : null;
                return (
                  <tr key={student.id} style={{ opacity: absent ? 0.35 : 1 }}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #F3F4F6', fontWeight: 500, color: '#1B3A5C' }}>
                      {student.name}
                    </td>
                    <td style={{ padding: '4px', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
                      <button onClick={() => toggleAbsent(student.id)}
                        style={{
                          width: 28, height: 28, borderRadius: 4, border: 'none',
                          background: absent ? '#6B7280' : '#F3F4F6',
                          color: absent ? '#fff' : '#9CA3AF',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>E</button>
                    </td>
                    {VIRTUES.map(v => {
                      const score = getScore(student, v.key);
                      return (
                        <td key={v.key} style={{ padding: '4px 2px', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                            {[0, 1, 2, 3, 4, 5].map(s => {
                              const active = score === s;
                              const sc = SCORE_COLORS[s];
                              return (
                                <button key={s}
                                  onClick={() => !absent && saveDailyScore(selectedClass, student.id, date, v.key, s)}
                                  disabled={absent}
                                  style={{
                                    width: 28, height: 28, borderRadius: 4,
                                    border: active ? `2px solid ${sc.color}` : '1px solid #E5E7EB',
                                    background: active ? sc.bg : '#fff',
                                    color: active ? sc.color : '#D1D5DB',
                                    fontSize: 13, fontWeight: active ? 700 : 400,
                                    cursor: absent ? 'default' : 'pointer',
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{
                      padding: '6px', borderBottom: '1px solid #F3F4F6', textAlign: 'center',
                      fontSize: 13, fontWeight: 600,
                      color: avg !== null ? (avg >= 4 ? '#16A34A' : avg >= 3 ? '#CA8A04' : '#DC2626') : '#D1D5DB',
                    }}>
                      {avg !== null ? avg.toFixed(1) : '—'}
                    </td>
                    <td style={{
                      padding: '6px', borderBottom: '1px solid #F3F4F6', textAlign: 'center',
                      fontSize: 12, fontWeight: 500, color: '#6B7280',
                    }}>
                      {gradePct !== null ? `${gradePct}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' }}>
            Use the small buttons under each virtue header to set the whole class at once, then adjust individual students.
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CARD VIEW — Detailed Layout */}
      {/* ============================================================ */}
      {selectedClass && viewMode === 'card' && students.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, paddingLeft: 140, fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
            <div style={{ width: 28 }}></div>
            {VIRTUES.map(v => (
              <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 170 }}>
                <span style={{ color: v.color }}>{v.label}</span>
                <button className="legend-btn" onClick={() => setLegendVirtue(v.key)} title={`${v.label} rubric`}>?</button>
              </div>
            ))}
          </div>

          {sortedStudents.map(student => {
            const absent = isAbsent(student);
            return (
              <div key={student.id} className="student-row" style={{ opacity: absent ? 0.4 : 1 }}>
                <div className="student-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div>
                    <span>{student.name}</span>
                    {student.house && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{student.house}</div>}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
                    title="Remove from class" onClick={() => setConfirmDelete({
                      msg: `Remove ${student.name} from this class? (They stay in the master roster.)`,
                      action: () => removeStudentFromClass(selectedClass, student.name)
                    })}>×</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 4 }}>
                  <button className={`score-btn absent ${absent ? 'active' : ''}`}
                    onClick={() => toggleAbsent(student.id)} title="Mark absent">E</button>
                </div>

                <div className="student-virtues">
                  {VIRTUES.map(virtue => (
                    <div key={virtue.key} className="virtue-row">
                      <span className="virtue-label" style={{ color: virtue.color }}>{virtue.label.substring(0, 4)}</span>
                      <div className="score-btns">
                        {[0, 1, 2, 3, 4, 5].map(score => (
                          <button key={score}
                            className={`score-btn s${score} ${getScore(student, virtue.key) === score ? 'active' : ''}`}
                            onClick={() => !absent && saveDailyScore(selectedClass, student.id, date, virtue.key, score)}
                            disabled={absent}>
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

      {selectedClass && students.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          No students in this class. Search the master roster above to add students.
        </div>
      )}

      {!selectedClass && classes.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Create your first class above to get started.</div>
      )}
    </div>
  );
}
