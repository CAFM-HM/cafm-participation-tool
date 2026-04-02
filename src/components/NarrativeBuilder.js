import React, { useState, useCallback, useMemo } from 'react';
import { useTeacherData, useNarrativeData } from '../hooks/useFirestore';
import {
  VIRTUES, VIRTUE_SENTENCES, OPENINGS, CLOSINGS,
  getBridgingSentences, getOpenings
} from '../data/virtueData';

export default function NarrativeBuilder({ uid, masterStudents }) {
  const { classes, loading: classesLoading } = useTeacherData(uid, masterStudents);
  const { narrativeConfig, setNarrativeConfig, loading: narrativeLoading } = useNarrativeData(uid);
  const [selectedClass, setSelectedClass] = useState(null);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [showSetup, setShowSetup] = useState(true);

  const config = narrativeConfig || { teacherName: '', className: '', quarter: 'Q4', students: [] };
  const students = config.students || [];

  const updateConfig = useCallback((updates) => {
    setNarrativeConfig({ ...config, ...updates });
  }, [config, setNarrativeConfig]);

  const updateStudent = useCallback((studentId, updates) => {
    const newStudents = students.map(s =>
      s.id === studentId ? { ...s, ...updates } : s
    );
    updateConfig({ students: newStudents });
  }, [students, updateConfig]);

  // Calculate quarterly averages for a student from daily tracker data
  const getQuarterlyAvg = useCallback((studentScores) => {
    const virtueTotals = {};
    const virtueCounts = {};
    VIRTUES.forEach(v => { virtueTotals[v.key] = 0; virtueCounts[v.key] = 0; });

    for (const [dateStr, dayScores] of Object.entries(studentScores || {})) {
      if (dayScores.absent) continue;
      VIRTUES.forEach(v => {
        if (dayScores[v.key] && typeof dayScores[v.key] === 'number') {
          virtueTotals[v.key] += dayScores[v.key];
          virtueCounts[v.key] += 1;
        }
      });
    }

    const result = {};
    VIRTUES.forEach(v => {
      result[v.key] = virtueCounts[v.key] > 0
        ? Math.round(virtueTotals[v.key] / virtueCounts[v.key])
        : null;
    });
    return result;
  }, []);

  // Import students from a selected class with their quarterly averages
  const importFromClass = useCallback((classId) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;

    setSelectedClass(classId);

    const imported = cls.students.map((stu, idx) => {
      const avgScores = getQuarterlyAvg(stu.scores);
      // Check if this student already exists in narrative config
      const existing = students.find(s => s.name === stu.name);
      if (existing) {
        // Update scores but keep sentence selections
        return { ...existing, scores: avgScores };
      }
      return {
        id: Date.now() + idx,
        name: stu.name,
        pronoun: stu.pronoun || 'he',
        scores: avgScores,
        sentenceSelections: { discipline: null, attention: null, charity: null, inquiry: null },
        openingIndex: null,
        closingIndex: null,
        comment: '',
      };
    });

    updateConfig({
      className: cls.name,
      students: imported,
    });
  }, [classes, students, getQuarterlyAvg, updateConfig]);

  const removeStudent = useCallback((id) => {
    updateConfig({ students: students.filter(s => s.id !== id) });
  }, [students, updateConfig]);

  const getOverallScore = (student) => {
    const vals = VIRTUES.map(v => student.scores?.[v.key]).filter(s => s !== null && s !== undefined);
    if (vals.length < 4) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  const getProgress = (student) => {
    let done = 0;
    const total = 6;
    VIRTUES.forEach(v => { if (student.sentenceSelections?.[v.key] !== null && student.sentenceSelections?.[v.key] !== undefined) done++; });
    if (student.openingIndex !== null && student.openingIndex !== undefined) done++;
    if (student.closingIndex !== null && student.closingIndex !== undefined) done++;
    return { done, total, pct: Math.round((done / total) * 100) };
  };

  const buildNarrative = (student) => {
    const overall = getOverallScore(student);
    if (!overall || student.openingIndex === null || student.openingIndex === undefined) return null;
    if (student.closingIndex === null || student.closingIndex === undefined) return null;
    for (const v of VIRTUES) {
      if (student.sentenceSelections?.[v.key] === null || student.sentenceSelections?.[v.key] === undefined) return null;
    }

    const displayName = student.name || '[Student]';
    const displayClass = config.className || '[Class]';
    const pr = student.pronoun || 'he';

    const opening = (getOpenings(overall, student.scores)[student.openingIndex] || '')
      .replace('[S]', displayName)
      .replace('[C]', displayClass);

    const virtueParts = VIRTUES.map(v => {
      const score = student.scores[v.key];
      const idx = student.sentenceSelections[v.key];
      return VIRTUE_SENTENCES[v.key]?.[score]?.[pr]?.[idx] || '';
    });

    const bridges = getBridgingSentences(student.scores, pr);

    const closingOptions = [...(CLOSINGS[overall]?.[pr] || []), ...(CLOSINGS[overall]?.n || [])];
    const closing = closingOptions[student.closingIndex] || '';

    return [opening, ...virtueParts, ...bridges, closing].filter(Boolean).join(' ');
  };

  const completedCount = students.filter(s => buildNarrative(s)).length;

  const copyAllNarratives = () => {
    const texts = students
      .map(s => {
        const n = buildNarrative(s);
        return n ? `${s.name}\n${n}${s.comment ? ' ' + s.comment : ''}` : null;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (texts) {
      navigator.clipboard.writeText(texts).then(() => {
        alert(`Copied ${completedCount} narrative(s) to clipboard!`);
      });
    }
  };

  if (classesLoading || narrativeLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>;
  }

  return (
    <div>
      {/* Setup */}
      <div className="setup-panel">
        <div className="setup-header" onClick={() => setShowSetup(!showSetup)}>
          <h3>Narrative Setup</h3>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {showSetup ? '▲ Hide' : '▼ Show'}
          </span>
        </div>
        {showSetup && (
          <div className="setup-body">
            <div className="setup-row">
              <input
                type="text"
                placeholder="Teacher Name"
                value={config.teacherName}
                onChange={e => updateConfig({ teacherName: e.target.value })}
              />
              <select
                value={config.quarter}
                onChange={e => updateConfig({ quarter: e.target.value })}
                style={{ maxWidth: 100 }}
              >
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                IMPORT FROM DAILY TRACKER
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {classes.map(c => (
                  <button
                    key={c.id}
                    className={`btn ${selectedClass === c.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => importFromClass(c.id)}
                  >
                    {c.name} ({c.students?.length || 0} students)
                  </button>
                ))}
                {classes.length === 0 && (
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                    No classes found. Add classes in the Daily Tracker first.
                  </span>
                )}
              </div>
              {selectedClass && students.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#16A34A', fontWeight: 500 }}>
                  ✓ Imported {students.length} students with quarterly averages from Daily Tracker
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 8
      }}>
        <span style={{ fontSize: 13, color: '#6B7280' }}>
          {completedCount}/{students.length} narratives complete
        </span>
        {completedCount > 0 && (
          <button className="btn btn-gold" onClick={copyAllNarratives}>
            📋 Copy All Narratives
          </button>
        )}
      </div>

      {/* Students */}
      {students.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          Select a class above to import students with their scores.
        </div>
      )}

      {students.map((student, idx) => {
        const isExpanded = expandedStudent === student.id;
        const overall = getOverallScore(student);
        const progress = getProgress(student);
        const narrative = buildNarrative(student);

        return (
          <div key={student.id} className="narrative-student">
            {/* Header */}
            <div
              className="narrative-student-header"
              onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 14 }}>
                  {student.name || `Student ${idx + 1}`}
                </span>
                {overall && (
                  <span className={`badge ${overall >= 4 ? 'badge-green' : overall >= 3 ? 'badge-gray' : 'badge-red'}`}>
                    {overall}/5
                  </span>
                )}
                {VIRTUES.map(v => (
                  <span key={v.key} style={{
                    fontSize: 11, color: v.color, fontWeight: 600,
                    background: v.bg, padding: '2px 6px', borderRadius: 4
                  }}>
                    {v.label.substring(0, 1)}:{student.scores?.[v.key] ?? '—'}
                  </span>
                ))}
                {narrative && <span style={{ color: '#16A34A', fontSize: 12 }}>✓</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="progress-bar" style={{ width: 60 }}>
                  <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Body */}
            {isExpanded && (
              <div className="narrative-student-body">
                {/* Score override */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                    QUARTERLY SCORES (auto-calculated — click to override)
                  </div>
                  {VIRTUES.map(v => (
                    <div key={v.key} className="virtue-row" style={{ marginBottom: 8 }}>
                      <span className="virtue-label" style={{ color: v.color, minWidth: 80 }}>
                        {v.label}
                      </span>
                      <div className="score-btns">
                        {[1, 2, 3, 4, 5].map(score => (
                          <button
                            key={score}
                            className={`score-btn s${score} ${student.scores?.[v.key] === score ? 'active' : ''}`}
                            onClick={() => updateStudent(student.id, {
                              scores: { ...student.scores, [v.key]: score },
                              sentenceSelections: { ...student.sentenceSelections, [v.key]: null }
                            })}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pronoun toggle */}
                <div style={{ marginBottom: 16 }}>
                  <select
                    value={student.pronoun}
                    onChange={e => updateStudent(student.id, { pronoun: e.target.value })}
                    style={{ maxWidth: 120 }}
                  >
                    <option value="he">Boy</option>
                    <option value="she">Girl</option>
                  </select>
                  <button
                    className="btn btn-sm btn-danger"
                    style={{ marginLeft: 8 }}
                    onClick={() => removeStudent(student.id)}
                  >
                    Remove
                  </button>
                </div>

                {/* Opening Sentence */}
                {overall && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                      OPENING SENTENCE
                    </div>
                    {getOpenings(overall, student.scores).map((sentence, i) => (
                      <button
                        key={i}
                        className={`sentence-option ${student.openingIndex === i ? 'selected' : ''}`}
                        onClick={() => updateStudent(student.id, { openingIndex: i })}
                      >
                        {sentence
                          .replace('[S]', student.name || '[Student]')
                          .replace('[C]', config.className || '[Class]')}
                      </button>
                    ))}
                  </div>
                )}

                {/* Virtue Sentences */}
                {overall && VIRTUES.map(v => {
                  const score = student.scores?.[v.key];
                  if (!score) return null;
                  const sentences = VIRTUE_SENTENCES[v.key]?.[score]?.[student.pronoun] || [];
                  if (sentences.length === 0) return null;
                  return (
                    <div key={v.key} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: v.color, marginBottom: 8 }}>
                        {v.label} ({score}/5)
                      </div>
                      {sentences.map((sentence, i) => (
                        <button
                          key={i}
                          className={`sentence-option ${student.sentenceSelections?.[v.key] === i ? 'selected' : ''}`}
                          onClick={() => updateStudent(student.id, {
                            sentenceSelections: { ...student.sentenceSelections, [v.key]: i }
                          })}
                        >
                          {sentence}
                        </button>
                      ))}
                    </div>
                  );
                })}

                {/* Closing Sentence */}
                {overall && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                      CLOSING SENTENCE
                    </div>
                    {[
                      ...(CLOSINGS[overall]?.[student.pronoun] || []),
                      ...(CLOSINGS[overall]?.n || [])
                    ].map((sentence, i) => (
                      <button
                        key={i}
                        className={`sentence-option ${student.closingIndex === i ? 'selected' : ''}`}
                        onClick={() => updateStudent(student.id, { closingIndex: i })}
                      >
                        {sentence}
                      </button>
                    ))}
                  </div>
                )}

                {/* Bridging Notice */}
                {overall && (() => {
                  const bridges = getBridgingSentences(student.scores, student.pronoun);
                  if (bridges.length === 0) return null;
                  return (
                    <div style={{
                      background: '#FFFBEB', border: '1px solid #FDE68A',
                      borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: '#92400E' }}>
                        ⚡ Bridging sentence auto-added (score gap detected)
                      </div>
                      {bridges.map((b, i) => (
                        <div key={i} style={{ fontStyle: 'italic', color: '#78350F', lineHeight: 1.5 }}>
                          "{b}"
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Comment */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                    ADDITIONAL COMMENT (optional)
                  </div>
                  <textarea
                    value={student.comment || ''}
                    onChange={e => updateStudent(student.id, { comment: e.target.value })}
                    placeholder="Add a personal note that will appear at the end..."
                    style={{
                      width: '100%', minHeight: 60, padding: 10, borderRadius: 6,
                      border: '1px solid #D1D5DB', fontFamily: 'inherit', fontSize: 13,
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Preview */}
                {narrative && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                      NARRATIVE PREVIEW
                    </div>
                    <div className="narrative-preview">
                      {narrative}
                      {student.comment && <span> {student.comment}</span>}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        const text = narrative + (student.comment ? ' ' + student.comment : '');
                        navigator.clipboard.writeText(text);
                      }}
                    >
                      📋 Copy This Narrative
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
