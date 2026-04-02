import React, { useState, useCallback } from 'react';
import { useTeacherData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';
import LegendModal from './LegendModal';

const TODAY = new Date().toISOString().split('T')[0];

export default function DailyTracker({ uid, masterStudents }) {
  const {
    classes, loading, addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, deleteClass,
  } = useTeacherData(uid, masterStudents);

  const [selectedClass, setSelectedClass] = useState(null);
  const [date, setDate] = useState(TODAY);
  const [showSetup, setShowSetup] = useState(true);
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

            {/* Add student from master roster */}
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

      {/* Date & Class selector */}
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
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF' }}>
            {students.length} student{students.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Column headers */}
      {selectedClass && students.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, paddingLeft: 140, fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
          <div style={{ width: 28 }}></div>
          {VIRTUES.map(v => (
            <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 170 }}>
              <span style={{ color: v.color }}>{v.label}</span>
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
                      {[1, 2, 3, 4, 5].map(score => (
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

      {!selectedClass && classes.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Create your first class above to get started.</div>
      )}
    </div>
  );
}
