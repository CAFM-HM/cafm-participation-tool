import React, { useState, useCallback } from 'react';
import { useTeacherData } from '../hooks/useFirestore';
import { VIRTUES, HOUSES } from '../data/virtueData';
import LegendModal from './LegendModal';

const TODAY = new Date().toISOString().split('T')[0];

export default function DailyTracker({ uid }) {
  const {
    classes, loading, addClass, addStudent, deleteStudent, deleteClass,
  } = useTeacherData(uid);

  const [selectedClass, setSelectedClass] = useState(null);
  const [date, setDate] = useState(TODAY);
  const [setupOpen, setSetupOpen] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPronoun, setNewStudentPronoun] = useState('he');
  const [newStudentHouse, setNewStudentHouse] = useState('');
  const [legendVirtue, setLegendVirtue] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [localScores, setLocalScores] = useState({});

  const currentClass = classes.find(c => c.id === selectedClass);

  const getScore = useCallback((studentId, virtueKey) => {
    const localKey = `${studentId}_${date}_${virtueKey}`;
    if (localScores[localKey] !== undefined) return localScores[localKey];
    const student = currentClass?.students?.find(s => s.id === studentId);
    return student?.scores?.[date]?.[virtueKey] ?? null;
  }, [localScores, date, currentClass]);

  const handleScore = useCallback(async (studentId, virtueKey, score) => {
    const localKey = `${studentId}_${date}_${virtueKey}`;
    const current = getScore(studentId, virtueKey);
    const newScore = current === score ? null : score;

    setLocalScores(prev => ({ ...prev, [localKey]: newScore }));

    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const ref = doc(db, 'teachers', uid, 'classes', selectedClass, 'students', studentId);
    try {
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      const scores = { ...(existing.scores || {}) };
      if (!scores[date]) scores[date] = {};
      if (newScore === null) {
        delete scores[date][virtueKey];
        if (Object.keys(scores[date]).length === 0) delete scores[date];
      } else {
        scores[date][virtueKey] = newScore;
      }
      await setDoc(ref, { ...existing, scores }, { merge: true });
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }, [date, uid, selectedClass, getScore]);

  const handleAbsent = useCallback(async (studentId) => {
    const isAbsent = VIRTUES.every(v => getScore(studentId, v.key) === 0);
    for (const v of VIRTUES) {
      const localKey = `${studentId}_${date}_${v.key}`;
      setLocalScores(prev => ({ ...prev, [localKey]: isAbsent ? null : 0 }));
    }
    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const ref = doc(db, 'teachers', uid, 'classes', selectedClass, 'students', studentId);
    try {
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      const scores = { ...(existing.scores || {}) };
      if (isAbsent) {
        delete scores[date];
      } else {
        scores[date] = {};
        VIRTUES.forEach(v => { scores[date][v.key] = 0; });
      }
      await setDoc(ref, { ...existing, scores }, { merge: true });
    } catch (err) {
      console.error('Error saving absent:', err);
    }
  }, [date, uid, selectedClass, getScore]);

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    const id = await addClass(newClassName);
    setSelectedClass(id);
    setNewClassName('');
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !selectedClass) return;
    await addStudent(selectedClass, newStudentName, newStudentPronoun, newStudentHouse);
    setNewStudentName('');
    setNewStudentPronoun('he');
    setNewStudentHouse('');
  };

  const getStudentAvg = (studentId) => {
    const scores = VIRTUES.map(v => getScore(studentId, v.key)).filter(s => s !== null && s > 0);
    if (scores.length === 0) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading classes...</div>;
  }

  return (
    <div>
      {legendVirtue && <LegendModal virtue={legendVirtue} onClose={() => setLegendVirtue(null)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, fontSize: 14 }}>
                {confirmDelete.type === 'student'
                  ? `Delete ${confirmDelete.name}? All their scores will be permanently removed.`
                  : `Delete the class "${confirmDelete.name}"? All students and scores will be permanently removed.`
                }
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={async () => {
                  if (confirmDelete.type === 'student') await deleteStudent(selectedClass, confirmDelete.id);
                  else { await deleteClass(confirmDelete.id); setSelectedClass(null); }
                  setConfirmDelete(null);
                }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup Panel */}
      <div className="setup-panel">
        <div className="setup-header" onClick={() => setSetupOpen(!setupOpen)}>
          <h3>Class Setup</h3>
          <span style={{ fontSize: 12, color: '#6B7280' }}>{setupOpen ? '▲ Hide' : '▼ Show'}</span>
        </div>
        {setupOpen && (
          <div className="setup-body">
            <div className="setup-row">
              <select value={selectedClass || ''} onChange={e => setSelectedClass(e.target.value || null)}>
                <option value="">Select a class...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedClass && (
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete({ type: 'class', id: selectedClass, name: currentClass?.name })} style={{ flexShrink: 0 }}>
                  Delete Class
                </button>
              )}
            </div>
            <div className="setup-row">
              <input type="text" placeholder="New class name (e.g. Humanities 9)" value={newClassName} onChange={e => setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddClass()} />
              <button className="btn btn-primary btn-sm" onClick={handleAddClass} style={{ flexShrink: 0 }}>+ Add Class</button>
            </div>
            {selectedClass && (
              <>
                <div style={{ borderTop: '1px solid #BFDBFE', margin: '12px 0', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1B3A5C', marginBottom: 8 }}>Add Student to {currentClass?.name}</div>
                </div>
                <div className="setup-row">
                  <input type="text" placeholder="Student name" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddStudent()} style={{ flex: 2 }} />
                  <select value={newStudentPronoun} onChange={e => setNewStudentPronoun(e.target.value)} style={{ flex: 0.7 }}>
                    <option value="he">He/Him</option>
                    <option value="she">She/Her</option>
                  </select>
                  <select value={newStudentHouse} onChange={e => setNewStudentHouse(e.target.value)} style={{ flex: 1 }}>
                    <option value="">House (optional)</option>
                    {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleAddStudent} style={{ flexShrink: 0 }}>+ Add</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Date Picker */}
      {selectedClass && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Date:</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          {date !== TODAY && (
            <button className="btn btn-secondary btn-sm" onClick={() => setDate(TODAY)}>Today</button>
          )}
        </div>
      )}

      {!selectedClass && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Select or create a class above to start scoring.</div>
      )}

      {/* Student Scoring Grid */}
      {selectedClass && currentClass && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '2px solid #E5E7EB', marginBottom: 4 }}>
            <div style={{ minWidth: 110, fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{currentClass.name}</div>
            <div style={{ display: 'flex', gap: 16, flex: 1 }}>
              {VIRTUES.map(v => (
                <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 100 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: v.color }}>{v.label}</span>
                  <button className="legend-btn" onClick={() => setLegendVirtue(v.key)} title={`${v.label} rubric`}>?</button>
                </div>
              ))}
              <div style={{ minWidth: 40, fontSize: 10, fontWeight: 700, color: '#6B7280', textAlign: 'center' }}>AVG</div>
            </div>
          </div>

          {(!currentClass.students || currentClass.students.length === 0) ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No students yet. Add students above.</div>
          ) : (
            currentClass.students
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(student => {
                const isAbsent = VIRTUES.every(v => getScore(student.id, v.key) === 0);
                const avg = getStudentAvg(student.id);
                return (
                  <div key={student.id} className="student-row" style={{ opacity: isAbsent ? 0.5 : 1 }}>
                    <div className="student-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{student.name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className={`score-btn absent ${isAbsent ? 'active' : ''}`} onClick={() => handleAbsent(student.id)} title={isAbsent ? 'Mark present' : 'Mark absent'} style={{ fontSize: 9 }}>
                          {isAbsent ? 'ABS' : 'E'}
                        </button>
                        <button className="btn btn-sm" style={{ fontSize: 9, padding: '2px 5px', color: '#DC2626', background: 'transparent' }} onClick={() => setConfirmDelete({ type: 'student', id: student.id, name: student.name })} title="Delete student">✕</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                      {VIRTUES.map(v => (
                        <div key={v.key} className="score-btns" style={{ minWidth: 100 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <button key={s} className={`score-btn s${s} ${getScore(student.id, v.key) === s ? 'active' : ''}`} onClick={() => handleScore(student.id, v.key, s)} disabled={isAbsent}>{s}</button>
                          ))}
                        </div>
                      ))}
                      <div style={{ minWidth: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: avg === null ? '#D1D5DB' : avg >= 3.5 ? '#16A34A' : avg >= 2.5 ? '#CA8A04' : '#DC2626' }}>
                        {avg ?? '—'}
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
