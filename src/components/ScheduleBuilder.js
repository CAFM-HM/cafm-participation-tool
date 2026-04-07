import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSchedule } from '../hooks/useFirestore';

// ============================================================
// HELPERS
// ============================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function computePeriods(schoolDay) {
  const { startTime, endTime, periodMinutes, passingMinutes, lunchAfterPeriod, lunchMinutes } = schoolDay;
  const start = timeToMin(startTime);
  const end = timeToMin(endTime);
  const periods = [];
  let cursor = start;
  let periodNum = 1;

  while (cursor + periodMinutes <= end) {
    periods.push({
      index: periods.length,
      num: periodNum,
      type: 'class',
      start: minToTime(cursor),
      end: minToTime(cursor + periodMinutes),
      label: `Period ${periodNum}`,
    });
    cursor += periodMinutes;
    periodNum++;

    // Insert lunch after the specified period
    if (periods.filter(p => p.type === 'class').length === lunchAfterPeriod && !periods.some(p => p.type === 'lunch')) {
      periods.push({
        index: periods.length,
        num: null,
        type: 'lunch',
        start: minToTime(cursor),
        end: minToTime(cursor + lunchMinutes),
        label: 'Lunch',
      });
      cursor += lunchMinutes;
    }

    // Add passing time (but not after last possible period)
    if (cursor + passingMinutes + periodMinutes <= end) {
      cursor += passingMinutes;
    } else if (cursor < end) {
      cursor += passingMinutes;
    }
  }

  return periods;
}

// Check if a teacher is available during a specific period
function isTeacherAvailable(teacher, periodIndex, periods) {
  if (!teacher.unavailable || teacher.unavailable.length === 0) return true;
  const period = periods[periodIndex];
  if (!period) return true;

  for (const block of teacher.unavailable) {
    if (block.type === 'period' && block.periodIndex === periodIndex) return false;
    if (block.type === 'timeRange') {
      const pStart = timeToMin(period.start);
      const pEnd = timeToMin(period.end);
      const bStart = timeToMin(block.startTime);
      const bEnd = timeToMin(block.endTime);
      if (pStart < bEnd && pEnd > bStart) return false;
    }
    if (block.type === 'days') {
      // PT teachers: if period is outside their available range, unavailable
      // This is checked separately in the grid
    }
  }
  return true;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ScheduleBuilder({ isAdmin }) {
  const { config, published, loading, saveConfig, publish } = useSchedule();
  const [local, setLocal] = useState(null);
  const [tab, setTab] = useState('grid'); // 'settings' | 'teachers' | 'classes' | 'grid' | 'preview'
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config && !local) setLocal(JSON.parse(JSON.stringify(config)));
  }, [config, local]);

  const update = useCallback((fn) => {
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!local) return;
    await saveConfig(local);
    setDirty(false);
  };

  const handlePublish = async () => {
    if (!local) return;
    if (!window.confirm('Publish this schedule? Teachers will see it on their Home tab.')) return;
    await saveConfig(local);
    await publish(local);
    setDirty(false);
  };

  const periods = useMemo(() => local ? computePeriods(local.schoolDay) : [], [local]);

  // ============================================================
  // CONFLICT DETECTION
  // ============================================================
  const conflicts = useMemo(() => {
    if (!local) return {};
    const issues = {}; // key = periodIndex, value = array of strings
    const grid = local.grid || {};
    const classPeriods = {}; // periodIndex -> array of { classId, roomId }

    // Build what's scheduled where
    Object.entries(grid).forEach(([key, assignments]) => {
      const pIdx = parseInt(key);
      if (!classPeriods[pIdx]) classPeriods[pIdx] = [];
      (Array.isArray(assignments) ? assignments : [assignments]).forEach(a => {
        if (a && a.classId) classPeriods[pIdx].push(a);
      });
    });

    // Check each period
    Object.entries(classPeriods).forEach(([pIdxStr, assignments]) => {
      const pIdx = parseInt(pIdxStr);
      const periodIssues = [];

      // Teacher conflicts
      const teacherSlots = {};
      // Room conflicts
      const roomSlots = {};
      // Student group conflicts
      const groupSlots = {};

      assignments.forEach(a => {
        const cls = (local.classes || []).find(c => c.id === a.classId);
        if (!cls) return;

        // Teacher double-booked
        if (cls.teacherId) {
          if (teacherSlots[cls.teacherId]) {
            const otherCls = (local.classes || []).find(c => c.id === teacherSlots[cls.teacherId]);
            const teacher = (local.teachers || []).find(t => t.id === cls.teacherId);
            periodIssues.push(`${teacher?.name || 'Teacher'} is double-booked (${cls.name} & ${otherCls?.name})`);
          }
          teacherSlots[cls.teacherId] = a.classId;
        }

        // Teacher availability
        if (cls.teacherId) {
          const teacher = (local.teachers || []).find(t => t.id === cls.teacherId);
          if (teacher && !isTeacherAvailable(teacher, pIdx, periods)) {
            periodIssues.push(`${teacher.name} is unavailable during this period`);
          }
        }

        // Room double-booked
        if (a.roomId) {
          if (roomSlots[a.roomId]) {
            const otherCls = (local.classes || []).find(c => c.id === roomSlots[a.roomId]);
            const room = (local.rooms || []).find(r => r.id === a.roomId);
            periodIssues.push(`${room?.name || 'Room'} is double-booked (${cls.name} & ${otherCls?.name})`);
          }
          roomSlots[a.roomId] = a.classId;
        }

        // Student group conflicts
        (cls.groupIds || []).forEach(gId => {
          if (groupSlots[gId]) {
            const otherCls = (local.classes || []).find(c => c.id === groupSlots[gId]);
            const group = (local.studentGroups || []).find(g => g.id === gId);
            periodIssues.push(`${group?.name || 'Students'} double-booked (${cls.name} & ${otherCls?.name})`);
          }
          groupSlots[gId] = a.classId;
        });
      });

      if (periodIssues.length > 0) issues[pIdx] = periodIssues;
    });

    // Check planning periods for FT teachers
    const ftTeachers = (local.teachers || []).filter(t => t.type === 'ft');
    const classPeriodIndices = periods.filter(p => p.type === 'class').map(p => p.index);

    ftTeachers.forEach(teacher => {
      let teachingPeriods = 0;
      classPeriodIndices.forEach(pIdx => {
        const assignments = Array.isArray(grid[pIdx]) ? grid[pIdx] : (grid[pIdx] ? [grid[pIdx]] : []);
        const isTeaching = assignments.some(a => {
          const cls = (local.classes || []).find(c => c.id === a.classId);
          return cls?.teacherId === teacher.id;
        });
        if (isTeaching) teachingPeriods++;
      });
      const planningPeriods = classPeriodIndices.length - teachingPeriods;
      if (planningPeriods < 2) {
        // Add a general warning (not period-specific)
        if (!issues['general']) issues['general'] = [];
        issues['general'].push(`${teacher.name} has only ${planningPeriods} planning period${planningPeriods !== 1 ? 's' : ''} (minimum 2)`);
      }
    });

    return issues;
  }, [local, periods]);

  if (loading || !local) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading schedule...</div>;
  }

  // ============================================================
  // TEACHER VIEW (non-admin) — show published schedule
  // ============================================================
  if (!isAdmin) {
    if (!published) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          No schedule has been published yet.
        </div>
      );
    }
    return <SchedulePreview config={published} />;
  }

  // ============================================================
  // ADMIN VIEW
  // ============================================================
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Schedule Builder</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved changes</span>}
          <button className="btn btn-secondary" onClick={handleSave} disabled={!dirty}>Save Draft</button>
          <button className="btn btn-secondary" onClick={() => setTab('preview')}>Preview</button>
          <button className="btn btn-gold" onClick={handlePublish}>Publish</button>
        </div>
      </div>

      {/* General warnings */}
      {conflicts.general && conflicts.general.length > 0 && (
        <div className="schedule-warnings">
          {conflicts.general.map((w, i) => <div key={i} className="schedule-warning-item">{w}</div>)}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'grid', label: 'Schedule Grid' },
          { id: 'classes', label: 'Classes' },
          { id: 'teachers', label: 'Teachers' },
          { id: 'settings', label: 'School Day' },
          { id: 'preview', label: 'Preview' },
        ].map(t => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'settings' && <SettingsPanel config={local} update={update} periods={periods} />}
      {tab === 'teachers' && <TeachersPanel config={local} update={update} periods={periods} />}
      {tab === 'classes' && <ClassesPanel config={local} update={update} />}
      {tab === 'grid' && <GridPanel config={local} update={update} periods={periods} conflicts={conflicts} />}
      {tab === 'preview' && <SchedulePreview config={local} />}
    </div>
  );
}

// ============================================================
// SETTINGS PANEL — school day config
// ============================================================
function SettingsPanel({ config, update, periods }) {
  const sd = config.schoolDay;

  const updateSD = (field, value) => {
    update(c => { c.schoolDay[field] = value; });
  };

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>School Day Settings</h3>

      <div className="sched-form-grid">
        <div className="sched-field">
          <label>Start Time</label>
          <input type="time" value={sd.startTime} onChange={e => updateSD('startTime', e.target.value)} />
        </div>
        <div className="sched-field">
          <label>End Time</label>
          <input type="time" value={sd.endTime} onChange={e => updateSD('endTime', e.target.value)} />
        </div>
        <div className="sched-field">
          <label>Period Length (min)</label>
          <input type="number" value={sd.periodMinutes} min={20} max={90}
            onChange={e => updateSD('periodMinutes', parseInt(e.target.value) || 45)} />
        </div>
        <div className="sched-field">
          <label>Passing Period (min)</label>
          <input type="number" value={sd.passingMinutes} min={0} max={15}
            onChange={e => updateSD('passingMinutes', parseInt(e.target.value) || 5)} />
        </div>
        <div className="sched-field">
          <label>Lunch After Period #</label>
          <input type="number" value={sd.lunchAfterPeriod} min={1} max={10}
            onChange={e => updateSD('lunchAfterPeriod', parseInt(e.target.value) || 4)} />
        </div>
        <div className="sched-field">
          <label>Lunch Length (min)</label>
          <input type="number" value={sd.lunchMinutes} min={15} max={60}
            onChange={e => updateSD('lunchMinutes', parseInt(e.target.value) || 30)} />
        </div>
      </div>

      {/* Period preview */}
      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Generated Periods ({periods.length})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>#</th><th>Type</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.index}>
                <td>{p.type === 'lunch' ? '—' : p.num}</td>
                <td><span className={`badge ${p.type === 'lunch' ? 'badge-gray' : 'badge-green'}`}>{p.label}</span></td>
                <td>{formatTime(p.start)}</td>
                <td>{formatTime(p.end)}</td>
                <td>{timeToMin(p.end) - timeToMin(p.start)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rooms */}
      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Rooms</h3>
      {(config.rooms || []).map((room, i) => (
        <div key={room.id} className="sched-inline-row">
          <input type="text" value={room.name} placeholder="Room name"
            onChange={e => update(c => { c.rooms[i].name = e.target.value; })} style={{ width: 120 }} />
          <input type="number" value={room.capacity} placeholder="Cap" min={1}
            onChange={e => update(c => { c.rooms[i].capacity = parseInt(e.target.value) || 10; })} style={{ width: 70 }} />
          <input type="text" value={room.notes} placeholder="Notes"
            onChange={e => update(c => { c.rooms[i].notes = e.target.value; })} style={{ flex: 1 }} />
          <button className="remove-btn" onClick={() => update(c => { c.rooms.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
        onClick={() => update(c => { c.rooms.push({ id: genId(), name: `Room ${c.rooms.length + 1}`, capacity: 25, notes: '' }); })}>
        + Add Room
      </button>

      {/* Student Groups */}
      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Student Groups</h3>
      {(config.studentGroups || []).map((g, i) => (
        <div key={g.id} className="sched-inline-row">
          <input type="text" value={g.name} placeholder="Group name"
            onChange={e => update(c => { c.studentGroups[i].name = e.target.value; })} style={{ width: 160 }} />
          <input type="color" value={g.color} onChange={e => update(c => { c.studentGroups[i].color = e.target.value; })} style={{ width: 40, height: 32, padding: 2 }} />
          <button className="remove-btn" onClick={() => update(c => { c.studentGroups.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
        onClick={() => update(c => { c.studentGroups.push({ id: genId(), name: '', color: '#6B7280' }); })}>
        + Add Group
      </button>
    </div>
  );
}

// ============================================================
// TEACHERS PANEL
// ============================================================
function TeachersPanel({ config, update, periods }) {
  const [expandedId, setExpandedId] = useState(null);
  const [newName, setNewName] = useState('');

  const addTeacher = () => {
    if (!newName.trim()) return;
    update(c => {
      c.teachers.push({
        id: genId(), name: newName.trim(), type: 'ft', defaultRoom: '',
        unavailable: [], // array of { type: 'period'|'timeRange', periodIndex?, startTime?, endTime?, note? }
      });
    });
    setNewName('');
  };

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Teachers</h3>

      {/* Add teacher */}
      <div className="sched-inline-row" style={{ marginBottom: 16 }}>
        <input type="text" value={newName} placeholder="Teacher name"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTeacher()} style={{ width: 200 }} />
        <button className="btn btn-primary btn-sm" onClick={addTeacher}>+ Add Teacher</button>
      </div>

      {(config.teachers || []).map((teacher, tIdx) => (
        <div key={teacher.id} className="sched-teacher-card">
          <div className="sched-teacher-header" onClick={() => setExpandedId(expandedId === teacher.id ? null : teacher.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#1B3A5C' }}>{teacher.name}</span>
              <span className={`badge ${teacher.type === 'ft' ? 'badge-green' : 'badge-gray'}`}>
                {teacher.type === 'ft' ? 'Full-Time' : 'Part-Time'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                {(teacher.unavailable || []).length} restriction{(teacher.unavailable || []).length !== 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{expandedId === teacher.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {expandedId === teacher.id && (
            <div className="sched-teacher-body">
              <div className="sched-inline-row">
                <div className="sched-field" style={{ flex: 0 }}>
                  <label>Type</label>
                  <select value={teacher.type} onChange={e => update(c => { c.teachers[tIdx].type = e.target.value; })}>
                    <option value="ft">Full-Time</option>
                    <option value="pt">Part-Time</option>
                  </select>
                </div>
                <div className="sched-field" style={{ flex: 0 }}>
                  <label>Default Room</label>
                  <select value={teacher.defaultRoom || ''} onChange={e => update(c => { c.teachers[tIdx].defaultRoom = e.target.value; })}>
                    <option value="">—</option>
                    {(config.rooms || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <button className="btn btn-sm" style={{ color: '#DC2626', background: 'none' }}
                    onClick={() => { if (window.confirm(`Remove ${teacher.name}?`)) update(c => { c.teachers.splice(tIdx, 1); }); }}>
                    Remove Teacher
                  </button>
                </div>
              </div>

              {/* Unavailability blocks */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>UNAVAILABLE TIMES</div>
                {(teacher.unavailable || []).map((block, bIdx) => (
                  <div key={bIdx} className="sched-inline-row" style={{ background: '#FEF2F2', padding: '6px 10px', borderRadius: 6, marginBottom: 4 }}>
                    {block.type === 'period' ? (
                      <span style={{ fontSize: 13 }}>Period {periods[block.periodIndex]?.num || block.periodIndex + 1} ({formatTime(periods[block.periodIndex]?.start || '00:00')})</span>
                    ) : (
                      <span style={{ fontSize: 13 }}>{formatTime(block.startTime)} – {formatTime(block.endTime)}</span>
                    )}
                    {block.note && <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>({block.note})</span>}
                    <button className="remove-btn" onClick={() => update(c => { c.teachers[tIdx].unavailable.splice(bIdx, 1); })}>×</button>
                  </div>
                ))}

                {/* Add unavailability */}
                <AddUnavailability periods={periods} onAdd={(block) => update(c => { c.teachers[tIdx].unavailable.push(block); })} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddUnavailability({ periods, onAdd }) {
  const [mode, setMode] = useState('period'); // 'period' | 'timeRange'
  const [periodIdx, setPeriodIdx] = useState(0);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [note, setNote] = useState('');

  const handleAdd = () => {
    if (mode === 'period') {
      onAdd({ type: 'period', periodIndex: periodIdx, note });
    } else {
      onAdd({ type: 'timeRange', startTime, endTime, note });
    }
    setNote('');
  };

  const classPeriods = periods.filter(p => p.type === 'class');

  return (
    <div className="sched-inline-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
      <select value={mode} onChange={e => setMode(e.target.value)} style={{ width: 130 }}>
        <option value="period">Specific Period</option>
        <option value="timeRange">Time Range</option>
      </select>
      {mode === 'period' ? (
        <select value={periodIdx} onChange={e => setPeriodIdx(parseInt(e.target.value))} style={{ width: 180 }}>
          {classPeriods.map(p => (
            <option key={p.index} value={p.index}>Period {p.num} ({formatTime(p.start)})</option>
          ))}
        </select>
      ) : (
        <>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: 120 }} />
          <span style={{ color: '#9CA3AF' }}>to</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: 120 }} />
        </>
      )}
      <input type="text" value={note} placeholder="Note (optional)" onChange={e => setNote(e.target.value)} style={{ width: 160 }} />
      <button className="btn btn-sm btn-secondary" onClick={handleAdd}>+ Add</button>
    </div>
  );
}

// ============================================================
// CLASSES PANEL
// ============================================================
function ClassesPanel({ config, update }) {
  const [newClass, setNewClass] = useState({ name: '', teacherId: '', groupIds: [], periodsPerWeek: 5 });

  const addClass = () => {
    if (!newClass.name.trim()) return;
    update(c => {
      c.classes.push({ id: genId(), ...newClass, name: newClass.name.trim() });
    });
    setNewClass({ name: '', teacherId: '', groupIds: [], periodsPerWeek: 5 });
  };

  const toggleGroup = (groupId) => {
    setNewClass(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter(g => g !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Classes</h3>

      {/* Add class form */}
      <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>ADD NEW CLASS</div>
        <div className="sched-inline-row">
          <input type="text" value={newClass.name} placeholder="Class name (e.g. Theology I)"
            onChange={e => setNewClass({ ...newClass, name: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addClass()} style={{ width: 200 }} />
          <select value={newClass.teacherId} onChange={e => setNewClass({ ...newClass, teacherId: e.target.value })} style={{ width: 180 }}>
            <option value="">— Teacher —</option>
            {(config.teachers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Per week</label>
            <input type="number" value={newClass.periodsPerWeek} min={1} max={10}
              onChange={e => setNewClass({ ...newClass, periodsPerWeek: parseInt(e.target.value) || 5 })} style={{ width: 60 }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Student groups:</span>
          {(config.studentGroups || []).map(g => (
            <button key={g.id}
              className={`btn btn-sm ${newClass.groupIds.includes(g.id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleGroup(g.id)}
              style={newClass.groupIds.includes(g.id) ? { background: g.color } : {}}>
              {g.name}
            </button>
          ))}
          <button className="btn btn-sm btn-gold" onClick={addClass} style={{ marginLeft: 'auto' }}>+ Add Class</button>
        </div>
      </div>

      {/* Class list */}
      {(config.classes || []).length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No classes added yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Class</th><th>Teacher</th><th>Student Groups</th><th>Per Week</th><th></th></tr></thead>
            <tbody>
              {(config.classes || []).map((cls, cIdx) => {
                const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
                return (
                  <tr key={cls.id}>
                    <td style={{ fontWeight: 500 }}>{cls.name}</td>
                    <td>{teacher?.name || <span style={{ color: '#DC2626' }}>Unassigned</span>}</td>
                    <td>
                      {(cls.groupIds || []).map(gId => {
                        const g = (config.studentGroups || []).find(sg => sg.id === gId);
                        return g ? <span key={gId} className="badge" style={{ background: g.color + '22', color: g.color, marginRight: 4 }}>{g.name}</span> : null;
                      })}
                    </td>
                    <td>{cls.periodsPerWeek || 5}x</td>
                    <td>
                      <button className="remove-btn" onClick={() => {
                        if (window.confirm(`Remove ${cls.name}?`)) update(c => { c.classes.splice(cIdx, 1); });
                      }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GRID PANEL — the main schedule builder
// ============================================================
function GridPanel({ config, update, periods, conflicts }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const classPeriods = periods.filter(p => p.type === 'class');
  const grid = config.grid || {};

  // Get assignments for a period
  const getAssignments = (pIdx) => {
    const val = grid[pIdx];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  // Add a class to a period
  const addToPeriod = (pIdx, classId, roomId) => {
    update(c => {
      if (!c.grid) c.grid = {};
      const existing = c.grid[pIdx] ? (Array.isArray(c.grid[pIdx]) ? c.grid[pIdx] : [c.grid[pIdx]]) : [];
      existing.push({ classId, roomId });
      c.grid[pIdx] = existing;
    });
    setSelectedPeriod(null);
  };

  // Remove a class from a period
  const removeFromPeriod = (pIdx, classId) => {
    update(c => {
      if (!c.grid || !c.grid[pIdx]) return;
      const arr = Array.isArray(c.grid[pIdx]) ? c.grid[pIdx] : [c.grid[pIdx]];
      c.grid[pIdx] = arr.filter(a => a.classId !== classId);
      if (c.grid[pIdx].length === 0) delete c.grid[pIdx];
    });
  };

  // Classes not yet scheduled (or scheduled fewer than periodsPerWeek times)
  const classScheduleCounts = {};
  Object.values(grid).forEach(val => {
    const arr = Array.isArray(val) ? val : [val];
    arr.forEach(a => {
      if (a?.classId) classScheduleCounts[a.classId] = (classScheduleCounts[a.classId] || 0) + 1;
    });
  });

  const unscheduledClasses = (config.classes || []).filter(cls => {
    const count = classScheduleCounts[cls.id] || 0;
    return count < (cls.periodsPerWeek || 5);
  });

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Schedule Grid</h3>

      {/* Unscheduled classes summary */}
      {unscheduledClasses.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#92400E' }}>Needs scheduling:</span>{' '}
          {unscheduledClasses.map(cls => {
            const count = classScheduleCounts[cls.id] || 0;
            return <span key={cls.id} className="badge" style={{ marginLeft: 6, background: '#FDE68A', color: '#92400E' }}>
              {cls.name} ({count}/{cls.periodsPerWeek || 5})
            </span>;
          })}
        </div>
      )}

      {/* Grid */}
      <div className="schedule-grid-container">
        {periods.map(period => {
          const pIdx = period.index;
          const assignments = getAssignments(pIdx);
          const periodConflicts = conflicts[pIdx] || [];
          const isLunch = period.type === 'lunch';

          return (
            <div key={pIdx} className={`schedule-grid-row ${isLunch ? 'lunch' : ''} ${periodConflicts.length > 0 ? 'has-conflict' : ''}`}>
              {/* Time column */}
              <div className="schedule-grid-time">
                <div className="schedule-grid-period-label">{period.label}</div>
                <div className="schedule-grid-time-range">{formatTime(period.start)} – {formatTime(period.end)}</div>
              </div>

              {/* Content column */}
              <div className="schedule-grid-content">
                {isLunch ? (
                  <div className="schedule-lunch-label">Lunch</div>
                ) : (
                  <>
                    {/* Assigned classes */}
                    {assignments.map(a => {
                      const cls = (config.classes || []).find(c => c.id === a.classId);
                      const room = (config.rooms || []).find(r => r.id === a.roomId);
                      const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
                      const groups = cls ? (cls.groupIds || []).map(gId => (config.studentGroups || []).find(g => g.id === gId)).filter(Boolean) : [];
                      if (!cls) return null;
                      return (
                        <div key={a.classId} className="schedule-grid-class">
                          <div className="schedule-grid-class-info">
                            <span className="schedule-grid-class-name">{cls.name}</span>
                            <span className="schedule-grid-class-detail">
                              {teacher?.name || 'No teacher'} · {room?.name || 'No room'}
                            </span>
                            <div>
                              {groups.map(g => (
                                <span key={g.id} className="badge" style={{ background: g.color + '22', color: g.color, fontSize: 10, marginRight: 3 }}>{g.name}</span>
                              ))}
                            </div>
                          </div>
                          <button className="remove-btn" onClick={() => removeFromPeriod(pIdx, a.classId)}>×</button>
                        </div>
                      );
                    })}

                    {/* Add button */}
                    {selectedPeriod === pIdx ? (
                      <PeriodClassPicker
                        config={config}
                        periodIndex={pIdx}
                        periods={periods}
                        onAdd={(classId, roomId) => addToPeriod(pIdx, classId, roomId)}
                        onCancel={() => setSelectedPeriod(null)}
                      />
                    ) : (
                      <button className="schedule-add-btn" onClick={() => setSelectedPeriod(pIdx)}>
                        + Add Class
                      </button>
                    )}

                    {/* Conflicts */}
                    {periodConflicts.length > 0 && (
                      <div className="schedule-conflict-list">
                        {periodConflicts.map((c, i) => (
                          <div key={i} className="schedule-conflict-item">{c}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// PERIOD CLASS PICKER — inline picker when adding a class to a period
// ============================================================
function PeriodClassPicker({ config, periodIndex, periods, onAdd, onCancel }) {
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');

  // When class is selected, auto-fill room from teacher default
  const handleClassChange = (cId) => {
    setClassId(cId);
    const cls = (config.classes || []).find(c => c.id === cId);
    if (cls?.teacherId) {
      const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
      if (teacher?.defaultRoom) setRoomId(teacher.defaultRoom);
    }
  };

  return (
    <div className="sched-inline-row" style={{ background: '#EFF6FF', padding: 8, borderRadius: 6, marginTop: 4 }}>
      <select value={classId} onChange={e => handleClassChange(e.target.value)} style={{ flex: 1 }}>
        <option value="">— Select class —</option>
        {(config.classes || []).map(cls => {
          const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
          const available = teacher ? isTeacherAvailable(teacher, periodIndex, periods) : true;
          return (
            <option key={cls.id} value={cls.id} style={!available ? { color: '#DC2626' } : {}}>
              {cls.name} ({teacher?.name || 'No teacher'}){!available ? ' ⚠ UNAVAILABLE' : ''}
            </option>
          );
        })}
      </select>
      <select value={roomId} onChange={e => setRoomId(e.target.value)} style={{ width: 130 }}>
        <option value="">— Room —</option>
        {(config.rooms || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <button className="btn btn-sm btn-primary" onClick={() => classId && onAdd(classId, roomId)} disabled={!classId}>Add</button>
      <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ============================================================
// SCHEDULE PREVIEW — clean read-only view
// ============================================================
function SchedulePreview({ config }) {
  const periods = useMemo(() => computePeriods(config.schoolDay), [config.schoolDay]);
  const grid = config.grid || {};

  // Build room-based view
  const rooms = config.rooms || [];

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 4 }}>
        Daily Schedule
        {config.publishedAt && (
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>
            Published {new Date(config.publishedAt).toLocaleDateString()}
          </span>
        )}
      </h3>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
        Same schedule Monday – Friday
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table schedule-preview-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Time</th>
              {rooms.map(r => <th key={r.id}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(period => {
              const pIdx = period.index;
              const assignments = grid[pIdx] ? (Array.isArray(grid[pIdx]) ? grid[pIdx] : [grid[pIdx]]) : [];
              const isLunch = period.type === 'lunch';

              if (isLunch) {
                return (
                  <tr key={pIdx} style={{ background: '#F9FAFB' }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      <div>{formatTime(period.start)}</div>
                      <div style={{ color: '#9CA3AF' }}>{formatTime(period.end)}</div>
                    </td>
                    <td colSpan={rooms.length} style={{ textAlign: 'center', fontWeight: 600, color: '#6B7280', fontStyle: 'italic' }}>
                      Lunch
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={pIdx}>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>
                    <div>{formatTime(period.start)}</div>
                    <div style={{ color: '#9CA3AF' }}>{formatTime(period.end)}</div>
                  </td>
                  {rooms.map(room => {
                    const assignment = assignments.find(a => a.roomId === room.id);
                    if (!assignment) return <td key={room.id} style={{ color: '#D1D5DB' }}>—</td>;
                    const cls = (config.classes || []).find(c => c.id === assignment.classId);
                    const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
                    const groups = cls ? (cls.groupIds || []).map(gId => (config.studentGroups || []).find(g => g.id === gId)).filter(Boolean) : [];
                    return (
                      <td key={room.id} style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C' }}>{cls?.name || '?'}</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{teacher?.name || ''}</div>
                        <div>
                          {groups.map(g => (
                            <span key={g.id} style={{ fontSize: 10, color: g.color, marginRight: 4 }}>{g.name}</span>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
