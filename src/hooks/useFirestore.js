import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

// ============================================================
// VIRTUE KEY MAPPING
// ============================================================
const VIRTUE_SHORT = { discipline: 'D', attention: 'A', charity: 'C', inquiry: 'I' };
const VIRTUE_LONG = { D: 'discipline', A: 'attention', C: 'charity', I: 'inquiry' };

function parseStudentScores(allScores, studentName) {
  const result = {};
  for (const [dateStr, dateData] of Object.entries(allScores || {})) {
    const sd = dateData?.[studentName];
    if (sd) {
      result[dateStr] = {};
      for (const [k, v] of Object.entries(sd)) {
        if (VIRTUE_LONG[k]) result[dateStr][VIRTUE_LONG[k]] = v;
        else if (k === 'E') result[dateStr].absent = v;
      }
    }
  }
  return result;
}

// ============================================================
// MASTER ROSTER HOOK
// ============================================================
export function useMasterRoster() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'students'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(data);
    } catch (err) { console.error('Error loading master roster:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents, refreshKey]);

  const addStudent = useCallback(async (studentData) => {
    await addDoc(collection(db, 'students'), {
      name: studentData.name.trim(),
      house: studentData.house || '',
      gender: studentData.gender || 'he',
      parentEmail: studentData.parentEmail || '',
      studentEmail: studentData.studentEmail || '',
      createdAt: new Date().toISOString(),
    });
    setRefreshKey(k => k + 1);
  }, []);

  const updateStudent = useCallback(async (studentId, updates) => {
    await updateDoc(doc(db, 'students', studentId), updates);
    setRefreshKey(k => k + 1);
  }, []);

  const removeStudent = useCallback(async (studentId) => {
    await deleteDoc(doc(db, 'students', studentId));
    setRefreshKey(k => k + 1);
  }, []);

  const bulkImport = useCallback(async (names, house) => {
    for (const name of names) {
      if (!name.trim()) continue;
      const existing = students.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
      if (!existing) {
        await addDoc(collection(db, 'students'), {
          name: name.trim(), house: house || '', gender: 'he',
          parentEmail: '', studentEmail: '', createdAt: new Date().toISOString(),
        });
      }
    }
    setRefreshKey(k => k + 1);
  }, [students]);

  return { students, loading, addStudent, updateStudent, removeStudent, bulkImport, refresh: () => setRefreshKey(k => k + 1) };
}

// ============================================================
// TEACHER DATA HOOK — FIXED: immediate saves, stable loading
// ============================================================
export function useTeacherData(uid, masterStudents) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const masterStudentsRef = useRef(masterStudents);
  const pendingSaves = useRef(new Map()); // Track pending saves to prevent overwrite

  // Update ref without triggering reload
  useEffect(() => {
    masterStudentsRef.current = masterStudents;
  }, [masterStudents]);

  const loadClasses = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'teachers', uid, 'classes'));
      const data = [];
      for (const d of snap.docs) {
        const raw = d.data();
        const roster = raw.roster || [];
        data.push({
          id: d.id,
          name: raw.cls || raw.name || 'Unnamed Class',
          quarter: raw.quarter || 'Q4',
          roster,
          rawScores: raw.scores || {},
          students: roster.map((name, idx) => {
            const master = (masterStudentsRef.current || []).find(
              s => s.name.toLowerCase() === name.toLowerCase()
            );
            return {
              id: `roster_${idx}`,
              name,
              house: master?.house || raw.houses?.[name] || '',
              gender: master?.gender || 'he',
              scores: parseStudentScores(raw.scores, name),
            };
          }),
        });
      }
      setClasses(data);
    } catch (err) { console.error('Error loading classes:', err); }
    setLoading(false);
    // Note: depends only on uid and refreshKey, NOT masterStudents
  }, [uid, refreshKey]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const addClass = useCallback(async (className) => {
    if (!uid || !className.trim()) return;
    const newRef = doc(collection(db, 'teachers', uid, 'classes'));
    await setDoc(newRef, { cls: className.trim(), quarter: 'Q4', roster: [], scores: {} });
    setRefreshKey(k => k + 1);
    return newRef.id;
  }, [uid]);

  const addStudentToClass = useCallback(async (classId, studentName) => {
    if (!uid || !studentName.trim()) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    if (cls.roster.includes(studentName.trim())) return;
    const newRoster = [...cls.roster, studentName.trim()];
    await updateDoc(doc(db, 'teachers', uid, 'classes', classId), { roster: newRoster });
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  const removeStudentFromClass = useCallback(async (classId, studentName) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const newRoster = cls.roster.filter(n => n !== studentName);
    await updateDoc(doc(db, 'teachers', uid, 'classes', classId), { roster: newRoster });
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  // FIXED: Save immediately, no debounce. Each score is a single field update.
  const saveDailyScore = useCallback(async (classId, studentId, date, virtueKey, score) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;

    // Optimistic update first
    setClasses(prev => prev.map(c => {
      if (c.id !== classId) return c;
      return {
        ...c,
        students: c.students.map(s => {
          if (s.id !== studentId) return s;
          const newScores = { ...s.scores };
          if (!newScores[date]) newScores[date] = {};
          if (virtueKey === 'absent') newScores[date].absent = score;
          else newScores[date][virtueKey] = score;
          return { ...s, scores: newScores };
        })
      };
    }));

    // Save to Firestore immediately
    try {
      const ref = doc(db, 'teachers', uid, 'classes', classId);
      if (virtueKey === 'absent') {
        await updateDoc(ref, { [`scores.${date}.${student.name}.E`]: score });
      } else {
        const shortKey = VIRTUE_SHORT[virtueKey];
        if (shortKey) {
          await updateDoc(ref, { [`scores.${date}.${student.name}.${shortKey}`]: score });
        }
      }
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }, [uid, classes]);

  const deleteClass = useCallback(async (classId) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'teachers', uid, 'classes', classId));
    setRefreshKey(k => k + 1);
  }, [uid]);

  return {
    classes, loading, loadClasses: () => setRefreshKey(k => k + 1),
    addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, deleteClass,
  };
}

// ============================================================
// NARRATIVE DATA HOOK
// ============================================================
export function useNarrativeData(uid) {
  const [narrativeConfig, setNarrativeConfig] = useState({
    teacherName: '', className: '', quarter: 'Q4', students: [],
  });
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    getDoc(doc(db, 'teachers', uid, 'config', 'narrative')).then(snap => {
      if (snap.exists()) setNarrativeConfig(snap.data());
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [uid]);

  const saveNarrative = useCallback((data) => {
    if (!uid) return;
    setNarrativeConfig(data);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await setDoc(doc(db, 'teachers', uid, 'config', 'narrative'), data);
    }, 800);
  }, [uid]);

  return { narrativeConfig, setNarrativeConfig: saveNarrative, loading };
}

// ============================================================
// HOUSE POINTS HOOK
// ============================================================
export function useHousePoints() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'housePointEntries'), orderBy('createdAt', 'desc'), limit(500));
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addEntry = useCallback(async (entry) => {
    await addDoc(collection(db, 'housePointEntries'), {
      ...entry, points: Number(entry.points), createdAt: new Date().toISOString(),
    });
    await load();
  }, [load]);

  return { entries, loading, addEntry, refresh: load };
}

// ============================================================
// CONDUCT ENTRIES HOOK (kept for backward compat, reads from housePointEntries)
// ============================================================
export function useConductEntries() {
  const { entries, loading, addEntry, refresh } = useHousePoints();
  return { entries, loading, addEntry, refresh };
}

// ============================================================
// ADMIN DATA HOOK
// ============================================================
export function useAdminData() {
  const [allTeachers, setAllTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const knownTeachers = [];
      const teacherIds = [
        'RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2',
        'hvThHfEBFAY7VrG3YQ3djt0Icxi1',
        'xn858oNYT3XOP6afwXh9qnT06cx2'
      ];
      for (const uid of teacherIds) {
        const teacherData = { uid, classes: [] };
        try {
          const classSnap = await getDocs(collection(db, 'teachers', uid, 'classes'));
          for (const cDoc of classSnap.docs) {
            const raw = cDoc.data();
            teacherData.classes.push({
              id: cDoc.id,
              name: raw.cls || raw.name || 'Unnamed Class',
              students: (raw.roster || []).map((name, idx) => ({
                id: `roster_${idx}`, name,
                scores: parseStudentScores(raw.scores, name),
              })),
            });
          }
          knownTeachers.push(teacherData);
        } catch (e) { console.warn('Could not read teacher:', uid); }
      }
      setAllTeachers(knownTeachers);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  return { allTeachers, loading, refresh: loadAll };
}
