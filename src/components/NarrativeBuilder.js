import React, { useState, useCallback, useMemo } from 'react';
import { useNarrativeData } from '../hooks/useFirestore';
import { VIRTUES, VIRTUE_SENTENCES, OPENINGS, CLOSINGS, buildNarrative, getBridgingSentences } from '../data/virtueData';

function makeEmptyStudent(id) {
  return {
    id,
    name: '',
    pronoun: 'he',
    scores: { discipline: null, attention: null, charity: null, inquiry: null },
    sentenceSelections: { discipline: null, attention: null, charity: null, inquiry: null },
    openingIndex: null,
    closingIndex: null,
    comment: '',
  };
}

export default function NarrativeBuilder({ uid }) {
  const { narrativeConfig, setNarrativeConfig, loading } = useNarrativeData(uid);
  const [activeStudentIdx, setActiveStudentIdx] = useState(0);
  const [setupOpen, setSetupOpen] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const config = narrativeConfig || { teacherName: '', className: '', quarter: 'Q4', students: [] };
  const students = config.students || [];

  const updateConfig = useCallback((updates) => {
    setNarrativeConfig({ ...config, ...updates });
  }, [config, setNarrativeConfig]);

  const updateStudent = useCallback((idx, updates) => {
    const newStudents = [...students];
    newStudents[idx] = { ...newStudents[idx], ...updates };
    updateConfig({ students: newStudents });
  }, [students, updateConfig]);

  const addStudent = () => {
    const newStudents = [...students, makeEmptyStudent(Date.now())];
    updateConfig({ students: newStudents });
    setActiveStudentIdx(newStudents.length - 1);
  };

  const removeStudent = (idx) => {
    const newStudents = students.filter((_, i) => i !== idx);
    updateConfig({ students: newStudents });
    if (activeStudentIdx >= newStudents.length) setActiveStudentIdx(Math.max(0, newStudents.length - 1));
  };

  const student = students[activeStudentIdx];

  const overallScore = useMemo(() => {
    if (!student) return null;
    const vals = VIRTUES.map(v => student.scores?.[v.key]).filter(v => v !== null && v !== undefined);
    if (vals.length !== 4) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [student]);

  const getProgress = (s) => {
    if (!s) return { done: 0, total: 6 };
    let done = 0;
    VIRTUES.forEach(v => { if (s.sentenceSelections?.[v.key] !== null && s.sentenceSelections?.[v.key] !== undefined) done++; });
    if (s.openingIndex !== null && s.openingIndex !== undefined) done++;
    if (s.closingIndex !== null && s.closingIndex !== undefined) done++;
    return { done, total: 6 };
  };

  const completedCount = students.filter(s => buildNarrative(s, config.teacherName, config.className, config.quarter) !== null).length;

  const copyNarrative = async (idx) => {
    const s = students[idx];
    const text = buildNarrative(s, config.teacherName, config.className, config.quarter);
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); } catch {}
  };

  const copyAll = async () => {
    const texts = students.map(s => {
      const text = buildNarrative(s, config.teacherName, config.className, config.quarter);
      return text ? `${s.name}:\n${text}` : null;
    }).filter(Boolean);
    if (texts.length === 0) return;
    try { await navigator.clipboard.writeText(texts.join('\n\n---\n\n')); setCopiedIdx('all'); setTimeout(() => setCopiedIdx(null), 2000); } catch {}
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading narrative data...</div>;

  return (
    <div>
      {/* Setup */}
      <div className="setup-panel">
        <div className="setup-header" onClick={() => setSetupOpen(!setupOpen)}>
          <h3>Class Setup</h3>
          <span style={{ fontSize: 12, color: '#6B7280' }}>{setupOpen ? '▲ Hide' : '▼ Show'}</span>
        </div>
        {setupOpen && (
          <div className="setup-body">
            <div className="setup-row">
              <input type="text" placeholder="Teacher Name" value={config.teacherName || ''} onChange={e => updateConfig({ teacherName: e.target.value })} />
              <input type="text" placeholder="Class Name (e.g. Humanities 9)" value={config.className || ''} onChange={e => updateConfig({ className: e.target.value })} />
              <select value={config.quarter || 'Q4'} onChange={e => updateConfig({ quarter: e.target.value })}>
                <option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Student tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {students.map((s, i) => {
          const prog = getProgress(s);
          const allScored = s.scores && VIRTUES.every(v => s.scores[v.key] !== null && s.scores[v.key] !== undefined);
          const isComplete = prog.done === prog.total && allScored;
          return (
            <button key={s.id} className={`tab-btn ${activeStudentIdx === i ? 'active' : ''}`} onClick={() => setActiveStudentIdx(i)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6 }}>
              {s.name || `Student ${i + 1}`}
              {isComplete && <span style={{ marginLeft: 4, color: '#16A34A' }}>✓</span>}
            </button>
          );
        })}
        <button className="btn btn-primary btn-sm" onClick={addStudent}>+ Add Student</button>
        {completedCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{completedCount}/{students.length} complete</span>}
      </div>

      {/* Current student editor */}
      {student ? (
        <div className="narrative-student">
          <div className="narrative-student-header">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
              <input type="text" placeholder="Student Name" value={student.name || ''} onChange={e => updateStudent(activeStudentIdx, { name: e.target.value })} style={{ width: 180 }} />
              <select value={student.pronoun || 'he'} onChange={e => updateStudent(activeStudentIdx, { pronoun: e.target.value })} style={{ width: 100 }}>
                <option value="he">He/Him</option><option value="she">She/Her</option>
              </select>
              <button className="btn btn-sm" style={{ color: '#DC2626', background: 'transparent', fontSize: 11 }} onClick={() => removeStudent(activeStudentIdx)}>Remove Student</button>
            </div>
          </div>
          <div className="narrative-student-body">
            {/* Virtue Scores */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C', marginBottom: 10 }}>1. Score each virtue</div>
              {VIRTUES.map(v => (
                <div key={v.key} className="virtue-row">
                  <span className="virtue-label" style={{ color: v.color }}>{v.label}</span>
                  <div className="score-btns">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} className={`score-btn s${s} ${student.scores?.[v.key] === s ? 'active' : ''}`} onClick={() => {
                        const newScores = { ...student.scores, [v.key]: student.scores?.[v.key] === s ? null : s };
                        const newSent = { ...student.sentenceSelections };
                        if (newScores[v.key] !== student.scores?.[v.key]) newSent[v.key] = null;
                        updateStudent(activeStudentIdx, { scores: newScores, sentenceSelections: newSent });
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Opening */}
            {overallScore && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C', marginBottom: 8 }}>2. Choose opening sentence</div>
                {OPENINGS[overallScore]?.map((text, i) => (
                  <div key={i} className={`sentence-option ${student.openingIndex === i ? 'selected' : ''}`} onClick={() => updateStudent(activeStudentIdx, { openingIndex: student.openingIndex === i ? null : i })}>
                    {text.replace('[S]', student.name || '[Student]').replace('[C]', config.className || '[Class]')}
                  </div>
                ))}
              </div>
            )}

            {/* Virtue sentences */}
            {VIRTUES.map((v, vi) => {
              const score = student.scores?.[v.key];
              if (!score) return null;
              const options = VIRTUE_SENTENCES[v.key]?.[score]?.[student.pronoun || 'he'];
              if (!options) return null;
              return (
                <div key={v.key} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: v.color, marginBottom: 8 }}>{3 + vi}. {v.label} sentence (score: {score})</div>
                  {options.map((text, i) => (
                    <div key={i} className={`sentence-option ${student.sentenceSelections?.[v.key] === i ? 'selected' : ''}`} onClick={() => {
                      const newSent = { ...student.sentenceSelections, [v.key]: student.sentenceSelections?.[v.key] === i ? null : i };
                      updateStudent(activeStudentIdx, { sentenceSelections: newSent });
                    }}>{text}</div>
                  ))}
                </div>
              );
            })}

            {/* Closing */}
            {overallScore && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C', marginBottom: 8 }}>7. Choose closing sentence</div>
                {[...(CLOSINGS[overallScore]?.[student.pronoun || 'he'] || []), ...(CLOSINGS[overallScore]?.n || [])].map((text, i) => (
                  <div key={i} className={`sentence-option ${student.closingIndex === i ? 'selected' : ''}`} onClick={() => updateStudent(activeStudentIdx, { closingIndex: student.closingIndex === i ? null : i })}>{text}</div>
                ))}
              </div>
            )}

            {/* Bridging notice */}
            {student.scores && (() => {
              const bridges = getBridgingSentences(student.scores, student.pronoun || 'he');
              if (bridges.length === 0) return null;
              return (
                <div style={{ marginBottom: 16, padding: 12, background: '#FEF3C7', borderRadius: 8, border: '1px solid #FCD34D' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 6 }}>Auto-bridging (smooths contradictions):</div>
                  {bridges.map((b, i) => <div key={i} style={{ fontSize: 13, color: '#78350F', marginBottom: 4, fontStyle: 'italic' }}>{b}</div>)}
                </div>
              );
            })()}

            {/* Progress */}
            {(() => {
              const prog = getProgress(student);
              const virtuesDone = VIRTUES.filter(v => student.scores?.[v.key] !== null && student.scores?.[v.key] !== undefined).length;
              const total = prog.total + 4;
              const done = prog.done + virtuesDone;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{done}/{total} steps complete</div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${(done / total) * 100}%` }} /></div>
                </div>
              );
            })()}

            {/* Preview */}
            {(() => {
              const text = buildNarrative(student, config.teacherName, config.className, config.quarter);
              if (!text) return <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 13, border: '1px dashed #D1D5DB', borderRadius: 8 }}>Complete all selections above to preview the narrative.</div>;
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>Narrative Preview</div>
                    <button className="btn btn-primary btn-sm" onClick={() => copyNarrative(activeStudentIdx)}>{copiedIdx === activeStudentIdx ? '✓ Copied!' : 'Copy'}</button>
                  </div>
                  <div className="narrative-preview">{text}</div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Add a student above to begin building narratives.</div>
      )}

      {completedCount > 1 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn-gold" onClick={copyAll}>{copiedIdx === 'all' ? '✓ All Copied!' : `Copy All ${completedCount} Narratives`}</button>
        </div>
      )}
    </div>
  );
}
