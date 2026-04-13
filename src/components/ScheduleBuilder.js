import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSchedule } from '../hooks/useFirestore';

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const SUBJECT_CATEGORIES = ['Math', 'Science', 'Humanities', 'Arts', 'Other'];
const CATEGORY_COLORS = { Math: '#1E40AF', Science: '#065F46', Humanities: '#92400E', Arts: '#9D174D', Other: '#6B7280' };
const CATEGORY_BG = { Math: '#DBEAFE', Science: '#D1FAE5', Humanities: '#FEF3C7', Arts: '#FCE7F3', Other: '#F3F4F6' };

// Distinct, accessible teacher colors — bg (light) and text (dark) pairs
const TEACHER_COLORS = [
  { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' }, // blue
  { bg: '#FCE7F3', text: '#9D174D', border: '#F9A8D4' }, // pink
  { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' }, // green
  { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' }, // amber
  { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' }, // violet
  { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' }, // orange
  { bg: '#CCFBF1', text: '#115E59', border: '#5EEAD4' }, // teal
  { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' }, // red
  { bg: '#E0E7FF', text: '#3730A3', border: '#A5B4FC' }, // indigo
  { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' }, // purple
  { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' }, // emerald
  { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' }, // warm orange
  { bg: '#F0F9FF', text: '#0369A1', border: '#7DD3FC' }, // sky
  { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' }, // rose
  { bg: '#FEFCE8', text: '#854D0E', border: '#FDE047' }, // yellow
];

function getTeacherColor(teacherId, teachers) {
  const idx = teachers.findIndex(t => t.id === teacherId);
  if (idx === -1) return { bg: '#F3F4F6', text: '#4B5563', border: '#D1D5DB' };
  return TEACHER_COLORS[idx % TEACHER_COLORS.length];
}
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(m) { return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`; }
function formatTime(t) { const [h, m] = t.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function gk(day, pIdx) { return `${day}-${pIdx}`; }

function computePeriods(sd, overrideEndTime) {
  const { startTime, endTime, periodMinutes, passingMinutes, lunchAfterPeriod, lunchMinutes } = sd;
  const start = timeToMin(startTime), end = timeToMin(overrideEndTime || endTime);
  const periods = [];
  let cursor = start, num = 1;
  while (cursor + periodMinutes <= end) {
    periods.push({ index: periods.length, num, type: 'class', start: minToTime(cursor), end: minToTime(cursor + periodMinutes), label: `Period ${num}` });
    cursor += periodMinutes; num++;
    if (periods.filter(p => p.type === 'class').length === lunchAfterPeriod && !periods.some(p => p.type === 'lunch')) {
      if (cursor + lunchMinutes <= end) {
        periods.push({ index: periods.length, num: null, type: 'lunch', start: minToTime(cursor), end: minToTime(cursor + lunchMinutes), label: 'Lunch' });
        cursor += lunchMinutes;
      }
    }
    if (cursor + passingMinutes + periodMinutes <= end) cursor += passingMinutes;
    else cursor += passingMinutes;
  }
  return periods;
}

// Get the max period index that's valid for a given day (early release support)
function getMaxPeriodForDay(day, sd, periods) {
  if (!sd.earlyReleaseDay || sd.earlyReleaseDay !== day || !sd.earlyReleaseEndTime) return null; // no limit
  const earlyPeriods = computePeriods(sd, sd.earlyReleaseEndTime);
  const earlyMaxIndex = earlyPeriods.length > 0 ? earlyPeriods[earlyPeriods.length - 1].index : -1;
  return earlyMaxIndex;
}

function isPeriodValidForDay(day, periodIndex, sd, periods) {
  const maxIdx = getMaxPeriodForDay(day, sd, periods);
  if (maxIdx === null) return true; // no early release
  return periodIndex <= maxIdx;
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
async function autoGenerate(config, periods, semester) {
  // Filter classes by active semester: 'full' classes always included
  const allClasses = config.classes || [];
  const classes = allClasses.filter(cls => {
    const s = cls.semester || 'full';
    return s === 'full' || s === semester;
  });
  const teachers = config.teachers || [];
  const rooms = config.rooms || [];
  const studentGroups = config.studentGroups || [];
  const classPeriods = periods.filter(p => p.type === 'class');
  if (classes.length === 0 || classPeriods.length === 0) return null;

  const getKey = (day, pIdx) => `${day}-${pIdx}`;
  const NUM_ATTEMPTS = 60;
  const startTime = Date.now();
  const TIME_LIMIT = 10000; // 10 second max
  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

  // Pre-compute teacher lookup for speed
  const teacherMap = {};
  teachers.forEach(t => { teacherMap[t.id] = t; });

  // Build concurrent group lookup: concurrentGroup label -> [classId, classId, ...]
  const concurrentMap = {};
  classes.forEach(cls => {
    if (cls.concurrentGroup) {
      if (!concurrentMap[cls.concurrentGroup]) concurrentMap[cls.concurrentGroup] = [];
      concurrentMap[cls.concurrentGroup].push(cls.id);
    }
  });

  // Check if two classes are in the same concurrent group
  const areConcurrent = (classIdA, classIdB) => {
    const clsA = classes.find(c => c.id === classIdA);
    const clsB = classes.find(c => c.id === classIdB);
    return clsA?.concurrentGroup && clsB?.concurrentGroup && clsA.concurrentGroup === clsB.concurrentGroup;
  };

  // Build task list: each class×day-needed = one task
  // Concurrent classes are bundled — only the first class in a group creates tasks
  const buildTasks = () => {
    const tasks = [];
    const handledConcurrent = new Set();
    classes.forEach(cls => {
      if (cls.concurrentGroup && handledConcurrent.has(cls.concurrentGroup)) return;
      if (cls.concurrentGroup) handledConcurrent.add(cls.concurrentGroup);

      const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
      const partners = cls.concurrentGroup ? (concurrentMap[cls.concurrentGroup] || []) : [cls.id];
      const labDays = cls.labDaysPerWeek || 0;
      const baseDuration = cls.duration || 1;
      for (let i = 0; i < need; i++) {
        // If class has lab days, the first labDays tasks are double-period, rest are single
        const taskDuration = labDays > 0 ? (i < labDays ? 2 : 1) : baseDuration;
        tasks.push({
          classId: cls.id, teacherId: cls.teacherId, groupIds: cls.groupIds || [],
          duration: taskDuration, isLab: labDays > 0 && i < labDays,
          concurrentPartners: partners.filter(id => id !== cls.id)
        });
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

  // Pre-compute early release info
  const sd = config.schoolDay;

  // Check if a period is occupied by a double-period class from the previous period
  const isOccupiedByDoublePeriod = (day, pIdx, state) => {
    const cpOrder = classPeriods.findIndex(p => p.index === pIdx);
    if (cpOrder <= 0) return false;
    const prevPIdx = classPeriods[cpOrder - 1].index;
    const prevKey = getKey(day, prevPIdx);
    const prevAssignments = state.grid[prevKey] || [];
    return prevAssignments.some(a => {
      const cls = classes.find(c => c.id === a.classId);
      return cls && (a.duration || cls.duration || 1) >= 2;
    });
  };

  // Validity check — also validates concurrent partners can be placed
  const canPlace = (task, day, pIdx, state) => {
    const occupied = getOccupied(pIdx, task.duration);
    if (!occupied) return false;
    if (state.classDays[task.classId].has(day)) return false;

    // Don't place in slots occupied by double-period continuation from previous period
    if (isOccupiedByDoublePeriod(day, pIdx, state)) return false;

    // Check early release — all occupied periods must be valid for this day
    for (const oi of occupied) {
      if (!isPeriodValidForDay(day, oi, sd, periods)) return false;
    }

    for (const oi of occupied) {
      if (task.teacherId && state.teacherSlots[task.teacherId]?.[day]?.has(oi)) return false;
      if (task.teacherId) {
        const t = teacherMap[task.teacherId];
        if (t && !isTeacherAvailable(t, oi, day, periods)) return false;
      }
      // Student group conflict — skip if the existing class is a concurrent partner
      for (const gId of task.groupIds) {
        if (state.groupSlots[gId]?.[day]?.has(oi)) {
          // Check if the conflict is from a concurrent partner (that's OK)
          const key = getKey(day, oi);
          const existing = state.grid[key] || [];
          const conflictFromNonPartner = existing.some(a => {
            const cls = classes.find(c => c.id === a.classId);
            if (!cls || !(cls.groupIds || []).includes(gId)) return false;
            return !areConcurrent(task.classId, a.classId);
          });
          if (conflictFromNonPartner) return false;
        }
      }
    }

    // Check concurrent partners can also be placed here
    for (const partnerId of (task.concurrentPartners || [])) {
      const partner = classes.find(c => c.id === partnerId);
      if (!partner) continue;
      if (state.classDays[partnerId]?.has(day)) return false;
      for (const oi of occupied) {
        if (partner.teacherId && state.teacherSlots[partner.teacherId]?.[day]?.has(oi)) return false;
        if (partner.teacherId) {
          const t = teacherMap[partner.teacherId];
          if (t && !isTeacherAvailable(t, oi, day, periods)) return false;
        }
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
    state.grid[key].push({ classId: task.classId, roomId, duration: task.duration });
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

  // Unplace a task from state (for repair phase)
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

  // Count valid placement options for a task (for MRV ordering)
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

    // HEAVILY penalize group free periods (student groups with gaps in their day)
    studentGroups.forEach(g => {
      DAYS.forEach(day => {
        classPeriods.forEach(cp => {
          if (!isPeriodValidForDay(day, cp.index, sd, periods)) return;
          // Check if this group has a class in this slot
          let hasClass = false;
          const key = getKey(day, cp.index);
          const assignments = state.grid[key] || [];
          for (const a of assignments) {
            const cls = classes.find(c => c.id === a.classId);
            if (cls && (cls.groupIds || []).includes(g.id)) { hasClass = true; break; }
          }
          // Check double period continuation
          if (!hasClass) {
            const cpOrderIdx = classPeriods.findIndex(p => p.index === cp.index);
            if (cpOrderIdx > 0) {
              const prevPIdx = classPeriods[cpOrderIdx - 1].index;
              const prevKey = getKey(day, prevPIdx);
              const prevArr = state.grid[prevKey] || [];
              for (const a of prevArr) {
                const cls = classes.find(c => c.id === a.classId);
                if (cls && (a.duration || cls.duration || 1) >= 2 && (cls.groupIds || []).includes(g.id)) { hasClass = true; break; }
              }
            }
          }
          if (!hasClass) score -= 200; // heavy penalty per free period per group
        });
      });
    });

    return score;
  };

  // ── Helper: count free periods a FT teacher would have on a day after placement ──
  const ftTeacherFreeAfter = (teacherId, day, addDuration, state) => {
    const t = teacherMap[teacherId];
    if (!t || t.type !== 'ft') return 99;
    const dayPeriodCount = classPeriods.filter(cp => isPeriodValidForDay(day, cp.index, sd, periods)).length;
    const after = (state.teacherSlots[teacherId][day]?.size || 0) + addDuration;
    return dayPeriodCount - after;
  };

  // ── Place a single task, returning true if successful ──
  const tryPlace = (task, state, randomize) => {
    const options = [];
    for (const day of DAYS) {
      if (state.classDays[task.classId].has(day)) continue;
      for (const cp of classPeriods) {
        if (canPlace(task, day, cp.index, state)) {
          options.push({ day, pIdx: cp.index });
        }
      }
    }
    if (options.length === 0) return false;

    // Sort by preference: PACK tightly — prefer slots that fill group gaps and balance load
    const existingPeriods = state.classPeriodMap[task.classId];
    options.sort((a, b) => {
      // 1. STRONGLY prefer slots that fill a group gap (period where this group has nothing)
      const groupGapA = task.groupIds.some(gId => !state.groupSlots[gId]?.[a.day]?.has(a.pIdx)) ? 0 : 1;
      const groupGapB = task.groupIds.some(gId => !state.groupSlots[gId]?.[b.day]?.has(b.pIdx)) ? 0 : 1;
      // Both fill gaps — prefer the day where the group has the MOST empty periods (tightest fit)
      if (groupGapA === 0 && groupGapB === 0) {
        const emptyA = task.groupIds.reduce((sum, gId) => {
          const dayPeriodCount = classPeriods.filter(cp => isPeriodValidForDay(a.day, cp.index, sd, periods)).length;
          return sum + dayPeriodCount - (state.groupSlots[gId]?.[a.day]?.size || 0);
        }, 0);
        const emptyB = task.groupIds.reduce((sum, gId) => {
          const dayPeriodCount = classPeriods.filter(cp => isPeriodValidForDay(b.day, cp.index, sd, periods)).length;
          return sum + dayPeriodCount - (state.groupSlots[gId]?.[b.day]?.size || 0);
        }, 0);
        if (emptyA !== emptyB) return emptyB - emptyA; // more empty = place here first to fill it
      }
      if (groupGapA !== groupGapB) return groupGapA - groupGapB;

      // 2. Balance teacher load across days — prefer days where teacher has fewer classes
      const loadA = task.teacherId ? (state.teacherSlots[task.teacherId]?.[a.day]?.size || 0) : 0;
      const loadB = task.teacherId ? (state.teacherSlots[task.teacherId]?.[b.day]?.size || 0) : 0;
      if (loadA !== loadB) return loadA - loadB;

      // 3. Prefer consistent period across days (same class same period = nice schedule)
      const matchA = existingPeriods.includes(a.pIdx) ? 0 : 1;
      const matchB = existingPeriods.includes(b.pIdx) ? 0 : 1;
      if (matchA !== matchB) return matchA - matchB;

      // 4. Minimize teacher gaps — prefer period adjacent to teacher's existing slots
      if (task.teacherId) {
        const tSlots = state.teacherSlots[task.teacherId]?.[a.day];
        const tSlotsB = state.teacherSlots[task.teacherId]?.[b.day];
        const adjA = tSlots?.size > 0 ? Math.min(...[...tSlots].map(s => Math.abs(s - a.pIdx))) : 99;
        const adjB = tSlotsB?.size > 0 ? Math.min(...[...tSlotsB].map(s => Math.abs(s - b.pIdx))) : 99;
        if (adjA !== adjB) return adjA - adjB;
      }

      return 0;
    });

    // Randomize: on later attempts, add variety to escape local minima
    if (randomize) {
      // Stronger shuffle — swap within top candidates
      const topN = Math.min(options.length, Math.max(3, Math.floor(options.length * 0.5)));
      for (let i = 0; i < topN - 1; i++) {
        if (Math.random() < 0.5) {
          const j = i + 1 + Math.floor(Math.random() * (topN - i - 1));
          if (j < topN) [options[i], options[j]] = [options[j], options[i]];
        }
      }
    }

    const opt = options[0];
    const roomId = findRoom(task, opt.day, opt.pIdx, state);
    place(task, opt.day, opt.pIdx, roomId, state);

    // Also place concurrent partners
    for (const partnerId of (task.concurrentPartners || [])) {
      const partner = classes.find(c => c.id === partnerId);
      if (!partner) continue;
      const pTask = { classId: partnerId, teacherId: partner.teacherId, groupIds: partner.groupIds || [], duration: partner.duration || 1 };
      const pRoom = findRoom(pTask, opt.day, opt.pIdx, state);
      place(pTask, opt.day, opt.pIdx, pRoom, state);
    }
    return true;
  };

  // ── Find what's blocking a task and return eviction candidates ──
  const findBlockers = (task, state) => {
    // For each day this class could go on, find which placements are blocking it
    const blockers = [];
    for (const day of DAYS) {
      if (state.classDays[task.classId].has(day)) continue;
      for (const cp of classPeriods) {
        const occupied = getOccupied(cp.index, task.duration);
        if (!occupied) continue;
        if (occupied.some(oi => !isPeriodValidForDay(day, oi, sd, periods))) continue;
        if (isOccupiedByDoublePeriod(day, cp.index, state)) continue;

        // Find what's blocking this specific slot
        const slotBlockers = [];
        let blocked = false;
        for (const oi of occupied) {
          // Teacher conflict
          if (task.teacherId && state.teacherSlots[task.teacherId]?.[day]?.has(oi)) {
            const key = getKey(day, oi);
            const existing = state.grid[key] || [];
            existing.forEach(a => {
              const cls = classes.find(c => c.id === a.classId);
              if (cls && cls.teacherId === task.teacherId) slotBlockers.push({ classId: a.classId, day, pIdx: oi, roomId: a.roomId, duration: a.duration || cls.duration || 1 });
            });
            blocked = true;
          }
          // Group conflict
          for (const gId of task.groupIds) {
            if (state.groupSlots[gId]?.[day]?.has(oi)) {
              const key = getKey(day, oi);
              const existing = state.grid[key] || [];
              existing.forEach(a => {
                const cls = classes.find(c => c.id === a.classId);
                if (cls && (cls.groupIds || []).includes(gId) && !areConcurrent(task.classId, a.classId)) {
                  slotBlockers.push({ classId: a.classId, day, pIdx: oi, roomId: a.roomId, duration: a.duration || cls.duration || 1 });
                }
              });
              blocked = true;
            }
          }
        }
        if (blocked && slotBlockers.length > 0) blockers.push(...slotBlockers);
      }
    }
    return blockers;
  };

  // ── SOLVER with greedy pass + deep repair phase ──
  const solve = (tasks, state, useRepair, randomize) => {
    let placed = 0;
    const unplacedTasks = [];

    // Greedy pass
    for (const task of tasks) {
      if (tryPlace(task, state, randomize)) {
        placed++;
      } else {
        unplacedTasks.push(task);
      }
    }

    // Repair phase: for each unplaced task, try evicting blockers and re-placing
    if (useRepair && unplacedTasks.length > 0) {
      const maxRepairs = 50; // increased from 20
      let repairs = 0;

      // Multiple repair passes — each pass may free up slots for the next
      for (let pass = 0; pass < 3 && unplacedTasks.length > 0; pass++) {
        for (let i = unplacedTasks.length - 1; i >= 0 && repairs < maxRepairs; i--) {
          const task = unplacedTasks[i];
          const blockers = findBlockers(task, state);
          if (blockers.length === 0) continue;

          // Deduplicate blockers
          const uniqueBlockers = [];
          const tried = new Set();
          for (const blocker of blockers) {
            const bKey = `${blocker.classId}-${blocker.day}-${blocker.pIdx}`;
            if (tried.has(bKey)) continue;
            tried.add(bKey);
            uniqueBlockers.push(blocker);
          }

          // Shuffle blockers on later passes for variety
          if (pass > 0) shuffle(uniqueBlockers);

          let repaired = false;
          for (const blocker of uniqueBlockers) {
            repairs++;
            if (repairs > maxRepairs) break;

            const blockerCls = classes.find(c => c.id === blocker.classId);
            if (!blockerCls) continue;
            const blockerTask = { classId: blocker.classId, teacherId: blockerCls.teacherId, groupIds: blockerCls.groupIds || [], duration: blocker.duration };

            // Save state snapshot for rollback
            const savedGrid = JSON.parse(JSON.stringify(state.grid));
            const savedClassDays = {};
            Object.entries(state.classDays).forEach(([k, v]) => { savedClassDays[k] = new Set(v); });
            const savedClassPeriodMap = JSON.parse(JSON.stringify(state.classPeriodMap));
            const savedTeacherSlots = {};
            Object.entries(state.teacherSlots).forEach(([k, v]) => {
              savedTeacherSlots[k] = {};
              Object.entries(v).forEach(([d, s]) => { savedTeacherSlots[k][d] = new Set(s); });
            });
            const savedRoomSlots = {};
            Object.entries(state.roomSlots).forEach(([k, v]) => {
              savedRoomSlots[k] = {};
              Object.entries(v).forEach(([d, s]) => { savedRoomSlots[k][d] = new Set(s); });
            });
            const savedGroupSlots = {};
            Object.entries(state.groupSlots).forEach(([k, v]) => {
              savedGroupSlots[k] = {};
              Object.entries(v).forEach(([d, s]) => { savedGroupSlots[k][d] = new Set(s); });
            });

            // Remove the blocker
            unplace(blockerTask, blocker.day, blocker.pIdx, blocker.roomId, state);

            // Try placing the stuck task
            if (tryPlace(task, state, randomize)) {
              // Try re-placing the evicted blocker somewhere else
              if (tryPlace(blockerTask, state, randomize)) {
                // Success! Both placed
                placed++;
                unplacedTasks.splice(i, 1);
                repaired = true;
                break;
              } else {
                // Try chain eviction: evict a SECOND blocker to make room for the first evicted one
                const blockers2 = findBlockers(blockerTask, state);
                let chainSuccess = false;
                for (const b2 of blockers2.slice(0, 5)) {
                  const b2Cls = classes.find(c => c.id === b2.classId);
                  if (!b2Cls || b2.classId === task.classId) continue;
                  const b2Task = { classId: b2.classId, teacherId: b2Cls.teacherId, groupIds: b2Cls.groupIds || [], duration: b2.duration };
                  repairs++;
                  unplace(b2Task, b2.day, b2.pIdx, b2.roomId, state);
                  if (tryPlace(blockerTask, state, randomize) && tryPlace(b2Task, state, randomize)) {
                    placed++;
                    unplacedTasks.splice(i, 1);
                    repaired = true;
                    chainSuccess = true;
                    break;
                  }
                  // Rollback chain attempt
                  state.grid = JSON.parse(JSON.stringify(savedGrid));
                  Object.entries(savedClassDays).forEach(([k, v]) => { state.classDays[k] = new Set(v); });
                  state.classPeriodMap = JSON.parse(JSON.stringify(savedClassPeriodMap));
                  Object.entries(savedTeacherSlots).forEach(([k, v]) => {
                    state.teacherSlots[k] = {};
                    Object.entries(v).forEach(([d, s]) => { state.teacherSlots[k][d] = new Set(s); });
                  });
                  Object.entries(savedRoomSlots).forEach(([k, v]) => {
                    state.roomSlots[k] = {};
                    Object.entries(v).forEach(([d, s]) => { state.roomSlots[k][d] = new Set(s); });
                  });
                  Object.entries(savedGroupSlots).forEach(([k, v]) => {
                    state.groupSlots[k] = {};
                    Object.entries(v).forEach(([d, s]) => { state.groupSlots[k][d] = new Set(s); });
                  });
                  // Re-remove first blocker for next chain attempt
                  unplace(blockerTask, blocker.day, blocker.pIdx, blocker.roomId, state);
                  // Re-place the stuck task
                  tryPlace(task, state, randomize);
                }
                if (chainSuccess) break;
              }
            }

            // Full rollback if not repaired
            if (!repaired) {
              state.grid = JSON.parse(JSON.stringify(savedGrid));
              Object.entries(savedClassDays).forEach(([k, v]) => { state.classDays[k] = new Set(v); });
              state.classPeriodMap = JSON.parse(JSON.stringify(savedClassPeriodMap));
              Object.entries(savedTeacherSlots).forEach(([k, v]) => {
                state.teacherSlots[k] = {};
                Object.entries(v).forEach(([d, s]) => { state.teacherSlots[k][d] = new Set(s); });
              });
              Object.entries(savedRoomSlots).forEach(([k, v]) => {
                state.roomSlots[k] = {};
                Object.entries(v).forEach(([d, s]) => { state.roomSlots[k][d] = new Set(s); });
              });
              Object.entries(savedGroupSlots).forEach(([k, v]) => {
                state.groupSlots[k] = {};
                Object.entries(v).forEach(([d, s]) => { state.groupSlots[k][d] = new Set(s); });
              });
            }
          }
        }
      }
    }

    return { placed, state };
  };

  // ── RUN MULTIPLE ATTEMPTS ──
  let bestResult = null;
  let bestScore = -Infinity;

  // Pre-compute pinned placements (these are fixed before solving)
  const pinnedPlacements = [];
  classes.forEach(cls => {
    if (!cls.pinned || cls.pinned.length === 0) return;
    cls.pinned.forEach(pin => {
      // Find the period index that matches this period number
      const cp = classPeriods.find(p => p.num === pin.period);
      if (!cp) return;
      pinnedPlacements.push({
        classId: cls.id, teacherId: cls.teacherId, groupIds: cls.groupIds || [],
        duration: cls.duration || 1, day: pin.day, pIdx: cp.index,
        concurrentPartners: cls.concurrentGroup ? (concurrentMap[cls.concurrentGroup] || []).filter(id => id !== cls.id) : []
      });
    });
  });

  for (let attempt = 0; attempt < NUM_ATTEMPTS; attempt++) {
    const tasks = buildTasks();
    const state = freshState();

    // Pre-place pinned classes — these are locked in and won't be moved
    let pinnedOk = true;
    for (const pin of pinnedPlacements) {
      // Skip if already placed (e.g., concurrent partner was pinned too)
      if (state.classDays[pin.classId]?.has(pin.day)) continue;

      const roomId = findRoom(pin, pin.day, pin.pIdx, state);
      place(pin, pin.day, pin.pIdx, roomId, state);

      // Also place concurrent partners
      for (const partnerId of pin.concurrentPartners) {
        if (state.classDays[partnerId]?.has(pin.day)) continue;
        const partner = classes.find(c => c.id === partnerId);
        if (!partner) continue;
        const pTask = { classId: partnerId, teacherId: partner.teacherId, groupIds: partner.groupIds || [], duration: partner.duration || 1 };
        const pRoom = findRoom(pTask, pin.day, pin.pIdx, state);
        place(pTask, pin.day, pin.pIdx, pRoom, state);
      }
    }

    // Remove tasks that were already placed by pins
    const pinnedKeys = new Set();
    pinnedPlacements.forEach(p => pinnedKeys.add(`${p.classId}-${p.day}`));
    // Also mark concurrent partners
    pinnedPlacements.forEach(p => {
      p.concurrentPartners.forEach(pid => pinnedKeys.add(`${pid}-${p.day}`));
    });

    // Filter out tasks that correspond to pinned placements
    const remainingTasks = [];
    const taskDayCounts = {}; // track how many tasks per class we've kept vs pinned
    for (const task of tasks) {
      const key = task.classId;
      if (!taskDayCounts[key]) taskDayCounts[key] = { pinned: 0, kept: 0 };

      // Count how many pins this class has
      const classPins = pinnedPlacements.filter(p => p.classId === task.classId).length;
      if (taskDayCounts[key].pinned < classPins) {
        taskDayCounts[key].pinned++;
        continue; // skip this task — it's covered by a pin
      }
      remainingTasks.push(task);
      taskDayCounts[key].kept++;
    }

    // Sort tasks: MRV on first attempt, shuffled MRV on rest
    // Group by class, sort classes by constraint difficulty, keep same-class tasks together
    const byClass = {};
    remainingTasks.forEach(t => { if (!byClass[t.classId]) byClass[t.classId] = []; byClass[t.classId].push(t); });

    // Always compute MRV, but vary the ordering strategy
    const classIds = Object.keys(byClass);
    const mrvScores = {};
    classIds.forEach(cId => {
      mrvScores[cId] = byClass[cId].reduce((sum, t) => sum + countOptions(t, state), 0);
    });

    if (attempt < 3) {
      // Pure MRV: most constrained classes first
      classIds.sort((a, b) => mrvScores[a] - mrvScores[b]);
    } else if (attempt < 20) {
      // MRV with partial shuffle: sort by MRV, then swap some neighbors
      classIds.sort((a, b) => mrvScores[a] - mrvScores[b]);
      for (let k = 0; k < classIds.length - 1; k++) {
        if (Math.random() < 0.4) {
          [classIds[k], classIds[k + 1]] = [classIds[k + 1], classIds[k]];
        }
      }
    } else {
      // Full random shuffle for maximum diversity
      shuffle(classIds);
    }

    remainingTasks.length = 0;
    classIds.forEach(cId => {
      // Within each class: lab/double period tasks first (harder to place)
      byClass[cId].sort((a, b) => b.duration - a.duration);
      byClass[cId].forEach(t => remainingTasks.push(t));
    });

    const useRepair = attempt < 40; // use repair on first 40 attempts
    const randomize = attempt > 0;
    const result = solve(remainingTasks, state, useRepair, randomize);
    const totalPlaced = result.placed + pinnedPlacements.length;
    const totalTasks = remainingTasks.length + pinnedPlacements.length;
    const score = scoreSchedule(result.state, totalPlaced, totalTasks);

    if (score > bestScore) {
      bestScore = score;
      // Snapshot the grid directly (avoid heavy JSON round-trip for Sets)
      const gridCopy = {};
      Object.entries(result.state.grid).forEach(([k, v]) => { gridCopy[k] = v.map(a => ({ ...a })); });
      bestResult = { state: { ...result.state, grid: gridCopy, classPeriodMap: JSON.parse(JSON.stringify(result.state.classPeriodMap)) }, placed: totalPlaced, totalTasks };
    }

    // Perfect solution found — stop early only if ALL placed and score is very high
    if (result.placed === remainingTasks.length && score > bestScore - 100 && attempt >= 5) break;
    // Time limit
    if (Date.now() - startTime > TIME_LIMIT) break;
    // Yield to browser event loop so UI stays responsive
    await yieldToUI();
  }

  // Reconstruct sets from arrays (JSON serialization converted Sets to arrays)
  const finalGrid = bestResult.state.grid;

  // Find empty slots (skip early release periods)
  const emptySlots = [];
  DAYS.forEach(day => {
    classPeriods.forEach(cp => {
      if (!isPeriodValidForDay(day, cp.index, sd, periods)) return;
      const key = getKey(day, cp.index);
      if (!finalGrid[key] || finalGrid[key].length === 0) {
        const prevCp = classPeriods[classPeriods.findIndex(p => p.index === cp.index) - 1];
        if (prevCp) {
          const prevKey = getKey(day, prevCp.index);
          const prevArr = finalGrid[prevKey] || [];
          const isDoubleExt = prevArr.some(a => {
            const cls = classes.find(c => c.id === a.classId);
            return cls && (a.duration || cls.duration || 1) >= 2;
          });
          if (isDoubleExt) return;
        }
        emptySlots.push({ day, periodNum: cp.num, periodIndex: cp.index });
      }
    });
  });

  // Find unplaced classes and diagnose WHY they couldn't be placed
  const unplaced = [];
  const placedDays = {};
  classes.forEach(c => { placedDays[c.id] = new Set(); });
  Object.entries(finalGrid).forEach(([key, assignments]) => {
    const [day] = key.split('-');
    (assignments || []).forEach(a => { if (a?.classId && placedDays[a.classId]) placedDays[a.classId].add(day); });
  });

  // Reconstruct tracking state from the final grid to diagnose failures
  const diagState = freshState();
  Object.entries(finalGrid).forEach(([key, assignments]) => {
    const [day, pIdxStr] = key.split('-');
    const pIdx = parseInt(pIdxStr);
    (assignments || []).forEach(a => {
      const cls = classes.find(c => c.id === a.classId);
      if (!cls) return;
      const dur = cls.duration || 1;
      const occupied = getOccupied(pIdx, dur);
      if (!occupied) return;
      diagState.classDays[a.classId]?.add(day);
      if (diagState.classPeriodMap[a.classId]) diagState.classPeriodMap[a.classId].push(pIdx);
      for (const oi of occupied) {
        if (cls.teacherId && diagState.teacherSlots[cls.teacherId]) diagState.teacherSlots[cls.teacherId][day]?.add(oi);
        if (a.roomId && diagState.roomSlots[a.roomId]) diagState.roomSlots[a.roomId][day]?.add(oi);
        for (const gId of (cls.groupIds || [])) {
          if (diagState.groupSlots[gId]) diagState.groupSlots[gId][day]?.add(oi);
        }
      }
    });
  });

  // Diagnose why a class can't be placed on remaining days
  const diagnose = (cls) => {
    const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
    const have = placedDays[cls.id].size;
    if (have >= need) return null;
    const missing = need - have;
    const reasons = [];
    const teacher = teacherMap[cls.teacherId];
    const teacherName = teacher?.name || 'Unassigned teacher';
    const groupNames = (cls.groupIds || []).map(gId => {
      const g = studentGroups.find(sg => sg.id === gId);
      return g ? g.name : gId;
    });

    // Check each remaining day
    const remainingDays = DAYS.filter(d => !placedDays[cls.id].has(d));
    for (const day of remainingDays) {
      const dayReasons = [];
      let anyPeriodWorks = false;

      for (const cp of classPeriods) {
        const occupied = getOccupied(cp.index, cls.duration || 1);
        if (!occupied) continue;

        // Early release
        const earlyBlocked = occupied.some(oi => !isPeriodValidForDay(day, oi, sd, periods));
        if (earlyBlocked) continue; // skip — this period simply doesn't exist on this day

        // Teacher conflict
        const teacherBusy = occupied.some(oi => cls.teacherId && diagState.teacherSlots[cls.teacherId]?.[day]?.has(oi));
        if (teacherBusy) {
          if (!dayReasons.includes('teacher')) dayReasons.push('teacher');
          continue;
        }

        // Teacher unavailable
        const teacherUnavail = occupied.some(oi => {
          if (!cls.teacherId) return false;
          const t = teacherMap[cls.teacherId];
          return t && !isTeacherAvailable(t, oi, day, periods);
        });
        if (teacherUnavail) {
          if (!dayReasons.includes('unavailable')) dayReasons.push('unavailable');
          continue;
        }

        // Student group conflict
        let groupConflict = false;
        for (const oi of occupied) {
          for (const gId of (cls.groupIds || [])) {
            if (diagState.groupSlots[gId]?.[day]?.has(oi)) {
              // Check if it's from a concurrent partner (that's OK)
              const key = getKey(day, oi);
              const existing = finalGrid[key] || [];
              const realConflict = existing.some(a => {
                const eCls = classes.find(c => c.id === a.classId);
                if (!eCls || !(eCls.groupIds || []).includes(gId)) return false;
                return !areConcurrent(cls.id, a.classId);
              });
              if (realConflict) { groupConflict = true; break; }
            }
          }
          if (groupConflict) break;
        }
        if (groupConflict) {
          if (!dayReasons.includes('group')) dayReasons.push('group');
          continue;
        }

        // If we get here, this period should work
        anyPeriodWorks = true;
        break;
      }

      if (!anyPeriodWorks && dayReasons.length > 0) {
        const reasonText = dayReasons.map(r => {
          if (r === 'teacher') return `${teacherName} is teaching another class every open period`;
          if (r === 'unavailable') return `${teacherName} is marked unavailable`;
          if (r === 'group') return `${groupNames.join(', ')} ${groupNames.length > 1 ? 'are' : 'is'} in another class every open period`;
          return r;
        }).join('; ');
        reasons.push(`${DAY_LABELS[day] || day}: ${reasonText}`);
      } else if (!anyPeriodWorks) {
        reasons.push(`${DAY_LABELS[day] || day}: no valid periods available`);
      }
    }

    return { name: cls.name, missing, placed: have, needed: need, reasons };
  };

  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };

  classes.forEach(cls => {
    const need = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
    const have = placedDays[cls.id].size;
    if (have < need) {
      const diag = diagnose(cls);
      if (diag) unplaced.push(diag);
    }
  });

  // Find student group (grade) gaps — periods where a group has nothing scheduled
  const groupGaps = [];
  studentGroups.forEach(group => {
    DAYS.forEach(day => {
      classPeriods.forEach(cp => {
        // Skip early release periods
        if (!isPeriodValidForDay(day, cp.index, sd, periods)) return;
        // Check if any class in this cell includes this group
        const key = getKey(day, cp.index);
        const assignments = finalGrid[key] || [];
        const hasClass = assignments.some(a => {
          const cls = classes.find(c => c.id === a.classId);
          return cls && (cls.groupIds || []).includes(group.id);
        });

        // Also check if a double-period from previous period covers this slot
        if (!hasClass) {
          const prevCpObj = classPeriods[classPeriods.findIndex(p => p.index === cp.index) - 1];
          if (prevCpObj) {
            const prevKey = getKey(day, prevCpObj.index);
            const prevAssignments = finalGrid[prevKey] || [];
            const coveredByDouble = prevAssignments.some(a => {
              const cls = classes.find(c => c.id === a.classId);
              return cls && (a.duration || cls.duration || 1) >= 2 && (cls.groupIds || []).includes(group.id);
            });
            if (coveredByDouble) return;
          }
        }

        if (!hasClass) {
          groupGaps.push({ groupName: group.name, groupColor: group.color, day, periodNum: cp.num });
        }
      });
    });
  });

  // ── MONTE CARLO SUGGESTIONS — if classes couldn't be placed, try alternate configs ──
  const suggestions = [];
  if (unplaced.length > 0) {
    const unplacedIds = new Set(unplaced.map(u => u.name));

    // Suggestion 1: Try reducing days/week for unplaced classes
    for (const item of unplaced) {
      const cls = classes.find(c => c.name === item.name);
      if (!cls) continue;
      const currentDays = cls.daysPerWeek || 5;
      if (currentDays > 1) {
        suggestions.push({
          type: 'reduce_days',
          className: cls.name,
          current: currentDays,
          suggested: currentDays - 1,
          text: `Try reducing ${cls.name} from ${currentDays} to ${currentDays - 1} days/week`
        });
      }
    }

    // Suggestion 2: Check if a teacher is overloaded
    const teacherLoad = {};
    classes.forEach(cls => {
      if (!cls.teacherId) return;
      if (!teacherLoad[cls.teacherId]) teacherLoad[cls.teacherId] = { name: '', totalPeriods: 0, classes: [] };
      const t = teachers.find(t => t.id === cls.teacherId);
      teacherLoad[cls.teacherId].name = t?.name || 'Unknown';
      const dpw = cls.daysPerWeek || 5;
      const lab = cls.labDaysPerWeek || 0;
      const dur = cls.duration || 1;
      const totalPeriods = lab > 0 ? (dpw - lab) * 1 + lab * 2 : dpw * dur;
      teacherLoad[cls.teacherId].totalPeriods += totalPeriods;
      teacherLoad[cls.teacherId].classes.push(cls.name);
    });
    const maxPeriodsPerWeek = classPeriods.length * 5;
    Object.entries(teacherLoad).forEach(([tid, info]) => {
      if (info.totalPeriods > maxPeriodsPerWeek * 0.85) {
        suggestions.push({
          type: 'teacher_overloaded',
          text: `${info.name} is assigned ${info.totalPeriods} periods/week (max available: ${maxPeriodsPerWeek}). Consider moving a class to another teacher.`
        });
      }
    });

    // Suggestion 3: Check student group overload
    const groupLoad = {};
    studentGroups.forEach(g => { groupLoad[g.id] = { name: g.name, totalPeriods: 0 }; });
    classes.forEach(cls => {
      const dpw = cls.daysPerWeek || 5;
      const lab = cls.labDaysPerWeek || 0;
      const dur = cls.duration || 1;
      const totalPeriods = lab > 0 ? (dpw - lab) * 1 + lab * 2 : dpw * dur;
      (cls.groupIds || []).forEach(gId => {
        if (groupLoad[gId]) groupLoad[gId].totalPeriods += totalPeriods;
      });
    });
    Object.entries(groupLoad).forEach(([gid, info]) => {
      if (info.totalPeriods > maxPeriodsPerWeek) {
        suggestions.push({
          type: 'group_overloaded',
          text: `${info.name} has ${info.totalPeriods} class-periods/week but only ${maxPeriodsPerWeek} slots available. Reduce class days or move a class to semester-only.`
        });
      }
    });

    // Suggestion 4: If lab classes couldn't be placed, suggest removing lab
    unplaced.forEach(item => {
      const cls = classes.find(c => c.name === item.name);
      if (cls && (cls.labDaysPerWeek || 0) > 0) {
        suggestions.push({
          type: 'remove_lab',
          text: `${cls.name} has a lab day (double period). Try making it all single periods to free up slots.`
        });
      }
    });

    // Suggestion 5: If full-year class, suggest making it semester-only
    unplaced.forEach(item => {
      const cls = classes.find(c => c.name === item.name);
      if (cls && (cls.semester || 'full') === 'full') {
        suggestions.push({
          type: 'semester_split',
          text: `${cls.name} is full-year. Could it be offered only one semester to free up schedule space?`
        });
      }
    });
  }

  return { grid: finalGrid, unplaced, emptySlots, groupGaps, attempts: NUM_ATTEMPTS, score: bestScore, suggestions };
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
  // Conflicts are now computed inside GridPanel (depends on active semester)

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
      {tab === 'grid' && <GridPanel config={local} update={update} periods={periods} />}
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

      <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Early Release Day</h3>
      <div className="sched-form-grid">
        <div className="sched-field">
          <label>Day</label>
          <select value={sd.earlyReleaseDay || ''} onChange={e => upd('earlyReleaseDay', e.target.value)}>
            <option value="">None</option>
            {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
          </select>
        </div>
        <div className="sched-field">
          <label>End Time</label>
          <input type="time" value={sd.earlyReleaseEndTime || sd.endTime}
            disabled={!sd.earlyReleaseDay}
            onChange={e => upd('earlyReleaseEndTime', e.target.value)} />
        </div>
        {sd.earlyReleaseDay && sd.earlyReleaseEndTime && (
          <div className="sched-field">
            <label>Periods on {DAY_SHORT[sd.earlyReleaseDay]}</label>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C', paddingTop: 6 }}>
              {computePeriods(sd, sd.earlyReleaseEndTime).filter(p => p.type === 'class').length} class periods
            </div>
          </div>
        )}
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
  const classPeriods = useMemo(() => periods.filter(p => p.type === 'class'), [periods]);

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

      {/* Teacher Availability Synopsis */}
      {(config.teachers || []).length > 0 && classPeriods.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Teacher Availability Synopsis</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid #E5E7EB', background: '#F9FAFB', position: 'sticky', left: 0, zIndex: 1, minWidth: 120 }}>Teacher</th>
                  {DAYS.map(day => {
                    const sd = config.schoolDay;
                    const dayValid = !sd.earlyReleaseDay || sd.earlyReleaseDay !== day;
                    const dayPeriodCount = dayValid ? classPeriods.length : classPeriods.filter(cp => isPeriodValidForDay(day, cp.index, sd, periods)).length;
                    return (
                      <th key={day} colSpan={dayPeriodCount} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '2px solid #E5E7EB', borderLeft: '2px solid #E5E7EB', background: '#F9FAFB', fontSize: 11 }}>
                        {DAY_SHORT[day]}
                      </th>
                    );
                  })}
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '2px solid #E5E7EB', borderLeft: '2px solid #E5E7EB', background: '#F9FAFB', fontSize: 10, color: '#6B7280' }}>Avail</th>
                </tr>
                <tr>
                  <th style={{ padding: '2px 10px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', position: 'sticky', left: 0, zIndex: 1 }}></th>
                  {DAYS.map(day => {
                    const sd = config.schoolDay;
                    return classPeriods.filter(cp => isPeriodValidForDay(day, cp.index, sd, periods)).map((cp, i) => (
                      <th key={`${day}-${cp.index}`} style={{ padding: '2px 4px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', fontSize: 10, color: '#9CA3AF', fontWeight: 500, borderLeft: i === 0 ? '2px solid #E5E7EB' : '1px solid #F3F4F6', background: '#F9FAFB' }}>
                        P{cp.num}
                      </th>
                    ));
                  })}
                  <th style={{ padding: '2px 8px', borderBottom: '1px solid #E5E7EB', borderLeft: '2px solid #E5E7EB', background: '#F9FAFB' }}></th>
                </tr>
              </thead>
              <tbody>
                {(config.teachers || []).map((teacher, tIdx) => {
                  const color = TEACHER_COLORS[tIdx % TEACHER_COLORS.length];
                  let availCount = 0, totalCount = 0;
                  const cells = DAYS.flatMap(day => {
                    const sd = config.schoolDay;
                    return classPeriods.filter(cp => isPeriodValidForDay(day, cp.index, sd, periods)).map((cp, i) => {
                      totalCount++;
                      const avail = isTeacherAvailable(teacher, cp.index, day, periods);
                      if (avail) availCount++;
                      return (
                        <td key={`${day}-${cp.index}`} style={{
                          padding: '4px 6px', textAlign: 'center',
                          background: avail ? '#D1FAE5' : '#FEE2E2',
                          color: avail ? '#065F46' : '#991B1B',
                          fontWeight: 600, fontSize: 11,
                          borderLeft: i === 0 ? '2px solid #E5E7EB' : '1px solid #F3F4F6',
                          borderBottom: '1px solid #F3F4F6',
                        }}>
                          {avail ? '✓' : '✕'}
                        </td>
                      );
                    });
                  });
                  const pct = totalCount > 0 ? Math.round((availCount / totalCount) * 100) : 0;
                  return (
                    <tr key={teacher.id}>
                      <td style={{ padding: '4px 10px', fontWeight: 600, fontSize: 12, color: color.text, background: color.bg + '44', borderBottom: '1px solid #F3F4F6', position: 'sticky', left: 0, zIndex: 1, whiteSpace: 'nowrap' }}>
                        {teacher.name}
                        <span className={`badge ${teacher.type === 'ft' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9, marginLeft: 6, padding: '1px 4px' }}>
                          {teacher.type === 'ft' ? 'FT' : 'PT'}
                        </span>
                      </td>
                      {cells}
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, borderLeft: '2px solid #E5E7EB', borderBottom: '1px solid #F3F4F6',
                        color: pct === 100 ? '#065F46' : pct >= 70 ? '#92400E' : '#991B1B',
                        background: pct === 100 ? '#D1FAE5' : pct >= 70 ? '#FEF3C7' : '#FEE2E2' }}>
                        {availCount}/{totalCount} ({pct}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: '#6B7280' }}>
            <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#D1FAE5', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}></span> Available</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#FEE2E2', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}></span> Unavailable</span>
          </div>
        </div>
      )}
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

// Small inline component for adding a pin
function PinAdder({ onAdd }) {
  const [day, setDay] = useState('mon');
  const [period, setPeriod] = useState(1);
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <select value={day} onChange={e => setDay(e.target.value)} style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
        {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
      </select>
      <span style={{ fontSize: 11, color: '#6B7280' }}>P</span>
      <input type="number" value={period} min={1} max={12} onChange={e => setPeriod(parseInt(e.target.value) || 1)}
        style={{ width: 40, fontSize: 11, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }} />
      <button className="btn btn-sm btn-primary" onClick={() => onAdd(day, period)}
        style={{ fontSize: 10, padding: '2px 6px' }}>+ Pin</button>
    </div>
  );
}

// ============================================================
// CLASSES PANEL — with days/week and inline editing
// ============================================================
function ClassesPanel({ config, update }) {
  const [nc, setNc] = useState({ name: '', teacherId: '', groupIds: [], daysPerWeek: 5, duration: 1, labDaysPerWeek: 0, semester: 'full', concurrentGroup: '', category: '' });
  const [editingId, setEditingId] = useState(null);
  const [sortBy, setSortBy] = useState(null); // null | 'class' | 'class-desc' | 'teacher' | 'teacher-desc' | 'category' | 'category-desc'

  const sortedClasses = useMemo(() => {
    const classes = (config.classes || []).map((cls, idx) => ({ ...cls, _origIdx: idx }));
    if (!sortBy) return classes;
    const teachers = config.teachers || [];
    const getTeacherName = (tid) => { const t = teachers.find(t => t.id === tid); return t?.name?.toLowerCase() || 'zzz'; };
    const getCat = (cls) => (cls.category || 'zzz').toLowerCase();
    if (sortBy === 'class') classes.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    else if (sortBy === 'class-desc') classes.sort((a, b) => b.name.toLowerCase().localeCompare(a.name.toLowerCase()));
    else if (sortBy === 'teacher') classes.sort((a, b) => getTeacherName(a.teacherId).localeCompare(getTeacherName(b.teacherId)));
    else if (sortBy === 'teacher-desc') classes.sort((a, b) => getTeacherName(b.teacherId).localeCompare(getTeacherName(a.teacherId)));
    else if (sortBy === 'category') classes.sort((a, b) => getCat(a).localeCompare(getCat(b)));
    else if (sortBy === 'category-desc') classes.sort((a, b) => getCat(b).localeCompare(getCat(a)));
    return classes;
  }, [config.classes, config.teachers, sortBy]);

  const toggleSort = (col) => {
    setSortBy(prev => {
      if (prev === col) return col + '-desc';
      if (prev === col + '-desc') return null;
      return col;
    });
  };

  const addClass = () => {
    if (!nc.name.trim()) return;
    update(c => { c.classes.push({ id: genId(), name: nc.name.trim(), teacherId: nc.teacherId, groupIds: nc.groupIds, daysPerWeek: nc.daysPerWeek, duration: nc.duration, labDaysPerWeek: nc.labDaysPerWeek || 0, semester: nc.semester || 'full', concurrentGroup: nc.concurrentGroup || '', category: nc.category || '' }); });
    setNc({ name: '', teacherId: '', groupIds: [], daysPerWeek: 5, duration: 1, labDaysPerWeek: 0, semester: 'full', concurrentGroup: '', category: '' });
  };

  // Get existing concurrent group labels for the dropdown
  const existingConcurrentGroups = useMemo(() => {
    const groups = new Set();
    (config.classes || []).forEach(cls => { if (cls.concurrentGroup) groups.add(cls.concurrentGroup); });
    return [...groups].sort();
  }, [config.classes]);

  const toggleGroup = (gId) => setNc(p => ({ ...p, groupIds: p.groupIds.includes(gId) ? p.groupIds.filter(g => g !== gId) : [...p.groupIds, gId] }));

  const updateClass = (cIdx, field, value) => { update(c => { c.classes[cIdx][field] = value; }); };
  const toggleEditGroup = (cIdx, gId) => {
    update(c => {
      const groups = c.classes[cIdx].groupIds || [];
      c.classes[cIdx].groupIds = groups.includes(gId) ? groups.filter(g => g !== gId) : [...groups, gId];
    });
  };

  const moveClass = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= (config.classes || []).length) return;
    update(c => {
      const item = c.classes.splice(fromIdx, 1)[0];
      c.classes.splice(toIdx, 0, item);
    });
  };

  // Build grade summary
  const gradeSummary = useMemo(() => {
    const groups = config.studentGroups || [];
    const classes_ = config.classes || [];
    return groups.map(group => {
      const groupClasses = classes_.filter(cls => (cls.groupIds || []).includes(group.id));
      const totalPeriodsPerWeek = groupClasses.reduce((sum, cls) => {
        const dpw = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
        const dur = cls.duration || 1;
        return sum + dpw * dur;
      }, 0);
      return { group, classes: groupClasses, totalPeriodsPerWeek };
    });
  }, [config.studentGroups, config.classes]);

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Classes ({(config.classes || []).length})</h3>
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
            <select value={nc.labDaysPerWeek > 0 ? 'lab' : nc.duration}
              onChange={e => {
                if (e.target.value === 'lab') setNc({ ...nc, duration: 1, labDaysPerWeek: 1 });
                else setNc({ ...nc, duration: parseInt(e.target.value), labDaysPerWeek: 0 });
              }} style={{ width: 120 }}>
              <option value={1}>Single</option>
              <option value={2}>Double (all)</option>
              <option value="lab">+ Lab day</option>
            </select>
          </div>
          {nc.labDaysPerWeek > 0 && (
            <div className="sched-field" style={{ flex: 0 }}>
              <label style={{ fontSize: 11 }}>Lab days</label>
              <input type="number" value={nc.labDaysPerWeek} min={1} max={Math.max(1, nc.daysPerWeek - 1)}
                onChange={e => setNc({ ...nc, labDaysPerWeek: Math.min(nc.daysPerWeek - 1, Math.max(1, parseInt(e.target.value) || 1)) })}
                style={{ width: 50 }} />
            </div>
          )}
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Concurrent</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={existingConcurrentGroups.includes(nc.concurrentGroup) ? nc.concurrentGroup : (nc.concurrentGroup ? '__custom__' : '')}
                onChange={e => { if (e.target.value === '__custom__') return; setNc({ ...nc, concurrentGroup: e.target.value }); }}
                style={{ width: 80 }}>
                <option value="">None</option>
                {existingConcurrentGroups.map(g => <option key={g} value={g}>{g}</option>)}
                <option value="__custom__">New...</option>
              </select>
              {(nc.concurrentGroup && !existingConcurrentGroups.includes(nc.concurrentGroup)) || nc.concurrentGroup === '__custom__' ? (
                <input type="text" placeholder="e.g. A" value={nc.concurrentGroup === '__custom__' ? '' : nc.concurrentGroup}
                  onChange={e => setNc({ ...nc, concurrentGroup: e.target.value.toUpperCase() })}
                  style={{ width: 50, fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }} />
              ) : null}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Category</label>
            <select value={nc.category} onChange={e => setNc({ ...nc, category: e.target.value })} style={{ width: 110 }}>
              <option value="">— None —</option>
              {SUBJECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sched-field" style={{ flex: 0 }}>
            <label style={{ fontSize: 11 }}>Semester</label>
            <select value={nc.semester} onChange={e => setNc({ ...nc, semester: e.target.value })} style={{ width: 90 }}>
              <option value="full">Full Year</option>
              <option value="s1">Sem 1</option>
              <option value="s2">Sem 2</option>
            </select>
          </div>
          <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 8 }}>Students:</span>
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
            <thead><tr><th style={{ width: 30 }}>#</th><th style={{ width: 40 }}></th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('class')}>Class {sortBy === 'class' ? '▲' : sortBy === 'class-desc' ? '▼' : ''}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('teacher')}>Teacher {sortBy === 'teacher' ? '▲' : sortBy === 'teacher-desc' ? '▼' : ''}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('category')}>Category {sortBy === 'category' ? '▲' : sortBy === 'category-desc' ? '▼' : ''}</th>
                <th>Students</th><th>Days/Wk</th><th>Duration</th><th>Sem</th><th>Concurrent</th><th></th></tr></thead>
            <tbody>
              {sortedClasses.map((cls, displayIdx) => {
                const cIdx = cls._origIdx;
                const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
                const isEditing = editingId === cls.id;
                const daysPerWeek = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
                const pins = cls.pinned || [];
                return (
                  <React.Fragment key={cls.id}>
                  <tr>
                    <td style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{displayIdx + 1}</td>
                    <td>
                      {sortBy ? <span style={{ color: '#D1D5DB', fontSize: 10 }}>—</span> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button onClick={() => moveClass(cIdx, cIdx - 1)} disabled={cIdx === 0}
                          style={{ background: 'none', border: 'none', cursor: cIdx === 0 ? 'default' : 'pointer', fontSize: 10, color: cIdx === 0 ? '#D1D5DB' : '#6B7280', padding: 0, lineHeight: 1 }}>▲</button>
                        <button onClick={() => moveClass(cIdx, cIdx + 1)} disabled={cIdx === (config.classes || []).length - 1}
                          style={{ background: 'none', border: 'none', cursor: cIdx === (config.classes || []).length - 1 ? 'default' : 'pointer', fontSize: 10, color: cIdx === (config.classes || []).length - 1 ? '#D1D5DB' : '#6B7280', padding: 0, lineHeight: 1 }}>▼</button>
                      </div>
                      )}
                    </td>
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
                        <select value={cls.category || ''} onChange={e => updateClass(cIdx, 'category', e.target.value)}
                          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
                          <option value="">—</option>
                          {SUBJECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        cls.category
                          ? <span className="badge" style={{ fontSize: 10, background: CATEGORY_BG[cls.category] || '#F3F4F6', color: CATEGORY_COLORS[cls.category] || '#6B7280' }}>{cls.category}</span>
                          : <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span>
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
                        <>
                          <select value={(cls.labDaysPerWeek || 0) > 0 ? 'lab' : (cls.duration || 1)}
                            onChange={e => {
                              if (e.target.value === 'lab') { updateClass(cIdx, 'duration', 1); updateClass(cIdx, 'labDaysPerWeek', 1); }
                              else { updateClass(cIdx, 'duration', parseInt(e.target.value)); updateClass(cIdx, 'labDaysPerWeek', 0); }
                            }}
                            style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
                            <option value={1}>Single</option>
                            <option value={2}>Double</option>
                            <option value="lab">+ Lab</option>
                          </select>
                          {(cls.labDaysPerWeek || 0) > 0 && (
                            <input type="number" value={cls.labDaysPerWeek} min={1} max={Math.max(1, daysPerWeek - 1)}
                              onChange={e => updateClass(cIdx, 'labDaysPerWeek', Math.min(daysPerWeek - 1, Math.max(1, parseInt(e.target.value) || 1)))}
                              title="Lab days per week"
                              style={{ width: 36, fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4, marginLeft: 4 }} />
                          )}
                        </>
                      ) : (
                        (cls.labDaysPerWeek || 0) > 0
                          ? <span style={{ fontSize: 12 }}>{daysPerWeek - cls.labDaysPerWeek}× single + {cls.labDaysPerWeek}× lab</span>
                          : (cls.duration || 1) === 2 ? 'Double' : 'Single'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select value={cls.semester || 'full'} onChange={e => updateClass(cIdx, 'semester', e.target.value)}
                          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }}>
                          <option value="full">Full</option>
                          <option value="s1">S1</option>
                          <option value="s2">S2</option>
                        </select>
                      ) : (
                        <span className="badge" style={{ fontSize: 10,
                          background: (cls.semester || 'full') === 'full' ? '#E5E7EB' : (cls.semester === 's1' ? '#DBEAFE' : '#FCE7F3'),
                          color: (cls.semester || 'full') === 'full' ? '#6B7280' : (cls.semester === 's1' ? '#1E40AF' : '#9D174D') }}>
                          {(cls.semester || 'full') === 'full' ? 'Full' : cls.semester === 's1' ? 'S1' : 'S2'}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <select value={existingConcurrentGroups.includes(cls.concurrentGroup) ? cls.concurrentGroup : (cls.concurrentGroup ? '__custom__' : '')}
                            onChange={e => { if (e.target.value !== '__custom__') updateClass(cIdx, 'concurrentGroup', e.target.value); }}
                            style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4, width: 60 }}>
                            <option value="">None</option>
                            {existingConcurrentGroups.map(g => <option key={g} value={g}>{g}</option>)}
                            <option value="__custom__">New...</option>
                          </select>
                          {cls.concurrentGroup && !existingConcurrentGroups.includes(cls.concurrentGroup) ? (
                            <input type="text" value={cls.concurrentGroup} onChange={e => updateClass(cIdx, 'concurrentGroup', e.target.value.toUpperCase())}
                              style={{ width: 40, fontSize: 12, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4 }} />
                          ) : null}
                        </div>
                      ) : (
                        cls.concurrentGroup ? <span className="badge badge-gray" style={{ fontSize: 11 }}>{cls.concurrentGroup}</span> : <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span>
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
                  {/* Pinned slots row — shows when editing or when pins exist */}
                  {(isEditing || pins.length > 0) && (
                    <tr>
                      <td colSpan={9} style={{ paddingTop: 0, paddingBottom: 8, borderTop: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 70 }}>
                          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>📌 Pinned:</span>
                          {pins.map((pin, pnIdx) => (
                            <span key={pnIdx} className="badge" style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {DAY_SHORT[pin.day]} P{pin.period}
                              {isEditing && (
                                <button onClick={() => update(c => { c.classes[cIdx].pinned.splice(pnIdx, 1); })}
                                  style={{ background: 'none', border: 'none', color: '#1E40AF', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                              )}
                            </span>
                          ))}
                          {isEditing && (
                            <PinAdder onAdd={(day, period) => update(c => {
                              if (!c.classes[cIdx].pinned) c.classes[cIdx].pinned = [];
                              // Don't add duplicate
                              if (!c.classes[cIdx].pinned.some(p => p.day === day && p.period === period)) {
                                c.classes[cIdx].pinned.push({ day, period });
                              }
                            })} />
                          )}
                          {pins.length === 0 && !isEditing && <span style={{ fontSize: 11, color: '#D1D5DB' }}>None</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grade Summary */}
      {gradeSummary.length > 0 && (config.classes || []).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Classes by Grade</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {gradeSummary.map(({ group, classes: groupClasses, totalPeriodsPerWeek }) => (
              <div key={group.id} className="card" style={{ border: `2px solid ${group.color}22`, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="badge" style={{ background: group.color + '22', color: group.color, fontWeight: 600, fontSize: 13 }}>{group.name}</span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>{groupClasses.length} classes · {totalPeriodsPerWeek} periods/wk</span>
                </div>
                {groupClasses.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No classes assigned</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {groupClasses.map((cls, i) => {
                      const t = (config.teachers || []).find(t => t.id === cls.teacherId);
                      const dpw = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
                      return (
                        <div key={cls.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 6px', background: i % 2 === 0 ? '#F9FAFB' : 'transparent', borderRadius: 4 }}>
                          <span style={{ fontWeight: 500, color: '#1B3A5C' }}>
                            {cls.name}
                            {cls.concurrentGroup && <span className="badge badge-gray" style={{ fontSize: 9, marginLeft: 4, padding: '1px 4px' }}>{cls.concurrentGroup}</span>}
                          </span>
                          <span style={{ color: '#6B7280', fontSize: 11 }}>{t?.name || '—'} · {dpw}×{(cls.labDaysPerWeek || 0) > 0 ? ` (${cls.labDaysPerWeek} lab)` : (cls.duration || 1) === 2 ? ' (dbl)' : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GRID PANEL — full M-F grid
// ============================================================
function GridPanel({ config, update, periods }) {
  const [pickerCell, setPickerCell] = useState(null); // "day-pIdx"
  const [genResult, setGenResult] = useState(null); // { unplaced, emptySlots }
  const [dragData, setDragData] = useState(null); // { classId, fromDay, fromPIdx, roomId }
  const [dropTarget, setDropTarget] = useState(null); // "day-pIdx"
  const [semester, setSemester] = useState('s1'); // which semester we're building
  const gridKey = semester === 's1' ? 'gridS1' : 'gridS2';
  const grid = config[gridKey] || config.grid || {}; // fallback to legacy grid
  const classPeriods = periods.filter(p => p.type === 'class');

  // Conflict detection for current semester grid
  const conflicts = useMemo(() => {
    const issues = {};
    DAYS.forEach(day => {
      const periodMap = {};
      periods.filter(p => p.type === 'class').forEach(p => { periodMap[p.index] = []; });
      Object.entries(grid).forEach(([key, assignments]) => {
        if (!key.startsWith(day + '-')) return;
        const pIdx = parseInt(key.split('-')[1]);
        const arr = Array.isArray(assignments) ? assignments : [assignments];
        arr.forEach(a => {
          if (!a?.classId) return;
          const cls = (config.classes || []).find(c => c.id === a.classId);
          const occupied = getOccupiedIndices(pIdx, a.duration || cls?.duration || 1, periods);
          occupied.forEach(oi => { if (periodMap[oi]) periodMap[oi].push({ ...a, sourceIdx: pIdx }); });
        });
      });
      Object.entries(periodMap).forEach(([pIdxStr, assignments]) => {
        const pIdx = parseInt(pIdxStr);
        const key = gk(day, pIdx);
        const dayIssues = [];
        const teacherSlots = {}, roomSlots = {}, groupSlots = {};
        assignments.forEach(a => {
          const cls = (config.classes || []).find(c => c.id === a.classId);
          if (!cls) return;
          if (cls.teacherId) {
            if (teacherSlots[cls.teacherId]) {
              const other = (config.classes || []).find(c => c.id === teacherSlots[cls.teacherId]);
              const t = (config.teachers || []).find(t => t.id === cls.teacherId);
              dayIssues.push(`${t?.name || 'Teacher'} double-booked (${cls.name} & ${other?.name})`);
            }
            teacherSlots[cls.teacherId] = a.classId;
            const t = (config.teachers || []).find(t => t.id === cls.teacherId);
            if (t && !isTeacherAvailable(t, pIdx, day, periods)) dayIssues.push(`${t.name} unavailable`);
          }
          if (a.roomId) {
            if (roomSlots[a.roomId]) {
              const other = (config.classes || []).find(c => c.id === roomSlots[a.roomId]);
              const r = (config.rooms || []).find(r => r.id === a.roomId);
              dayIssues.push(`${r?.name} double-booked (${cls.name} & ${other?.name})`);
            }
            roomSlots[a.roomId] = a.classId;
          }
          (cls.groupIds || []).forEach(gId => {
            if (groupSlots[gId]) {
              const otherCls = (config.classes || []).find(c => c.id === groupSlots[gId]);
              const isConcurrent = cls.concurrentGroup && otherCls?.concurrentGroup && cls.concurrentGroup === otherCls.concurrentGroup;
              if (!isConcurrent) {
                const g = (config.studentGroups || []).find(g => g.id === gId);
                dayIssues.push(`${g?.name} double-booked (${cls.name} & ${otherCls?.name})`);
              }
            }
            groupSlots[gId] = a.classId;
          });
        });
        if (dayIssues.length > 0) { if (!issues[key]) issues[key] = []; issues[key].push(...dayIssues); }
      });
    });
    return issues;
  }, [config, grid, periods]);

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    const hasExisting = Object.keys(grid).length > 0;
    if (hasExisting && !window.confirm(`This will clear the ${semester === 's1' ? 'Semester 1' : 'Semester 2'} schedule and generate a new one. Continue?`)) return;

    setGenerating(true);
    setGenResult(null);
    await new Promise(r => setTimeout(r, 50));

    const result = await autoGenerate(config, periods, semester);
    setGenerating(false);
    if (!result) { setGenResult({ error: 'Add classes and set up school day settings first.' }); setTimeout(() => setGenResult(null), 3000); return; }

    update(c => { c[gridKey] = result.grid; });
    setGenResult({ unplaced: result.unplaced, emptySlots: result.emptySlots, groupGaps: result.groupGaps, attempts: result.attempts, score: result.score, suggestions: result.suggestions });
  };

  const getAssignments = (day, pIdx) => {
    const val = grid[gk(day, pIdx)];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const addToCell = (day, pIdx, classId, roomId) => {
    update(c => {
      if (!c[gridKey]) c[gridKey] = {};
      const key = gk(day, pIdx);
      const existing = c[gridKey][key] ? (Array.isArray(c[gridKey][key]) ? c[gridKey][key] : [c[gridKey][key]]) : [];
      existing.push({ classId, roomId });
      c[gridKey][key] = existing;
    });
    setPickerCell(null);
  };

  const removeFromCell = (day, pIdx, classId) => {
    update(c => {
      const key = gk(day, pIdx);
      if (!c[gridKey]?.[key]) return;
      const arr = Array.isArray(c[gridKey][key]) ? c[gridKey][key] : [c[gridKey][key]];
      c[gridKey][key] = arr.filter(a => a.classId !== classId);
      if (c[gridKey][key].length === 0) delete c[gridKey][key];
    });
  };

  // ── Auto-scroll during drag ──
  useEffect(() => {
    let scrollInterval = null;
    const EDGE_ZONE = 60; // px from viewport edge to trigger scroll
    const SCROLL_SPEED = 12; // px per frame

    const onDrag = (e) => {
      if (!e.clientY) return; // drag events sometimes have 0,0
      const { clientY } = e;
      const vh = window.innerHeight;

      if (clientY < EDGE_ZONE) {
        // Near top — scroll up
        if (!scrollInterval) scrollInterval = setInterval(() => window.scrollBy(0, -SCROLL_SPEED), 16);
      } else if (clientY > vh - EDGE_ZONE) {
        // Near bottom — scroll down
        if (!scrollInterval) scrollInterval = setInterval(() => window.scrollBy(0, SCROLL_SPEED), 16);
      } else {
        if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
      }
    };

    const onDragEnd = () => {
      if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
    };

    document.addEventListener('drag', onDrag);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    return () => {
      document.removeEventListener('drag', onDrag);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
      if (scrollInterval) clearInterval(scrollInterval);
    };
  }, []);

  // ── Drag-and-drop handlers ──
  // Supports dragging FROM the grid (move) and FROM the class palette (add new)
  const handleDragStart = (e, classId, day, pIdx, roomId) => {
    setDragData({ classId, fromDay: day, fromPIdx: pIdx, roomId, isNew: false });
    e.dataTransfer.effectAllowed = 'move';
    if (e.target) e.dataTransfer.setDragImage(e.target, 0, 0);
  };

  const handlePaletteDragStart = (e, classId) => {
    const cls = (config.classes || []).find(c => c.id === classId);
    const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
    const roomId = teacher?.defaultRoom || '';
    setDragData({ classId, fromDay: null, fromPIdx: null, roomId, isNew: true });
    e.dataTransfer.effectAllowed = 'copy';
    if (e.target) e.dataTransfer.setDragImage(e.target, 0, 0);
  };

  const handleDragOver = (e, day, pIdx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragData?.isNew ? 'copy' : 'move';
    const key = gk(day, pIdx);
    if (dropTarget !== key) setDropTarget(key);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e, day, pIdx) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragData) return;
    const { classId, fromDay, fromPIdx, roomId, isNew } = dragData;
    setDragData(null);

    if (!isNew && fromDay === day && fromPIdx === pIdx) return;

    update(c => {
      if (!c[gridKey]) c[gridKey] = {};
      const g = c[gridKey];
      // Remove from source (only if moving, not if adding new from palette)
      if (!isNew && fromDay && fromPIdx !== null) {
        const srcKey = gk(fromDay, fromPIdx);
        if (g[srcKey]) {
          const srcArr = Array.isArray(g[srcKey]) ? g[srcKey] : [g[srcKey]];
          g[srcKey] = srcArr.filter(a => a.classId !== classId);
          if (g[srcKey].length === 0) delete g[srcKey];
        }
      }
      // Add to destination
      const destKey = gk(day, pIdx);
      const destArr = g[destKey] ? (Array.isArray(g[destKey]) ? g[destKey] : [g[destKey]]) : [];
      destArr.push({ classId, roomId });
      g[destKey] = destArr;
    });
  };

  const handleDragEnd = () => {
    setDragData(null);
    setDropTarget(null);
  };

  // Clear all classes from current semester grid
  const handleClearAll = () => {
    if (!window.confirm(`Clear ALL classes from the ${semester === 's1' ? 'Semester 1' : 'Semester 2'} grid? This cannot be undone.`)) return;
    update(c => { c[gridKey] = {}; });
    setGenResult(null);
    window.dispatchEvent(new CustomEvent('toast', { detail: `${semester === 's1' ? 'Semester 1' : 'Semester 2'} grid cleared` }));
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

  // Detect student group gaps (grades with nothing to do during a period)
  const liveGroupGaps = useMemo(() => {
    const groups = config.studentGroups || [];
    const classes_ = config.classes || [];
    if (groups.length === 0 || Object.keys(grid).length === 0) return [];
    const gaps = [];
    groups.forEach(group => {
      DAYS.forEach(day => {
        classPeriods.forEach(cp => {
          // Skip periods that don't exist on early release day
          if (!isPeriodValidForDay(day, cp.index, config.schoolDay, periods)) return;
          const key = gk(day, cp.index);
          const assignments = grid[key] ? (Array.isArray(grid[key]) ? grid[key] : [grid[key]]) : [];
          let hasClass = assignments.some(a => {
            const cls = classes_.find(c => c.id === a.classId);
            return cls && (cls.groupIds || []).includes(group.id);
          });
          // Check double-period continuation
          if (!hasClass) {
            const prevCpObj = classPeriods[classPeriods.findIndex(p => p.index === cp.index) - 1];
            if (prevCpObj) {
              const prevKey = gk(day, prevCpObj.index);
              const prevArr = grid[prevKey] ? (Array.isArray(grid[prevKey]) ? grid[prevKey] : [grid[prevKey]]) : [];
              hasClass = prevArr.some(a => {
                const cls = classes_.find(c => c.id === a.classId);
                return cls && (a.duration || cls.duration || 1) >= 2 && (cls.groupIds || []).includes(group.id);
              });
            }
          }
          if (!hasClass) gaps.push({ groupName: group.name, groupColor: group.color, day, periodNum: cp.num });
        });
      });
    });
    return gaps;
  }, [config.studentGroups, config.classes, grid, classPeriods]);

  // Check if a period is "blocked" by a double-period class from the previous period
  const isBlockedByDouble = (day, pIdx) => {
    const prevClassPeriod = classPeriods[classPeriods.findIndex(p => p.index === pIdx) - 1];
    if (!prevClassPeriod) return null;
    const prevAssignments = getAssignments(day, prevClassPeriod.index);
    for (const a of prevAssignments) {
      const cls = (config.classes || []).find(c => c.id === a.classId);
      if (cls && (a.duration || cls.duration || 1) >= 2) return { cls, assignment: a };
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>Schedule Grid</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #D1D5DB' }}>
            <button onClick={() => { setSemester('s1'); setGenResult(null); }}
              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: semester === 's1' ? '#1B3A5C' : '#F3F4F6', color: semester === 's1' ? '#fff' : '#6B7280' }}>Sem 1</button>
            <button onClick={() => { setSemester('s2'); setGenResult(null); }}
              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', borderLeft: '1px solid #D1D5DB',
                background: semester === 's2' ? '#1B3A5C' : '#F3F4F6', color: semester === 's2' ? '#fff' : '#6B7280' }}>Sem 2</button>
          </div>
          <button className="btn btn-gold btn-sm" onClick={handleGenerate} disabled={generating}>{generating ? '⏳ Generating...' : '⚡ Auto-Generate'}</button>
          {Object.keys(grid).length > 0 && (
            <button className="btn btn-sm" onClick={handleClearAll}
              style={{ color: '#DC2626', border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 11 }}>
              🗑 Clear All
            </button>
          )}
        </div>
      </div>

      {/* Draggable Class Palette */}
      {(config.classes || []).length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', marginBottom: 6 }}>
            Drag classes onto the grid below — conflicts shown in red
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(config.classes || []).filter(cls => {
              const s = cls.semester || 'full';
              return s === 'full' || s === semester;
            }).map(cls => {
              const tc = getTeacherColor(cls.teacherId, config.teachers || []);
              const teacher = (config.teachers || []).find(t => t.id === cls.teacherId);
              const scheduled = classDayCounts[cls.id]?.size || 0;
              const needed = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
              const isFull = scheduled >= needed;
              return (
                <div key={cls.id} draggable
                  onDragStart={(e) => handlePaletteDragStart(e, cls.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                    borderRadius: 6, fontSize: 11, cursor: 'grab', userSelect: 'none',
                    background: isFull ? '#E5E7EB' : tc.bg,
                    border: `1px solid ${isFull ? '#D1D5DB' : tc.border}`,
                    color: isFull ? '#9CA3AF' : tc.text,
                    opacity: isFull ? 0.6 : 1,
                  }}>
                  <span style={{ fontWeight: 600 }}>{cls.name}</span>
                  <span style={{ opacity: 0.7, fontSize: 10 }}>{scheduled}/{needed}</span>
                  {teacher && <span style={{ fontSize: 9, opacity: 0.6 }}>({teacher.name})</span>}
                  {isFull && <span style={{ fontSize: 10 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  <span style={{ color: '#DC2626', fontWeight: 500 }}>Could not fully place:</span>
                  {genResult.unplaced.map((item, i) => (
                    <div key={i} style={{ marginTop: 4, marginLeft: 8 }}>
                      <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B', marginRight: 6 }}>
                        {item.name} ({item.placed}/{item.needed} days)
                      </span>
                      {item.reasons && item.reasons.length > 0 && (
                        <div style={{ marginLeft: 16, marginTop: 2, fontSize: 12, color: '#6B7280' }}>
                          {item.reasons.map((r, j) => <div key={j}>↳ {r}</div>)}
                        </div>
                      )}
                    </div>
                  ))}
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
              {genResult.groupGaps && genResult.groupGaps.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontWeight: 500, color: '#DC2626' }}>⚠ Free periods by group:</span>
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {(() => {
                      // Group by student group name
                      const byGroup = {};
                      genResult.groupGaps.forEach(g => {
                        if (!byGroup[g.groupName]) byGroup[g.groupName] = { color: g.groupColor, days: {} };
                        if (!byGroup[g.groupName].days[g.day]) byGroup[g.groupName].days[g.day] = [];
                        byGroup[g.groupName].days[g.day].push(g.periodNum);
                      });
                      return Object.entries(byGroup).map(([name, info]) => (
                        <div key={name} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: (info.color || '#6B7280') + '22', color: info.color || '#6B7280', fontWeight: 600 }}>{name}</span>
                          {Object.entries(info.days).map(([day, pNums]) => (
                            <span key={day} style={{ fontSize: 11, color: '#6B7280' }}>
                              {DAY_SHORT[day]}: P{pNums.join(', P')}
                            </span>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
              {genResult.suggestions && genResult.suggestions.length > 0 && (
                <div style={{ marginTop: 8, padding: 8, background: '#EFF6FF', borderRadius: 6, border: '1px solid #BFDBFE' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1E40AF', marginBottom: 4 }}>💡 Suggestions to fix placement:</div>
                  {genResult.suggestions.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#1E40AF', paddingLeft: 8, marginTop: 2 }}>• {s.text}</div>
                  ))}
                </div>
              )}
              {genResult.emptySlots.length === 0 && genResult.unplaced.length === 0 && (!genResult.groupGaps || genResult.groupGaps.length === 0) && (
                <div style={{ color: '#065F46' }}>All periods filled — no open slots. All groups have full schedules.</div>
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

      {liveGroupGaps.length > 0 && Object.keys(grid).length > 0 && !genResult && (
        <div style={{ marginBottom: 16, padding: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#991B1B' }}>⚠ Groups with free periods:</span>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const byGroup = {};
              liveGroupGaps.forEach(g => {
                if (!byGroup[g.groupName]) byGroup[g.groupName] = { color: g.groupColor, days: {} };
                if (!byGroup[g.groupName].days[g.day]) byGroup[g.groupName].days[g.day] = [];
                byGroup[g.groupName].days[g.day].push(g.periodNum);
              });
              return Object.entries(byGroup).map(([name, info]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: (info.color || '#6B7280') + '22', color: info.color || '#6B7280', fontWeight: 600, minWidth: 60 }}>{name}</span>
                  {Object.entries(info.days).map(([day, pNums]) => (
                    <span key={day} style={{ fontSize: 11, color: '#6B7280' }}>
                      {DAY_SHORT[day]}: P{pNums.join(', P')}
                    </span>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {(config.teachers || []).length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Teachers:</span>
          {(config.teachers || []).map(t => {
            const tc = getTeacherColor(t.id, config.teachers);
            return (
              <span key={t.id} style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}>{t.name}</span>
            );
          })}
        </div>
      )}

      <div className="sched-grid-wrapper">
        <table className="sched-grid-table">
          <thead>
            <tr>
              <th className="sched-grid-time-col">Time</th>
              {DAYS.map(d => <th key={d} className="sched-grid-day-col">
                {DAY_LABELS[d]}
                {config.schoolDay.earlyReleaseDay === d && (
                  <div style={{ fontSize: 10, fontWeight: 400, color: '#CA8A04' }}>Early Release</div>
                )}
              </th>)}
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
                      const periodValid = isPeriodValidForDay(day, period.index, config.schoolDay, periods);
                      const assignments = getAssignments(day, period.index);
                      const cellConflicts = conflicts[key] || [];
                      const blocked = isBlockedByDouble(day, period.index);

                      if (!periodValid) {
                        return (
                          <td key={day} style={{ background: '#F3F4F6', textAlign: 'center', verticalAlign: 'middle' }}>
                            <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>Early Release</span>
                          </td>
                        );
                      }

                      const isDropHover = dropTarget === key && dragData && !(dragData.fromDay === day && dragData.fromPIdx === period.index);
                      return (
                        <td key={day} className={`sched-grid-cell ${cellConflicts.length > 0 ? 'has-conflict' : ''}`}
                          onDragOver={(e) => handleDragOver(e, day, period.index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, day, period.index)}
                          style={isDropHover ? { background: '#DBEAFE', outline: '2px dashed #3B82F6', outlineOffset: '-2px' } : undefined}>
                          {blocked && (() => {
                            const btc = getTeacherColor(blocked.cls.teacherId, config.teachers || []);
                            return (
                              <div className="sched-grid-double-cont" style={{ background: btc.bg, borderLeft: `3px solid ${btc.border}` }}>
                                <span style={{ fontSize: 11, color: btc.text, fontStyle: 'italic' }}>
                                  ← {blocked.cls.name} (cont.)
                                </span>
                              </div>
                            );
                          })()}

                          {/* Show classes — filter out the double-period source class if present */}
                          {(() => {
                            const visibleAssignments = blocked
                              ? assignments.filter(a => a.classId !== blocked.assignment.classId)
                              : assignments;
                            return visibleAssignments.map(a => {
                              const cls = (config.classes || []).find(c => c.id === a.classId);
                              const room = (config.rooms || []).find(r => r.id === a.roomId);
                              const teacher = cls ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
                              if (!cls) return null;
                              const tc = getTeacherColor(cls.teacherId, config.teachers || []);
                              const isDragging = dragData?.classId === a.classId && dragData?.fromDay === day && dragData?.fromPIdx === period.index;
                              return (
                                <div key={a.classId} className={`sched-grid-class-chip ${(a.duration || cls.duration || 1) === 2 ? 'double' : ''}`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, a.classId, day, period.index, a.roomId)}
                                  onDragEnd={handleDragEnd}
                                  style={{ background: tc.bg, borderLeft: `3px solid ${tc.border}`, cursor: 'grab',
                                    opacity: isDragging ? 0.4 : 1 }}>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 12, color: tc.text }}>{cls.name}</div>
                                    <div style={{ fontSize: 10, color: tc.text, opacity: 0.7 }}>{teacher?.name} · {room?.name || '?'}</div>
                                  </div>
                                  <button className="remove-btn" style={{ fontSize: 12, color: tc.text }} onClick={() => removeFromCell(day, period.index, a.classId)}>×</button>
                                </div>
                              );
                            });
                          })()}

                          {!blocked && (
                            pickerCell === key ? (
                              <CellPicker config={config} day={day} periodIndex={period.index} periods={periods}
                                onAdd={(cId, rId) => addToCell(day, period.index, cId, rId)}
                                onCancel={() => setPickerCell(null)} />
                            ) : (
                              <button className="schedule-add-btn" onClick={() => setPickerCell(key)}>+</button>
                            )
                          )}

                          {cellConflicts.length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              {cellConflicts.map((c, i) => <div key={i} style={{ fontSize: 10, color: '#DC2626' }}>{c}</div>)}
                            </div>
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

      {/* Class count summary panel */}
      {Object.keys(grid).length > 0 && (config.classes || []).length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C', marginBottom: 8 }}>Schedule Summary</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.classes || []).map(cls => {
              const scheduled = classDayCounts[cls.id]?.size || 0;
              const needed = cls.daysPerWeek || (cls.days ? cls.days.length : 5);
              const teacher = cls.teacherId ? (config.teachers || []).find(t => t.id === cls.teacherId) : null;
              const tc = getTeacherColor(cls.teacherId, config.teachers || []);
              const isFull = scheduled >= needed;
              const isEmpty = scheduled === 0;
              return (
                <div key={cls.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 6, fontSize: 12, border: `1px solid ${isFull ? tc.border : '#FDE68A'}`,
                  background: isFull ? tc.bg : isEmpty ? '#FEF2F2' : '#FFFBEB' }}>
                  <span style={{ fontWeight: 600, color: isFull ? tc.text : '#92400E' }}>{cls.name}</span>
                  <span style={{ color: isFull ? tc.text : '#92400E', opacity: 0.8 }}>
                    {scheduled}/{needed}d{(cls.labDaysPerWeek || 0) > 0 ? ` (${cls.labDaysPerWeek} lab)` : (cls.duration || 1) === 2 ? ' (dbl)' : ''}
                  </span>
                  {teacher && <span style={{ color: '#9CA3AF', fontSize: 10 }}>({teacher.name})</span>}
                  {isFull && <span style={{ fontSize: 10 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
