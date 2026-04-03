import React, { useState, useCallback, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useTeacherData, useNarrativeData } from '../hooks/useFirestore';
import {
  VIRTUES, VIRTUE_SENTENCES, OPENINGS, CLOSINGS,
  getBridgingSentences, getOpenings, autoGenerateNarrative
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

  // Get best narrative: manual if complete, auto-generated as fallback
  const getNarrative = (student) => {
    const manual = buildNarrative(student);
    if (manual) return { text: manual, type: 'manual' };
    const auto = autoGenerateNarrative(student.name, config.className, student.pronoun, student.scores);
    if (auto) return { text: auto, type: 'auto' };
    return null;
  };

  const completedCount = students.filter(s => buildNarrative(s)).length;
  const autoCount = students.filter(s => !buildNarrative(s) && autoGenerateNarrative(s.name, config.className, s.pronoun, s.scores)).length;
  const totalWithNarrative = completedCount + autoCount;

  const copyAllNarratives = () => {
    const texts = students
      .map(s => {
        const n = getNarrative(s);
        if (!n) return null;
        const comment = s.comment ? ' ' + s.comment : '';
        const label = n.type === 'auto' ? ' [Auto-generated]' : '';
        return `${s.name}${label}\n${n.text}${comment}`;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (texts) {
      navigator.clipboard.writeText(texts).then(() => {
        alert(`Copied ${totalWithNarrative} narrative(s) to clipboard!`);
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
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {completedCount} customized{autoCount > 0 && <span> · {autoCount} auto-generated</span>} · {students.length - totalWithNarrative} pending
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {totalWithNarrative > 0 && (
            <button className="btn btn-gold" onClick={copyAllNarratives}>
              📋 Copy All ({totalWithNarrative})
            </button>
          )}
        </div>
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
        const narrativeInfo = getNarrative(student);

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
                {narrative && <span style={{ color: '#16A34A', fontSize: 12 }}>✓ Customized</span>}
                {!narrative && narrativeInfo?.type === 'auto' && <span style={{ color: '#0284C7', fontSize: 12 }}>⚡ Auto</span>}
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

                {/* Preview — manual or auto-generated */}
                {narrativeInfo && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                      {narrativeInfo.type === 'manual' ? 'NARRATIVE PREVIEW' : 'AUTO-GENERATED NARRATIVE'}
                      {narrativeInfo.type === 'auto' && (
                        <span style={{ fontWeight: 400, fontStyle: 'italic', marginLeft: 8, color: '#0284C7' }}>
                          Customize by selecting sentences above
                        </span>
                      )}
                    </div>
                    <div className="narrative-preview" style={{
                      borderLeft: narrativeInfo.type === 'auto' ? '3px solid #0284C7' : undefined,
                    }}>
                      {narrativeInfo.text}
                      {student.comment && <span> {student.comment}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const text = narrativeInfo.text + (student.comment ? ' ' + student.comment : '');
                          navigator.clipboard.writeText(text);
                        }}
                      >
                        📋 Copy
                      </button>
                      <button
                        className="btn btn-gold btn-sm"
                        onClick={async () => {
                          // Fetch merits/demerits for this student
                          let hpRows = '';
                          try {
                            const snap = await getDocs(collection(db, 'housePointEntries'));
                            const entries = snap.docs.map(d => d.data())
                              .filter(e => e.studentName?.toLowerCase() === student.name.toLowerCase())
                              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                            if (entries.length > 0) {
                              const merits = entries.filter(e => e.type === 'merit' || (!e.type && e.points > 0));
                              const demerits = entries.filter(e => e.type === 'demerit' || (!e.type && e.points < 0));
                              const totalHP = entries.reduce((s, e) => s + (e.points || 0), 0);
                              hpRows = `
                                <h2>House Points (${totalHP})</h2>
                                <div style="display:flex;gap:12px;margin-bottom:12px;">
                                  <div style="flex:1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px;text-align:center;">
                                    <div style="font-size:20px;font-weight:700;color:#16A34A">${merits.length}</div>
                                    <div style="font-size:10px;color:#6B7280">Merits</div>
                                  </div>
                                  <div style="flex:1;background:${demerits.length > 0 ? '#FEF2F2' : '#F9FAFB'};border:1px solid ${demerits.length > 0 ? '#FECACA' : '#E5E7EB'};border-radius:6px;padding:8px;text-align:center;">
                                    <div style="font-size:20px;font-weight:700;color:${demerits.length > 0 ? '#DC2626' : '#6B7280'}">${demerits.length}</div>
                                    <div style="font-size:10px;color:#6B7280">Demerits</div>
                                  </div>
                                </div>
                                ${entries.length > 0 ? `<table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Points</th><th>Reason</th></tr></thead><tbody>${entries.map(e => {
                                  const isMerit = e.type === 'merit' || (!e.type && e.points > 0);
                                  return `<tr><td>${e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td><td style="color:${isMerit ? '#16A34A' : '#DC2626'};font-weight:600">${isMerit ? 'Merit' : 'Demerit'}</td><td>${e.category || '—'}</td><td style="font-weight:600;color:${isMerit ? '#16A34A' : '#DC2626'}">${e.points > 0 ? '+' : ''}${e.points}</td><td>${e.reason || ''}</td></tr>`;
                                }).join('')}</tbody></table>` : ''}
                              `;
                            }
                          } catch (err) { /* no house points */ }

                          const narrativeText = narrativeInfo.text + (student.comment ? ' ' + student.comment : '');
                          const master = (masterStudents || []).find(ms => ms.name.toLowerCase() === student.name.toLowerCase());
                          const w = window.open('', '_blank');
                          w.document.write(`<!DOCTYPE html><html><head><title>Narrative — ${student.name}</title>
                            <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
                            <style>
                              body{font-family:'DM Sans',sans-serif;color:#1F2937;padding:0;margin:0}
                              .letterhead{background:linear-gradient(135deg,#1B3A5C 0%,#0F2440 100%);color:#fff;padding:24px 40px;display:flex;align-items:center;justify-content:space-between}
                              .letterhead img{height:50px}
                              .letterhead .school-info{text-align:right}
                              .letterhead .school-name{font-family:'Libre Baskerville',serif;font-size:14px;font-weight:700;color:#C9A227}
                              .letterhead .school-detail{font-size:10px;opacity:0.7;margin-top:2px}
                              .body{padding:24px 40px 40px;max-width:800px}
                              h1{font-family:'Libre Baskerville',serif;color:#1B3A5C;font-size:22px;margin:0 0 2px}
                              h2{font-family:'Libre Baskerville',serif;color:#1B3A5C;font-size:14px;margin-top:24px;margin-bottom:8px;border-bottom:2px solid #1B3A5C;padding-bottom:4px}
                              .subtitle{font-size:13px;color:#6B7280;margin-bottom:20px}
                              .narrative{background:#FAF8F2;border-left:3px solid #C9A227;padding:16px;margin-bottom:16px;font-family:'Libre Baskerville',serif;font-size:13px;line-height:1.9;color:#374151}
                              table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
                              th{text-align:left;padding:6px 8px;background:#F3F4F6;border-bottom:2px solid #D1D5DB;font-size:10px;text-transform:uppercase;color:#6B7280}
                              td{padding:6px 8px;border-bottom:1px solid #E5E7EB}
                              .footer{margin-top:32px;padding-top:12px;border-top:1px solid #E5E7EB;font-size:10px;color:#9CA3AF;text-align:center}
                              @media print{.letterhead{-webkit-print-color-adjust:exact;print-color-adjust:exact}.narrative{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
                            </style></head><body>
                            <div class="letterhead">
                              <img src="https://static.wixstatic.com/media/f61363_bf5fe629d9c14c2380f88ea0a522389f~mv2.png/v1/fill/w_666,h_158,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Copy%20of%20CSN_CAFM_AltLogo_FULL.png" alt="CAFM" />
                              <div class="school-info">
                                <div class="school-name">Chesterton Academy of the Florida Martyrs</div>
                                <div class="school-detail">A Classical Catholic High School · Pensacola, Florida</div>
                              </div>
                            </div>
                            <div class="body">
                              <h1>${student.name}</h1>
                              <div class="subtitle">${config.className || 'Class'} · Participation Narrative · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                              <h2>Participation Narrative</h2>
                              <div class="narrative">${narrativeText}</div>
                              <h2>Scores</h2>
                              <table><thead><tr>${VIRTUES.map(v => `<th style="color:${v.color}">${v.label}</th>`).join('')}<th>Average</th><th>Grade</th></tr></thead>
                              <tbody><tr>${VIRTUES.map(v => `<td style="font-weight:600">${student.scores[v.key] || '—'}</td>`).join('')}<td style="font-weight:600">${student.scores ? (VIRTUES.reduce((s,v) => s + (student.scores[v.key]||0), 0) / VIRTUES.length).toFixed(1) : '—'}</td><td>${student.scores ? Math.round((VIRTUES.reduce((s,v) => s + (student.scores[v.key]||0), 0) / VIRTUES.length / 5) * 100) + '%' : '—'}</td></tr></tbody></table>
                              ${hpRows}
                              <div class="footer">Chesterton Academy of the Florida Martyrs · Family Life Center, St. Anne Catholic Church · Pensacola, FL<br/>Report generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                            </div></body></html>`);
                          w.document.close();
                          setTimeout(() => w.print(), 500);
                        }}
                      >
                        🖨 Print / PDF
                      </button>
                    </div>
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
