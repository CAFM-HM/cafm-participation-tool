import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSchedule } from '../hooks/useFirestore';

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(m) { return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`; }
function formatTime(t) { const [h, m] = t.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function gk(day, pIdx) { return `${day}-${pIdx}`; }

function computePeriods(sd) {
  const { startTime, endTime, periodMinutes, passingMinutes, lunchAfterPeriod, lunchMinutes } = sd;
  const start = timeToMin(startTime), end = timeToMin(endTime);
  const periods = [];
  let cursor = start, num = 1;
  while (cursor + periodMinutes <= end) {
    periods.push({ index: periods.length, num, type: 'class', start: minToTime(cursor), end: minToTime(cursor + periodMinutes), label: `Period ${num}` });
    cursor += periodMinutes; num++;
    if (periods.filter(p => p.type === 'class').length === lunchAfterPeriod && !periods.some(p => p.type === 'lunch')) {
      periods.push({ index: periods.length, num: null, type: 'lunch', start: minToTime(cursor), end: minToTime(cursor + lunchMinutes), label: 'Lunch' });
      cursor += lunchMinutes;
    }
    if (cursor + passingMinutes + periodMinutes <= end) cursor += passingMinutes;
    else cursor += passingMinutes;
  }
  return periods;
}

function isTeacherAvailable(teacher, pIdx, day, periods) {
  if (!teacher?.unavailable?.length) return true;
  const period = periods[pIdx];
  if (!period) return true;
  for (const b of teacher.unavailable) {
    if (b.days && !b.days.includes(day)) continue;
    if (b.type === 'period' && b.periodIndex === pIdx) return false;
    if (b.type === 'timeRange') {
      const pS = timeToMin(period.start), pE = timeToMin(period.end);
      if (pS < timeToMin(b.endTime) && pE > timeToMin(b.startTime)) return false;
    }
  }
  return true;
}

// Get all period indices a class occupies if placed at pIdx (handles double periods)
function getOccupiedIndices(pIdx, duration, periods) {
  const classPeriods = periods.filter(p => p.type === 'class');
  const startOrder = classPeriods.findIndex(p => p.index === pIdx);
  if (startOrder === -1) return [pIdx];
  const indices = [];
  for (let i = 0; i < (duration || 1); i++) {
    if (startOrder + i < classPeriods.length) indices.push(classPeriods[startOrder + i].index);
  }
  return indices;
}

// ============================================================
// AUTO-SCHEDULE GENERATOR — Smart solver with backtracking,
// randomized restarts, and quality scoring
// ============================================================
function autoGenerate(config, periods) {
  const classes = config.classes || [];
  const teachers = config.teachers || [];
  const rooms = config.rooms || [];
  const studentGroups = config.studentGroups || [];
  const classPeriods = periods.filter(p => p.type === 'class');
  if (classes.length === 0 || classPeriods.length === 0) return null;

  const getKey = (day, pIdx) => `${day}-${pIdx}`;
  const NUM_ATTEMPTS = 60;

  // Pre-compute teacher lookup for speed
  const teacherMap = {};
  teachers.forEach(t => { teacherMap[t.id] = t; });

  // Build task list: each class×day-needed = one task
  const buildTasks = () => {
    const tasks = [];
    classes.forEach(cls => {
      const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
      for (let i = 0; i < need; i++) {
        tasks.push({ classId: cls.id, teacherId: cls.teacherId, groupIds: cls.groupIds || [], duration: cls.duration || 1 });
      }
    });
    return tasks;
  };

  // Create fresh state
  const freshState = () => {
    const state = {
      grid: {},
      teacherSlots: {}, // teacherId -> { day -> Set<pIdx> }
      roomSlots: {},     // roomId -> { day -> Set<pIdx> }
      groupSlots: {},    // groupId -> { day -> Set<pIdx> }
      classDays: {},     // classId -> Set<day>
      classPeriodMap: {} // classId -> [pIdx, pIdx, ...] — which period indices it's been placed at
    };
    teachers.forEach(t => { state.teacherSlots[t.id] = {}; DAYS.forEach(d => state.teacherSlots[t.id][d] = new Set()); });
    rooms.forEach(r => { state.roomSlots[r.id] = {}; DAYS.forEach(d => state.roomSlots[r.id][d] = new Set()); });
    studentGroups.forEach(g => { state.groupSlots[g.id] = {}; DAYS.forEach(d => state.groupSlots[g.id][d] = new Set()); });
    classes.forEach(c => { state.classDays[c.id] = new Set(); state.classPeriodMap[c.id] = []; });
    return state;
  };

  // Get occupied period indices for a placement
  const getOccupied = (pIdx, dur) => {
    const startOrder = classPeriods.findIndex(p => p.index === pIdx);
    if (startOrder === -1 || startOrder + dur > classPeriods.length) return null;
    const indices = [];
    for (let i = 0; i < dur; i++) indices.push(classPeriods[startOrder + i].index);
    return indices;
  };

  // Validity check
  const canPlace = (task, day, pIdx, state) => {
    const occupied = getOccupied(pIdx, task.duration);
    if (!occupied) return false;
    if (state.classDays[task.classId].has(day)) return false;

    for (const oi of occupied) {
      if (task.teacherId && state.teacherSlots[task.teacherId]?.[day]?.has(oi)) return false;
      if (task.teacherId) {
        const t = teacherMap[task.teacherId];
        if (t && !isTeacherAvailable(t, oi, day, periods)) return false;
      }
      for (const gId of task.groupIds) {
        if (state.groupSlots[gId]?.[day]?.has(oi)) return false;
      }
    }

    // Full-time teacher: keep ≥ 2 free periods per day
    if (task.teacherId) {
      const t = teacherMap[task.teacherId];
      if (t?.type === 'ft') {
        const after = (state.teacherSlots[task.teacherId][day]?.size || 0) + task.duration;
        if (classPeriods.length - after < 2) return false;
      }
    }
    return true;
  };

  // Find best room
  const findRoom = (task, day, pIdx, state) => {
    const occupied = getOccupied(pIdx, task.duration);
    if (!occupied) return '';
    const t = teacherMap[task.teacherId];
    if (t?.defaultRoom) {
      if (occupied.every(oi => !state.roomSlots[t.defaultRoom]?.[day]?.has(oi))) return t.defaultRoom;
    }
    for (const room of rooms) {
      if (occupied.every(oi => !state.roomSlots[room.id]?.[day]?.has(oi))) return room.id;
    }
    return '';
  };

  // Place a task into state
  const place = (task, day, pIdx, roomId, state) => {
    const occupied = getOccupied(pIdx, task.duration);
    const key = getKey(day, pIdx);
    if (!state.grid[key]) state.grid[key] = [];
    state.grid[key].push({ classId: task.classId, roomId });
    state.classDays[task.classId].add(day);
    state.classPeriodMap[task.classId].push(pIdx);
    for (const oi of occupied) {
      if (task.teacherId && state.teacherSlots[task.teacherId]) state.teacherSlots[task.teacherId][day].add(oi);
      if (roomId && state.roomSlots[roomId]) state.roomSlots[roomId][day].add(oi);
      for (const gId of task.groupIds) {
        if (state.groupSlots[gId]) state.groupSlots[gId][day].add(oi);
      }
    }
  };

  // Unplace a task (for backtracking)
  const unplace = (task, day, pIdx, roomId, state) => {
    const occupied = getOccupied(pIdx, task.duration);
    const key = getKey(day, pIdx);
    if (state.grid[key]) {
      state.grid[key] = state.grid[key].filter(a => a.classId !== task.classId);
      if (state.grid[key].length === 0) delete state.grid[key];
    }
    state.classDays[task.classId].delete(day);
    const pidxArr = state.classPeriodMap[task.classId];
    const rmIdx = pidxArr.indexOf(pIdx);
    if (rmIdx !== -1) pidxArr.splice(rmIdx, 1);
    for (const oi of occupied) {
      if (task.teacherId && state.teacherSlots[task.teacherId]) state.teacherSlots[task.teacherId][day].delete(oi);
      if (roomId && state.roomSlots[roomId]) state.roomSlots[roomId][day].delete(oi);
      for (const gId of task.groupIds) {
        if (state.groupSlots[gId]) state.groupSlots[gId][day].delete(oi);
      }
    }
  };

  // Count valid options for a task (for MRV heuristic)
  const countOptions = (task, state) => {
    let count = 0;
    for (const day of DAYS) {
      if (state.classDays[task.classId].has(day)) continue;
      for (const cp of classPeriods) {
        if (canPlace(task, day, cp.index, state)) count++;
      }
    }
    return count;
  };

  // Shuffle array in place (Fisher-Yates)
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // ── SCORE a completed schedule ──
  // Higher = better
  const scoreSchedule = (state, placedCount, totalTasks) => {
    let score = 0;

    // Massive bonus for placing all classes (1000 pts per placed task)
    score += placedCount * 1000;

    // Consistency: reward classes that land on the same period across days (0–200 pts per class)
    classes.forEach(cls => {
      const pIndices = state.classPeriodMap[cls.id];
      if (pIndices.length <= 1) return;
      // Check how many land on the most common period
      const freq = {};
      pIndices.forEach(p => { freq[p] = (freq[p] || 0) + 1; });
      const maxFreq = Math.max(...Object.values(freq));
      score += (maxFreq / pIndices.length) * 200;
    });

    // Teacher load balance: reward even spread across days (0–100 pts per teacher)
    teachers.forEach(t => {
      const loads = DAYS.map(d => state.teacherSlots[t.id]?.[d]?.size || 0);
      const avg = loads.reduce((a, b) => a + b, 0) / 5;
      const variance = loads.reduce((s, l) => s + (l - avg) ** 2, 0) / 5;
      score += Math.max(0, 100 - variance * 20); // lower variance = higher score
    });

    // Student group load balance: reward even spread (0–100 pts per group)
    studentGroups.forEach(g => {
      const loads = DAYS.map(d => state.groupSlots[g.id]?.[d]?.size || 0);
      const avg = loads.reduce((a, b) => a + b, 0) / 5;
      const variance = loads.reduce((s, l) => s + (l - avg) ** 2, 0) / 5;
      score += Math.max(0, 100 - variance * 20);
    });

    // Minimize teacher gaps: penalize holes between first and last class per day
    teachers.forEach(t => {
      DAYS.forEach(day => {
        const slots = state.teacherSlots[t.id]?.[day];
        if (!slots || slots.size < 2) return;
        const sorted = [...slots].sort((a, b) => a - b);
        const span = sorted[sorted.length - 1] - sorted[0] + 1;
        const gaps = span - slots.size;
        score -= gaps * 15; // penalty per gap period
      });
    });

    // Prefer teacher's default room: bonus when assigned
    Object.entries(state.grid).forEach(([, assignments]) => {
      (assignments || []).forEach(a => {
        const cls = classes.find(c => c.id === a.classId);
        if (!cls) return;
        const t = teacherMap[cls.teacherId];
        if (t?.defaultRoom && a.roomId === t.defaultRoom) score += 10;
      });
    });

    return score;
  };

  // ── SOLVE with backtracking + MRV ──
  const solve = (tasks, state, depth, maxBacktracks) => {
    if (depth >= tasks.length) return { placed: depth, state };

    // MRV: pick the unplaced task with fewest valid options
    let bestIdx = -1, bestOptions = Infinity;
    for (let i = depth; i < tasks.length; i++) {
      const opts = countOptions(tasks[i], state);
      if (opts < bestOptions) { bestOptions = opts; bestIdx = i; }
      if (opts === 0) break; // can't place this one, try anyway (will skip)
    }

    // Swap to front
    if (bestIdx !== depth) [tasks[depth], tasks[bestIdx]] = [tasks[bestIdx], tasks[depth]];

    const task = tasks[depth];

    // Build list of valid (day, pIdx) placements
    const options = [];
    for (const day of DAYS) {
      if (state.classDays[task.classId].has(day)) continue;
      for (const cp of classPeriods) {
        if (canPlace(task, day, cp.index, state)) {
          options.push({ day, pIdx: cp.index });
        }
      }
    }

    // Sort options by preference:
    // 1. Days where teacher has lightest load (spread)
    // 2. Period that matches where this class was already placed (consistency)
    // 3. Randomize within ties for variety across attempts
    const existingPeriods = state.classPeriodMap[task.classId];
    options.sort((a, b) => {
      // Prefer days with lighter teacher load
      const loadA = task.teacherId ? (state.teacherSlots[task.teacherId]?.[a.day]?.size || 0) : 0;
      const loadB = task.teacherId ? (state.teacherSlots[task.teacherId]?.[b.day]?.size || 0) : 0;
      if (loadA !== loadB) return loadA - loadB;

      // Prefer same period as prior placements of this class (consistency)
      const matchA = existingPeriods.includes(a.pIdx) ? 0 : 1;
      const matchB = existingPeriods.includes(b.pIdx) ? 0 : 1;
      if (matchA !== matchB) return matchA - matchB;

      return 0;
    });

    // Shuffle groups of equivalent options for randomization
    // (light shuffle: swap adjacent pairs randomly)
    for (let i = 0; i < options.length - 1; i++) {
      if (Math.random() < 0.3) [options[i], options[i + 1]] = [options[i + 1], options[i]];
    }

    let backtracks = 0;
    for (const opt of options) {
      const roomId = findRoom(task, opt.day, opt.pIdx, state);
      place(task, opt.day, opt.pIdx, roomId, state);

      const result = solve(tasks, state, depth + 1, maxBacktracks - backtracks);
      if (result.placed === tasks.length) return result; // perfect — done

      // Backtrack
      unplace(task, opt.day, opt.pIdx, roomId, state);
      backtracks++;
      if (backtracks >= maxBacktracks) break; // budget exhausted for this level
    }

    // Couldn't place this task — skip it and continue (greedy fallback)
    return solve(tasks, state, depth + 1, maxBacktracks);
  };

  // ── RUN MULTIPLE ATTEMPTS ──
  let bestResult = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < NUM_ATTEMPTS; attempt++) {
    const tasks = buildTasks();
    const state = freshState();

    // First attempt: use pure MRV ordering. Rest: shuffle with bias.
    if (attempt > 0) {
      // Group tasks by class, shuffle class order, keep same-class tasks together
      const byClass = {};
      tasks.forEach(t => { if (!byClass[t.classId]) byClass[t.classId] = []; byClass[t.classId].push(t); });
      const classOrder = shuffle(Object.keys(byClass));
      tasks.length = 0;
      classOrder.forEach(cId => byClass[cId].forEach(t => tasks.push(t)));
    }

    // Allow more backtracking in early attempts, less later (annealing)
    const maxBT = attempt < 10 ? 8 : attempt < 30 ? 4 : 2;
    const result = solve(tasks, state, 0, maxBT);
    const score = scoreSchedule(result.state, result.placed, tasks.length);

    if (score > bestScore) {
      bestScore = score;
      bestResult = { state: JSON.parse(JSON.stringify(result.state, (k, v) => v instanceof Set ? [...v] : v)), placed: result.placed, totalTasks: tasks.length };
    }

    // Perfect solution found — stop early
    if (result.placed === tasks.length && attempt >= 5) break;
  }

  // Reconstruct sets from arrays (JSON serialization converted Sets to arrays)
  const finalGrid = bestResult.state.grid;

  // Find empty slots
  const emptySlots = [];
  DAYS.forEach(day => {
    classPeriods.forEach(cp => {
      const key = getKey(day, cp.index);
      if (!finalGrid[key] || finalGrid[key].length === 0) {
        const prevCp = classPeriods[classPeriods.findIndex(p => p.index === cp.index) - 1];
        if (prevCp) {
          const prevKey = getKey(day, prevCp.index);
          const prevArr = finalGrid[prevKey] || [];
          const isDoubleExt = prevArr.some(a => {
            const cls = classes.find(c => c.id === a.classId);
            return cls && (cls.duration || 1) >= 2;
          });
          if (isDoubleExt) return;
        }
        emptySlots.push({ day, periodNum: cp.num, periodIndex: cp.index });
      }
    });
  });

  // Find unplaced classes
  const unplaced = [];
  const placedDays = {};
  classes.forEach(c => { placedDays[c.id] = new Set(); });
  Object.entries(finalGrid).forEach(([key, assignments]) => {
    const [day] = key.split('-');
    (assignments || []).forEach(a => { if (a?.classId && placedDays[a.classId]) placedDays[a.classId].add(day); });
  });
  classes.forEach(cls => {
    const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
    const have = placedDays[cls.id].size;
    if (have < need) {
      for (let i = 0; i < need - have; i++) unplaced.push(cls.name);
    }
  });

  return { grid: finalGrid, unplaced, emptySlots, attempts: NUM_ATTEMPTS, score: bestScore };
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ScheduleBuilder({ isAdmin }) {
  const { config, published, loading, saveConfig, publish } = useSchedule();
  const [local, setLocal] = useState(null);
  const [tab, setTab] = useState('grid');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (config && !local) setLocal(JSON.parse(JSON.stringify(config))); }, [config, local]);

  const update = useCallback((fn) => {
    setLocal(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });
    setDirty(true);
  }, []);

  const handleSave = async () => { if (local) { await saveConfig(local); setDirty(false); } };
  const handlePublish = async () => {
    if (!local || !window.confirm('Publish this schedule? Teachers will see it.')) return;
    await saveConfig(local); await publish(local); setDirty(false);
  };

  const periods = useMemo(() => local ? computePeriods(local.schoolDay) : [], [local]);

  // ============================================================
  // CONFLICT DETECTION
  // ============================================================
  const conflicts = useMemo(() => {
    if (!local) return {};
    const issues = {};
    const grid = local.grid || {};

    DAYS.forEach(day => {
      // Build a map: periodIndex -> list of { classId, roomId }
      const periodMap = {};
      periods.filter(p => p.type === 'class').forEach(p => { periodMap[p.index] = []; });

      Object.entries(grid).forEach(([key, assignments]) => {
        if (!key.startsWith(day + '-')) return;
        const pIdx = parseInt(key.split('-')[1]);
        const arr = Array.isArray(assignments) ? assignments : [assignments];
        arr.forEach(a => {
          if (!a?.classId) return;
          const cls = (local.classes || []).find(c => c.id === a.classId);
          const occupied = getOccupiedIndices(pIdx, cls?.duration || 1, periods);
          occupied.forEach(oi => {
            if (periodMap[oi]) periodMap[oi].push({ ...a, sourceIdx: pIdx });
          });
        });
      });

      // Check each period
      Object.entries(periodMap).forEach(([pIdxStr, assignments]) => {
        const pIdx = parseInt(pIdxStr);
        const key = gk(day, pIdx);
        const dayIssues = [];
        const teacherSlots = {}, roomSlots = {}, groupSlots = {};

        assignments.forEach(a => {
          const cls = (local.classes || []).find(c => c.id === a.classId);
          if (!cls) return;

          if (cls.teacherId) {
            if (teacherSlots[cls.teacherId]) {
              const other = (local.classes || []).find(c => c.id === teacherSlots[cls.teacherId]);
              const t = (local.teachers || []).find(t => t.id === cls.teacherId);
              dayIssues.push(`${t?.name || 'Teacher'} double-booked (${cls.name} & ${other?.name})`);
            }
            teacherSlots[cls.teacherId] = a.classId;
            const t = (local.teachers || []).find(t => t.id === cls.teacherId);
            if (t && !isTeacherAvailable(t, pIdx, day, periods))
              dayIssues.push(`${t.name} unavailable`);
          }

          if (a.roomId) {
            if (roomSlots[a.roomId]) {
              const other = (local.classes || []).find(c => c.id === roomSlots[a.roomId]);
              const r = (local.rooms || []).find(r => r.id === a.roomId);
              dayIssues.push(`${r?.name} double-booked (${cls.name} & ${other?.name})`);
            }
            roomSlots[a.roomId] = a.classId;
          }

          (cls.groupIds || []).forEach(gId => {
            if (groupSlots[gId]) {
              const other = (local.classes || []).find(c => c.id === groupSlots[gId]);
              const g = (local.studentGroups || []).find(g => g.id === gId);
              dayIssues.push(`${g?.name} double-booked (${cls.name} & ${other?.name})`);
            }
            groupSlots[gId] = a.classId;
          });
        });
        if (dayIssues.length > 0) {
          if (!issues[key]) issues[key] = [];
          issues[key].push(...dayIssues);
        }
      });
    });

    // FT planning period check
    issues.general = [];
    const ftTeachers = (local.teachers || []).filter(t => t.type === 'ft');
    const cpIndices = periods.filter(p => p.type === 'class').map(p => p.index);
    ftTeachers.forEach(teacher => {
      DAYS.forEach(day => {
        let teaching = 0;
        cpIndices.forEach(pIdx => {
          const key = gk(day, pIdx);
          const arr = grid[key] ? (Array.isArray(grid[key]) ? grid[key] : [grid[key]]) : [];
          if (arr.some(a => { const c = (local.classes || []).find(c => c.id === a.classId); return c?.teacherId === teacher.id; }))
            teaching++;
        });
        const free = cpIndices.length - teaching;
        if (free < 2)
          issues.general.push(`${teacher.name} has only ${free} free period${free !== 1 ? 's' : ''} on ${DAY_SHORT[day]} (min 2)`);
      });
    });
    if (issues.general.length === 0) delete issues.general;

    return issues;
  }, [local, periods]);

  if (loading || !local) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading schedule...</div>;

  // Teacher view
  if (!isAdmin) {
    return published ? <SchedulePreview config={published} /> : <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No schedule published yet.</div>;
  }

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

      {conflicts.general?.length > 0 && (
        <div className="schedule-warnings">
          {conflicts.general.map((w, i) => <div key={i} className="schedule-warning-item">{w}</div>)}
        </div>
      )}

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
// SETTINGS PANEL
// ============================================================
function SettingsPanel({ config, update, periods }) {
  const sd = config.schoolDay;
  const upd = (f, v) => update(c => { c.schoolDay[f] = v; });

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>School Day Settings</h3>
      <div className="sched-form-grid">
        <div className="sched-field"><label>Start Time</label><input type="time" value={sd.startTime} onChange={e => upd('startTime', e.target.value)} /></div>
        <div className="sched-field"><label>End Time</label><input type="time" value={sd.endTime} onChange={e => upd('endTime', e.target.value)} /></div>
        <div className="sched-field"><label>Period Length (min)</label><input type="number" value={sd.periodMinutes} min={20} max={90} onChange={e => upd('periodMinutes', parseInt(e.target.value) || 45)} /></div>
        <div className="sched-field"><label>Passing Period (min)</label><input type="number" value={sd.passingMinutes} min={0} max={15} onChange={e => upd('passingMinutes', parseInt(e.target.value) || 5)} /></div>
        <div className="sched-field"><label>Lunch After Period #</label><input type="number" value={sd.lunchAfterPeriod} min={1} max={10} onChange={e => upd('lunchAfterPeriod', parseInt(e.target.value) || 4)} /></div>
        <div className="sched-field"><label>Lunch Length (min)</label><input type="number" value={sd.lunchMinutes} min={15} max={60} onChange={e => upd('lunchMinutes', parseInt(e.target.value) || 30)} /></div>
      </div>

      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Generated Periods ({periods.length})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>#</th><th>Type</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.index}>
                <td>{p.type === 'lunch' ? '—' : p.num}</td>
                <td><span className={`badge ${p.type === 'lunch' ? 'badge-gray' : 'badge-green'}`}>{p.label}</span></td>
                <td>{formatTime(p.start)}</td><td>{formatTime(p.end)}</td>
                <td>{timeToMin(p.end) - timeToMin(p.start)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Rooms</h3>
      {(config.rooms || []).map((room, i) => (
        <div key={room.id} className="sched-inline-row">
          <input type="text" value={room.name} placeholder="Name" onChange={e => update(c => { c.rooms[i].name = e.target.value; })} style={{ width: 120 }} />
          <input type="number" value={room.capacity} placeholder="Cap" min={1} onChange={e => update(c => { c.rooms[i].capacity = parseInt(e.target.value) || 10; })} style={{ width: 70 }} />
          <input type="text" value={room.notes} placeholder="Notes" onChange={e => update(c => { c.rooms[i].notes = e.target.value; })} style={{ flex: 1 }} />
          <button className="remove-btn" onClick={() => update(c => { c.rooms.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
        onClick={() => update(c => { c.rooms.push({ id: genId(), name: `Room ${c.rooms.length + 1}`, capacity: 25, notes: '' }); })}>+ Add Room</button>

      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Student Groups</h3>
      {(config.studentGroups || []).map((g, i) => (
        <div key={g.id} className="sched-inline-row">
          <input type="text" value={g.name} placeholder="Group name" onChange={e => update(c => { c.studentGroups[i].name = e.target.value; })} style={{ width: 160 }} />
          <input type="color" value={g.color} onChange={e => update(c => { c.studentGroups[i].color = e.target.value; })} style={{ width: 40, height: 32, padding: 2 }} />
          <button className="remove-btn" onClick={() => update(c => { c.studentGroups.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
        onClick={() => update(c => { c.studentGroups.push({ id: genId(), name: '', color: '#6B7280' }); })}>+ Add Group</button>
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
    update(c => { c.teachers.push({ id: genId(), name: newName.trim(), type: 'ft', defaultRoom: '', unavailable: [] }); });
    setNewName('');
  };

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Teachers</h3>
      <div className="sched-inline-row" style={{ marginBottom: 16 }}>
        <input type="text" value={newName} placeholder="Teacher name" onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTeacher()} style={{ width: 200 }} />
        <button className="btn btn-primary btn-sm" onClick={addTeacher}>+ Add Teacher</button>
      </div>

      {(config.teachers || []).map((teacher, tIdx) => (
        <div key={teacher.id} className="sched-teacher-card">
          <div className="sched-teacher-header" onClick={() => setExpandedId(expandedId === teacher.id ? null : teacher.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#1B3A5C' }}>{teacher.name}</span>
              <span className={`badge ${teacher.type === 'ft' ? 'badge-green' : 'badge-gray'}`}>{teacher.type === 'ft' ? 'Full-Time' : 'Part-Time'}</span>
            </div>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{expandedId === teacher.id ? '▲' : '▼'}</span>
          </div>
          {expandedId === teacher.id && (
            <div className="sched-teacher-body">
              <div className="sched-inline-row">
                <div className="sched-field" style={{ flex: 0 }}>
                  <label>Type</label>
                  <select value={teacher.type} onChange={e => update(c => { c.teachers[tIdx].type = e.target.value; })}>
                    <option value="ft">Full-Time</option><option value="pt">Part-Time</option>
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
                    onClick={() => { if (window.confirm(`Remove ${teacher.name}?`)) update(c => { c.teachers.splice(tIdx, 1); }); }}>Remove</button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>UNAVAILABLE TIMES</div>
                {(teacher.unavailable || []).map((block, bIdx) => (
                  <div key={bIdx} className="sched-inline-row" style={{ background: '#FEF2F2', padding: '6px 10px', borderRadius: 6, marginBottom: 4 }}>
                    {block.type === 'period'
                      ? <span style={{ fontSize: 13 }}>Period {periods[block.periodIndex]?.num || '?'}</span>
                      : <span style={{ fontSize: 13 }}>{formatTime(block.startTime)} – {formatTime(block.endTime)}</span>
                    }
                    {block.days && <span style={{ fontSize: 11, color: '#6B7280' }}>{block.days.map(d => DAY_SHORT[d]).join(', ')}</span>}
                    {block.note && <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>({block.note})</span>}
                    <button className="remove-btn" onClick={() => update(c => { c.teachers[tIdx].unavailable.splice(bIdx, 1); })}>×</button>
                  </div>
                ))}
                <AddUnavailability periods={periods} onAdd={(b) => update(c => { c.teachers[tIdx].unavailable.push(b); })} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddUnavailability({ periods, onAdd }) {
  const [mode, setMode] = useState('period');
  const [periodIdx, setPeriodIdx] = useState(0);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [days, setDays] = useState([...DAYS]);
  const [note, setNote] = useState('');

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleAdd = () => {
    const block = { type: mode, note, days: days.length < 5 ? [...days] : undefined };
    if (mode === 'period') block.periodIndex = periodIdx;
    else { block.startTime = startTime; block.endTime = endTime; }
    onAdd(block);
    setNote('');
  };

  const classPeriods = periods.filter(p => p.type === 'class');

  return (
    <div style={{ marginTop: 8 }}>
      <div className="sched-inline-row" style={{ flexWrap: 'wrap' }}>
        <select value={mode} onChange={e => setMode(e.target.value)} style={{ width: 130 }}>
          <option value="period">Specific Period</option><option value="timeRange">Time Range</option>
        </select>
        {mode === 'period' ? (
          <select value={periodIdx} onChange={e => setPeriodIdx(parseInt(e.target.value))} style={{ width: 180 }}>
            {classPeriods.map(p => <option key={p.index} value={p.index}>Period {p.num} ({formatTime(p.start)})</option>)}
          </select>
        ) : (
          <><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: 110 }} />
          <span style={{ color: '#9CA3AF' }}>to</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: 110 }} /></>
        )}
      </div>
      <div className="sched-inline-row" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 11, color: '#6B7280' }}>Days:</span>
        {DAYS.map(d => (
          <button key={d} className={`btn btn-sm ${days.includes(d) ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => toggleDay(d)} style={{ minWidth: 36, padding: '4px 6px', fontSize: 11 }}>{DAY_SHORT[d]}</button>
        ))}
        <input type="text" value={note} placeholder="Note" onChange={e => setNote(e.target.value)} style={{ width: 120 }} />
        <button className="btn btn-sm btn-secondary" onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

// ============================================================
// CLASSES PANEL — with days/week and inline editing
// ============================================================
function ClassesPanel({ config, update }) {
  const [nc, setNc] = useState({ name: '', teacherId: '', groupIds: [], daysPerWeek: 5, duration: 1 });
  const [editingId, setEditingId] = useState(null);

  const addClass = () => {
    if (!nc.name.trim()) return;
    update(c => { c.classes.push({ id: genId(), name: nc.name.trim(), teacherId: nc.teacherId, groupIds: nc.groupIds, daysPerWeek: nc.daysPerWeek, duration: nc.duration }); });
    setNc({ name: '', teacherId: '', groupIds: [], daysPerWeek: 5, duration: 1 });
  };

  const toggleGroup = (gId) => setNc(p => ({ ...p, groupIds: p.groupIds.includes(gId) ? p.groupIds.filter(g => g !== gId) : [...p.groupIds, gId] }));

  const updateClass = (cIdx, field, value) => { update(c => { c.classes[cIdx][field] = value; }); };
  const toggleEditGroup = (cIdx, gId) => {
    update(c => {
      const groups = c.classes[cIdx].groupIds || [];
      c.classes[cIdx].groupIds = groups.includes(gId) ? groups.filter(g => g !== gId) : [...groups, gId];
    });
  };

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Classes</h3>
      <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>ADD NEW CLASS</div>
        <div className="sched-inline-row">
          <input type="text" value={nc.name} placeholder="Class name" onChange={e => setNc({ ...nc, name: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addClass()} style={{ width: 180 }} />
          <select value={nc.teacherId} onChange={e => setNc({ ...nc, teacherId: e.target.value })} style={{ width: 160 }}>
            <option value="">— Teacher —</option>
            {(config.teachers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Days/Week</label>
            <input type="number" value={nc.daysPerWeek} min={1} max={5}
              onChange={e => setNc({ ...nc, daysPerWeek: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
              style={{ width: 60 }} />
          </div>
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Duration</label>
            <select value={nc.duration} onChange={e => setNc({ ...nc, duration: parseInt(e.target.value) })} style={{ width: 100 }}>
              <option value={1}>Single</option>
              <option value={2}>Double</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Students:</span>
          {(config.studentGroups || []).map(g => (
            <button key={g.id} className={`btn btn-sm ${nc.groupIds.includes(g.id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleGroup(g.id)} style={nc.groupIds.includes(g.id) ? { background: g.color } : {}}>{g.name}</button>
          ))}
          <button className="btn btn-sm btn-gold" onClick={addClass} style={{ marginLeft: 'auto' }}>+ Add Class</button>
        </div>
      </div>

      {(config.classes || []).length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No classes added yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Days/Wk</th><th>Duration</th><th></th></tr></thead>
            <tbody>
              {(config.classes || []).map((cls, cIdx) => {
                const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
                const isEditing = editingId === cls.id;
                // Support legacy 'days' array — convert to daysPerWeek for display
                const daysPerWeek = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
                return (
                  <tr key={cls.id}>
                    <td>
                      {isEditing ? (
                        <input type="text" value={cls.name} onChange={e => updateClass(cIdx, 'name', e.target.value)}
                          style={{ fontWeight: 500, fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 4, padding: '3px 6px', width: '100%' }} />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{cls.name}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select value={cls.teacherId || ''} onChange={e => updateClass(cIdx, 'teacherId', e.target.value)}
                          style={{ fontSize: 13, padding: '3px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
                          <option value="">— None —</option>
                          {(config.teachers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      ) : (
                        teacher?.name || <span style={{ color: '#DC2626' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(config.studentGroups || []).map(g => (
                            <button key={g.id} className={`btn btn-sm ${(cls.groupIds || []).includes(g.id) ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => toggleEditGroup(cIdx, g.id)}
                              style={{ fontSize: 10, padding: '2px 6px', ...((cls.groupIds || []).includes(g.id) ? { background: g.color } : {}) }}>{g.name}</button>
                          ))}
                        </div>
                      ) : (
                        (cls.groupIds || []).map(gId => { const g = (config.studentGroups || []).find(sg => sg.id === gId); return g ? <span key={gId} className="badge" style={{ background: g.color + '22', color: g.color, marginRight: 4 }}>{g.name}</span> : null; })
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" value={daysPerWeek} min={1} max={5}
                          onChange={e => updateClass(cIdx, 'daysPerWeek', Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                          style={{ width: 50, fontSize: 13, padding: '3px 6px', border: '1px solid #D1D5DB', borderRadius: 4 }} />
                      ) : (
                        <span style={{ fontSize: 12 }}>{daysPerWeek}×</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select value={cls.duration || 1} onChange={e => updateClass(cIdx, 'duration', parseInt(e.target.value))}
                          style={{ fontSize: 13, padding: '3px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
                          <option value={1}>Single</option>
                          <option value={2}>Double</option>
                        </select>
                      ) : (
                        (cls.duration || 1) === 2 ? 'Double' : 'Single'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingId(isEditing ? null : cls.id)}
                          style={{ fontSize: 11, padding: '2px 8px' }}>{isEditing ? 'Done' : 'Edit'}</button>
                        <button className="remove-btn" onClick={() => { if (window.confirm(`Remove ${cls.name}?`)) update(c => { c.classes.splice(cIdx, 1); }); }}>×</button>
                      </div>
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
// GRID PANEL — full M-F grid
// ============================================================
function GridPanel({ config, update, periods, conflicts }) {
  const [pickerCell, setPickerCell] = useState(null); // "day-pIdx"
  const [genResult, setGenResult] = useState(null); // { unplaced, emptySlots }
  const grid = config.grid || {};
  const classPeriods = periods.filter(p => p.type === 'class');

  const handleGenerate = () => {
    const hasExisting = Object.keys(config.grid || {}).length > 0;
    if (hasExisting && !window.confirm('This will clear the current schedule and generate a new one. Continue?')) return;

    const result = autoGenerate(config, periods);
    if (!result) { setGenResult({ error: 'Add classes and set up school day settings first.' }); setTimeout(() => setGenResult(null), 3000); return; }

    update(c => { c.grid = result.grid; });
    setGenResult({ unplaced: result.unplaced, emptySlots: result.emptySlots, attempts: result.attempts, score: result.score });
  };

  const getAssignments = (day, pIdx) => {
    const val = grid[gk(day, pIdx)];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const addToCell = (day, pIdx, classId, roomId) => {
    update(c => {
      if (!c.grid) c.grid = {};
      const key = gk(day, pIdx);
      const existing = c.grid[key] ? (Array.isArray(c.grid[key]) ? c.grid[key] : [c.grid[key]]) : [];
      existing.push({ classId, roomId });
      c.grid[key] = existing;
    });
    setPickerCell(null);
  };

  const removeFromCell = (day, pIdx, classId) => {
    update(c => {
      const key = gk(day, pIdx);
      if (!c.grid?.[key]) return;
      const arr = Array.isArray(c.grid[key]) ? c.grid[key] : [c.grid[key]];
      c.grid[key] = arr.filter(a => a.classId !== classId);
      if (c.grid[key].length === 0) delete c.grid[key];
    });
  };

  // Track scheduling counts
  const classDayCounts = {};
  (config.classes || []).forEach(cls => { classDayCounts[cls.id] = new Set(); });
  Object.entries(grid).forEach(([key, val]) => {
    const [day] = key.split('-');
    const arr = Array.isArray(val) ? val : [val];
    arr.forEach(a => { if (a?.classId && classDayCounts[a.classId]) classDayCounts[a.classId].add(day); });
  });

  const unscheduled = (config.classes || []).filter(cls => {
    const scheduled = classDayCounts[cls.id]?.size || 0;
    return scheduled < (cls.daysPerWeek || (cls.days ? cls.days.length : 5));
  });

  // Check if a period is "blocked" by a double-period class from the previous period
  const isBlockedByDouble = (day, pIdx) => {
    const prevClassPeriod = classPeriods[classPeriods.findIndex(p => p.index === pIdx) - 1];
    if (!prevClassPeriod) return null;
    const prevAssignments = getAssignments(day, prevClassPeriod.index);
    for (const a of prevAssignments) {
      const cls = (config.classes || []).find(c => c.id === a.classId);
      if (cls && (cls.duration || 1) >= 2) return { cls, assignment: a };
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>Schedule Grid</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-gold btn-sm" onClick={handleGenerate}>⚡ Auto-Generate</button>
        </div>
      </div>

      {genResult && !genResult.error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid', fontSize: 13,
          borderColor: genResult.unplaced.length > 0 ? '#FDE68A' : '#A7F3D0',
          background: genResult.unplaced.length > 0 ? '#FFFBEB' : '#ECFDF5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: genResult.unplaced.length > 0 ? '#92400E' : '#065F46' }}>
                {genResult.unplaced.length > 0 ? 'Schedule generated with issues' : '✓ Schedule generated successfully'}
                <span style={{ fontWeight: 400, fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>
                  ({genResult.attempts} attempts, best score: {Math.round(genResult.score)})
                </span>
              </div>
              {genResult.unplaced.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#DC2626', fontWeight: 500 }}>Could not place:</span>{' '}
                  {genResult.unplaced.map((name, i) => <span key={i} className="badge" style={{ background: '#FEE2E2', color: '#991B1B', marginRight: 4 }}>{name}</span>)}
                </div>
              )}
              {genResult.emptySlots.length > 0 && (
                <div>
                  <span style={{ fontWeight: 500, color: '#6B7280' }}>Open periods:</span>{' '}
                  {(() => {
                    // Group empty slots by day
                    const byDay = {};
                    genResult.emptySlots.forEach(s => {
                      if (!byDay[s.day]) byDay[s.day] = [];
                      byDay[s.day].push(s.periodNum);
                    });
                    return Object.entries(byDay).map(([day, pNums]) => (
                      <span key={day} className="badge" style={{ background: '#F3F4F6', color: '#4B5563', marginRight: 6 }}>
                        {DAY_SHORT[day]}: Period {pNums.join(', ')}
                      </span>
                    ));
                  })()}
                </div>
              )}
              {genResult.emptySlots.length === 0 && genResult.unplaced.length === 0 && (
                <div style={{ color: '#065F46' }}>All periods filled — no open slots.</div>
              )}
            </div>
            <button className="remove-btn" onClick={() => setGenResult(null)} style={{ fontSize: 14 }}>×</button>
          </div>
        </div>
      )}

      {genResult?.error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
          {genResult.error}
        </div>
      )}

      {unscheduled.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#92400E' }}>Needs scheduling:</span>{' '}
          {unscheduled.map(cls => {
            const have = classDayCounts[cls.id]?.size || 0;
            const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
            return <span key={cls.id} className="badge" style={{ marginLeft: 6, background: '#FDE68A', color: '#92400E' }}>{cls.name} ({have}/{need} days)</span>;
          })}
        </div>
      )}

      <div className="sched-grid-wrapper">
        <table className="sched-grid-table">
          <thead>
            <tr>
              <th className="sched-grid-time-col">Time</th>
              {DAYS.map(d => <th key={d} className="sched-grid-day-col">{DAY_LABELS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(period => {
              const isLunch = period.type === 'lunch';
              return (
                <tr key={period.index} className={isLunch ? 'sched-grid-lunch-row' : ''}>
                  <td className="sched-grid-time-cell">
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#1B3A5C' }}>{period.label}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>{formatTime(period.start)} – {formatTime(period.end)}</div>
                  </td>
                  {isLunch ? (
                    <td colSpan={5} style={{ textAlign: 'center', fontWeight: 600, color: '#6B7280', fontStyle: 'italic', background: '#F9FAFB' }}>Lunch</td>
                  ) : (
                    DAYS.map(day => {
                      const key = gk(day, period.index);
                      const assignments = getAssignments(day, period.index);
                      const cellConflicts = conflicts[key] || [];
                      const blocked = isBlockedByDouble(day, period.index);

                      return (
                        <td key={day} className={`sched-grid-cell ${cellConflicts.length > 0 ? 'has-conflict' : ''}`}>
                          {blocked ? (
                            <div className="sched-grid-double-cont">
                              <span style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
                                ← {blocked.cls.name} (cont.)
                              </span>
                            </div>
                          ) : (
                            <>
                              {assignments.map(a => {
                                const cls = (config.classes || []).find(c => c.id === a.classId);
                                const room = (config.rooms || []).find(r => r.id === a.roomId);
                                const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
                                if (!cls) return null;
                                return (
                                  <div key={a.classId} className={`sched-grid-class-chip ${(cls.duration || 1) === 2 ? 'double' : ''}`}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 12 }}>{cls.name}</div>
                                      <div style={{ fontSize: 10, color: '#6B7280' }}>{teacher?.name} · {room?.name || '?'}</div>
                                    </div>
                                    <button className="remove-btn" style={{ fontSize: 12 }} onClick={() => removeFromCell(day, period.index, a.classId)}>×</button>
                                  </div>
                                );
                              })}

                              {pickerCell === key ? (
                                <CellPicker config={config} day={day} periodIndex={period.index} periods={periods}
                                  onAdd={(cId, rId) => addToCell(day, period.index, cId, rId)}
                                  onCancel={() => setPickerCell(null)} />
                              ) : (
                                <button className="schedule-add-btn" onClick={() => setPickerCell(key)}>+</button>
                              )}

                              {cellConflicts.length > 0 && (
                                <div style={{ marginTop: 2 }}>
                                  {cellConflicts.map((c, i) => <div key={i} style={{ fontSize: 10, color: '#DC2626' }}>{c}</div>)}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellPicker({ config, day, periodIndex, periods, onAdd, onCancel }) {
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleClassChange = (cId) => {
    setClassId(cId);
    const cls = (config.classes || []).find(c => c.id === cId);
    if (cls?.teacherId) {
      const t = (config.teachers || []).find(t => t.id === cls.teacherId);
      if (t?.defaultRoom) setRoomId(t.defaultRoom);
    }
  };

  // Filter to classes that should be on this day
  // Show all classes — daysPerWeek controls how many days they need, not which specific days
  const availableClasses = (config.classes || []).filter(cls => {
    // Support legacy 'days' array — if it exists, filter by specific day
    if (cls.days && !cls.daysPerWeek) return cls.days.includes(day);
    return true;
  });

  return (
    <div style={{ background: '#EFF6FF', padding: 6, borderRadius: 6, marginTop: 2 }}>
      <select value={classId} onChange={e => handleClassChange(e.target.value)} style={{ width: '100%', fontSize: 12, marginBottom: 4 }}>
        <option value="">— Class —</option>
        {availableClasses.map(cls => {
          const t = (config.teachers || []).find(t => t.id === cls.teacherId);
          const avail = t ? isTeacherAvailable(t, periodIndex, day, periods) : true;
          return <option key={cls.id} value={cls.id}>{cls.name} ({t?.name || '?'}){!avail ? ' ⚠' : ''}</option>;
        })}
      </select>
      <div className="sched-inline-row" style={{ marginBottom: 0 }}>
        <select value={roomId} onChange={e => setRoomId(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
          <option value="">— Room —</option>
          {(config.rooms || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" onClick={() => classId && onAdd(classId, roomId)} disabled={!classId} style={{ fontSize: 11, padding: '3px 8px' }}>Add</button>
        <button className="btn btn-sm btn-secondary" onClick={onCancel} style={{ fontSize: 11, padding: '3px 8px' }}>×</button>
      </div>
    </div>
  );
}

// ============================================================
// SCHEDULE PREVIEW — clean M-F room grid
// ============================================================
function SchedulePreview({ config }) {
  const periods = useMemo(() => computePeriods(config.schoolDay), [config.schoolDay]);
  const grid = config.grid || {};
  const rooms = config.rooms || [];

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 4 }}>
        Daily Schedule
        {config.publishedAt && <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>Published {new Date(config.publishedAt).toLocaleDateString()}</span>}
      </h3>

      {DAYS.map(day => {
        // Check if this day has any classes
        const dayKeys = Object.keys(grid).filter(k => k.startsWith(day + '-'));
        const hasClasses = dayKeys.some(k => {
          const val = grid[k];
          const arr = Array.isArray(val) ? val : [val];
          return arr.some(a => a?.classId);
        });
        if (!hasClasses) return null;

        return (
          <div key={day} style={{ marginBottom: 24 }}>
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: '#1B3A5C', marginBottom: 8 }}>{DAY_LABELS[day]}</h4>
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
                    const key = gk(day, pIdx);
                    const assignments = grid[key] ? (Array.isArray(grid[key]) ? grid[key] : [grid[key]]) : [];

                    if (period.type === 'lunch') {
                      return (
                        <tr key={pIdx} style={{ background: '#F9FAFB' }}>
                          <td style={{ fontWeight: 600, fontSize: 12 }}><div>{formatTime(period.start)}</div><div style={{ color: '#9CA3AF' }}>{formatTime(period.end)}</div></td>
                          <td colSpan={rooms.length} style={{ textAlign: 'center', fontWeight: 600, color: '#6B7280', fontStyle: 'italic' }}>Lunch</td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={pIdx}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}><div>{formatTime(period.start)}</div><div style={{ color: '#9CA3AF' }}>{formatTime(period.end)}</div></td>
                        {rooms.map(room => {
                          const a = assignments.find(a => a.roomId === room.id);
                          if (!a) return <td key={room.id} style={{ color: '#D1D5DB', textAlign: 'center' }}>—</td>;
                          const cls = (config.classes || []).find(c => c.id === a.classId);
                          const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
                          return (
                            <td key={room.id} style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C' }}>{cls?.name || '?'}</div>
                              <div style={{ fontSize: 11, color: '#6B7280' }}>{teacher?.name || ''}</div>
                              {(cls?.duration || 1) === 2 && <div style={{ fontSize: 10, color: '#CA8A04' }}>Double period</div>}
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
      })}
    </div>
  );
}
