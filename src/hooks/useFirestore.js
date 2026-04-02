import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

// ============================================================
// VIRTUE KEY MAPPING — old format uses single letters
// ============================================================
const VIRTUE_SHORT = { discipline: 'D', attention: 'A', charity: 'C', inquiry: 'I' };
const VIRTUE_LONG = { D: 'discipline', A: 'attention', C: 'charity', I: 'inquiry' };

function useDebouncedSave(delay = 800) {
  const timer = useRef(null);
  return useCallback((fn) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  }, [delay]);
}

function parseStudentScores(allScores, studentName) {
  const result = {};
  for (const [dateStr, dateData] of Object.entries(allScores || {})) {
    const studentData = dateData?.[studentName];
    if (studentData) {
      result[dateStr] = {};
      for (const [shortKey, value] of Object.entries(studentData)) {
        if (VIRTUE_LONG[shortKey]) {
          result[dateStr][VIRTUE_LONG[shortKey]] = value;
        } else if (shortKey === 'E') {
          result[dateStr].absent = value;
        }
      }
    }
  }
  return result;
}

// ============================================================
// MASTER ROSTER HOOK — school-wide student list (admin-managed)
// Firestore: students/{studentId} = { name, house, gender, parentEmail, studentEmail }
// ============================================================
export function useMasterRoster() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const ref = collection(db, 'students');
      const snap = await getDocs(ref);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(data);
    } catch (err) {
      console.error('Error loading master roster:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents, refreshKey]);

  const addStudent = useCallback(async (studentData) => {
    const ref = collection(db, 'students');
    await addDoc(ref, {
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
    const ref = doc(db, 'students', studentId);
    await updateDoc(ref, updates);
    setRefreshKey(k => k + 1);
  }, []);

  const removeStudent = useCallback(async (studentId) => {
    const ref = doc(db, 'students', studentId);
    await deleteDoc(ref);
    setRefreshKey(k => k + 1);
  }, []);

  // Bulk import from old roster data
  const bulkImport = useCallback(async (names, house) => {
    for (const name of names) {
      if (!name.trim()) continue;
      // Check if already exists
      const existing = students.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
      if (!existing) {
        await addDoc(collection(db, 'students'), {
          name: name.trim(),
          house: house || '',
          gender: 'he',
          parentEmail: '',
          studentEmail: '',
          createdAt: new Date().toISOString(),
        });
      }
    }
    setRefreshKey(k => k + 1);
  }, [students]);

  return { students, loading, addStudent, updateStudent, removeStudent, bulkImport, refresh: () => setRefreshKey(k => k + 1) };
}

// ============================================================
// TEACHER DATA HOOK — reads old HTML format + master roster
// ============================================================
export function useTeacherData(uid, masterStudents) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const debouncedSave = useDebouncedSave();

  const loadClasses = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const classesRef = collection(db, 'teachers', uid, 'classes');
      const snap = await getDocs(classesRef);
      const data = [];
      for (const d of snap.docs) {
        const raw = d.data();
        const roster = raw.roster || [];
        const classData = {
          id: d.id,
          name: raw.cls || raw.name || 'Unnamed Class',
          quarter: raw.quarter || 'Q4',
          roster,
          rawScores: raw.scores || {},
          students: roster.map((name, idx) => {
            // Look up in master roster for house/gender
            const master = (masterStudents || []).find(
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
        };
        data.push(classData);
      }
      setClasses(data);
    } catch (err) {
      console.error('Error loading classes:', err);
    }
    setLoading(false);
  }, [uid, masterStudents]);

  useEffect(() => { loadClasses(); }, [loadClasses, refreshKey]);

  const addClass = useCallback(async (className) => {
    if (!uid || !className.trim()) return;
    const classesRef = collection(db, 'teachers', uid, 'classes');
    const newRef = doc(classesRef);
    await setDoc(newRef, { cls: className.trim(), quarter: 'Q4', roster: [], scores: {} });
    setRefreshKey(k => k + 1);
    return newRef.id;
  }, [uid]);

  const addStudentToClass = useCallback(async (classId, studentName) => {
    if (!uid || !studentName.trim()) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    if (cls.roster.includes(studentName.trim())) return; // Already in class
    const newRoster = [...cls.roster, studentName.trim()];
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await updateDoc(ref, { roster: newRoster });
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  const removeStudentFromClass = useCallback(async (classId, studentName) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const newRoster = cls.roster.filter(n => n !== studentName);
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await updateDoc(ref, { roster: newRoster });
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  const saveDailyScore = useCallback((classId, studentId, date, virtueKey, score) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;

    debouncedSave(async () => {
      const ref = doc(db, 'teachers', uid, 'classes', classId);
      if (virtueKey === 'absent') {
        await updateDoc(ref, { [`scores.${date}.${student.name}.E`]: score });
      } else {
        const shortKey = VIRTUE_SHORT[virtueKey];
        if (shortKey) {
          await updateDoc(ref, { [`scores.${date}.${student.name}.${shortKey}`]: score });
        }
      }
    });

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
  }, [uid, classes, debouncedSave]);

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
  const debouncedSave = useDebouncedSave();

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
    debouncedSave(async () => {
      await setDoc(doc(db, 'teachers', uid, 'config', 'narrative'), data);
    });
  }, [uid, debouncedSave]);

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
// CONDUCT ENTRIES HOOK
// ============================================================
export function useConductEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'conductEntries'), orderBy('date', 'desc'), limit(500));
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addEntry = useCallback(async (entry) => {
    await addDoc(collection(db, 'conductEntries'), {
      ...entry, createdAt: new Date().toISOString(),
    });
    await load();
  }, [load]);

  return { entries, loading, addEntry, refresh: load };
}

// ============================================================
// ADMIN DATA HOOK — reads all teachers' data
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
        } catch (e) {
          console.warn('Could not read teacher:', uid);
        }
      }
      setAllTeachers(knownTeachers);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  return { allTeachers, loading, refresh: loadAll };
}
