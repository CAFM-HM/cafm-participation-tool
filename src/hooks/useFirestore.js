import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ============================================================
// VIRTUE KEY MAPPING — old format uses single letters
// ============================================================
const VIRTUE_SHORT = { discipline: 'D', attention: 'A', charity: 'C', inquiry: 'I' };
const VIRTUE_LONG = { D: 'discipline', A: 'attention', C: 'charity', I: 'inquiry' };

// Debounce helper
function useDebouncedSave(delay = 800) {
  const timer = useRef(null);
  const save = useCallback((fn) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  }, [delay]);
  return save;
}

// ============================================================
// Convert old format scores into React-friendly format
// Old: scores[date][studentName] = { A: 3, C: 5, D: 4, I: 3 }
// New: per student: { scores: { [date]: { attention: 3, charity: 5, discipline: 4, inquiry: 3 } } }
// ============================================================
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
// TEACHER DATA HOOK — reads old HTML format
// Class doc: { cls: "Ancient History", quarter: "Q4", roster: [...], scores: {...} }
// ============================================================
export function useTeacherData(uid) {
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
        const classData = {
          id: d.id,
          name: raw.cls || raw.name || 'Unnamed Class',
          quarter: raw.quarter || 'Q4',
          roster: raw.roster || [],
          rawScores: raw.scores || {},
          students: (raw.roster || []).map((name, idx) => ({
            id: `roster_${idx}`,
            name: name,
            pronoun: raw.pronouns?.[name] || 'he',
            house: raw.houses?.[name] || '',
            scores: parseStudentScores(raw.scores, name),
          })),
        };
        data.push(classData);
      }
      setClasses(data);
    } catch (err) {
      console.error('Error loading classes:', err);
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { loadClasses(); }, [loadClasses, refreshKey]);

  // Add a new class (old format)
  const addClass = useCallback(async (className) => {
    if (!uid || !className.trim()) return;
    const classesRef = collection(db, 'teachers', uid, 'classes');
    const newRef = doc(classesRef);
    await setDoc(newRef, {
      cls: className.trim(),
      quarter: 'Q4',
      roster: [],
      scores: {},
    });
    setRefreshKey(k => k + 1);
    return newRef.id;
  }, [uid]);

  // Add a student to roster
  const addStudent = useCallback(async (classId, studentName, pronoun = 'he', house = '') => {
    if (!uid || !studentName.trim()) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const newRoster = [...cls.roster, studentName.trim()];
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    const updates = { roster: newRoster };
    if (pronoun !== 'he') {
      updates[`pronouns.${studentName.trim()}`] = pronoun;
    }
    if (house) {
      updates[`houses.${studentName.trim()}`] = house;
    }
    await updateDoc(ref, updates);
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  // Save daily score (old format: scores.{date}.{studentName}.{D/A/C/I} = value)
  const saveDailyScore = useCallback((classId, studentId, date, virtueKey, score) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;
    const studentName = student.name;

    debouncedSave(async () => {
      const ref = doc(db, 'teachers', uid, 'classes', classId);
      if (virtueKey === 'absent') {
        await updateDoc(ref, {
          [`scores.${date}.${studentName}.E`]: score
        });
      } else {
        const shortKey = VIRTUE_SHORT[virtueKey];
        if (shortKey) {
          await updateDoc(ref, {
            [`scores.${date}.${studentName}.${shortKey}`]: score
          });
        }
      }
    });

    // Optimistic update
    setClasses(prev => prev.map(c => {
      if (c.id !== classId) return c;
      return {
        ...c,
        students: c.students.map(s => {
          if (s.id !== studentId) return s;
          const newScores = { ...s.scores };
          if (!newScores[date]) newScores[date] = {};
          if (virtueKey === 'absent') {
            newScores[date].absent = score;
          } else {
            newScores[date][virtueKey] = score;
          }
          return { ...s, scores: newScores };
        })
      };
    }));
  }, [uid, classes, debouncedSave]);

  // Delete a student (remove from roster array)
  const deleteStudent = useCallback(async (classId, studentId) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;
    const newRoster = cls.roster.filter(name => name !== student.name);
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await updateDoc(ref, { roster: newRoster });
    setRefreshKey(k => k + 1);
  }, [uid, classes]);

  // Delete a class
  const deleteClass = useCallback(async (classId) => {
    if (!uid) return;
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await deleteDoc(ref);
    setRefreshKey(k => k + 1);
  }, [uid]);

  return {
    classes,
    loading,
    loadClasses,
    addClass,
    addStudent,
    saveDailyScore,
    deleteStudent,
    deleteClass,
  };
}

// ============================================================
// NARRATIVE DATA HOOK
// ============================================================
export function useNarrativeData(uid) {
  const [narrativeConfig, setNarrativeConfig] = useState({
    teacherName: '',
    className: '',
    quarter: 'Q4',
    students: [],
  });
  const [loading, setLoading] = useState(true);
  const debouncedSave = useDebouncedSave();

  const loadNarrative = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const ref = doc(db, 'teachers', uid, 'config', 'narrative');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setNarrativeConfig(snap.data());
      }
    } catch (err) {
      console.error('Error loading narrative:', err);
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { loadNarrative(); }, [loadNarrative]);

  const saveNarrative = useCallback((data) => {
    if (!uid) return;
    setNarrativeConfig(data);
    debouncedSave(async () => {
      const ref = doc(db, 'teachers', uid, 'config', 'narrative');
      await setDoc(ref, data);
    });
  }, [uid, debouncedSave]);

  return { narrativeConfig, setNarrativeConfig: saveNarrative, loading };
}

// ============================================================
// ADMIN DATA HOOK — reads all teachers' old-format data
// ============================================================
export function useAdminData() {
  const [allTeachers, setAllTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const knownTeachers = [];
      const teachersRef = collection(db, 'teachers');
      
      // Try listing teacher docs first
      const teacherSnap = await getDocs(teachersRef);
      
      // If no docs found, use known UIDs from auth
      const teacherIds = teacherSnap.docs.length > 0 
        ? teacherSnap.docs.map(d => d.id)
        : ['RfcdU5sf2Zhzj4aJTbfE7Iy5e5E2', 'hvThHfEBFAY7VrG3YQ3djt0Icxi1', 'xn858oNYT3XOP6afwXh9qnT06cx2'];

      for (const uid of teacherIds) {
        const teacherData = { uid };
        const classesRef = collection(db, 'teachers', uid, 'classes');
        try {
          const classSnap = await getDocs(classesRef);
          teacherData.classes = [];
          for (const cDoc of classSnap.docs) {
            const raw = cDoc.data();
            teacherData.classes.push({
              id: cDoc.id,
              name: raw.cls || raw.name || 'Unnamed Class',
              students: (raw.roster || []).map((name, idx) => ({
                id: `roster_${idx}`,
                name: name,
                pronoun: raw.pronouns?.[name] || 'he',
                house: raw.houses?.[name] || '',
                scores: parseStudentScores(raw.scores, name),
              })),
            });
          }
          knownTeachers.push(teacherData);
        } catch (e) {
          console.warn('Could not read teacher:', uid, e);
        }
      }
      setAllTeachers(knownTeachers);
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return { allTeachers, loading, refresh: loadAll };
}
