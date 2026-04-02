import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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
// TEACHER DATA HOOK — manages classes, students, daily scores
// ============================================================
export function useTeacherData(uid) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const debouncedSave = useDebouncedSave();

  // Load all classes for this teacher
  const loadClasses = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const classesRef = collection(db, 'teachers', uid, 'classes');
      const snap = await getDocs(classesRef);
      const data = [];
      for (const d of snap.docs) {
        const classData = d.data();
        // Load students subcollection
        const studentsRef = collection(db, 'teachers', uid, 'classes', d.id, 'students');
        const studentSnap = await getDocs(studentsRef);
        classData.students = studentSnap.docs.map(s => ({ id: s.id, ...s.data() }));
        classData.id = d.id;
        data.push(classData);
      }
      setClasses(data);
    } catch (err) {
      console.error('Error loading classes:', err);
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Save a class document
  const saveClass = useCallback(async (classId, data) => {
    if (!uid) return;
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await setDoc(ref, data, { merge: true });
  }, [uid]);

  // Save a student document within a class
  const saveStudent = useCallback(async (classId, studentId, data) => {
    if (!uid) return;
    debouncedSave(async () => {
      const ref = doc(db, 'teachers', uid, 'classes', classId, 'students', studentId);
      await setDoc(ref, data, { merge: true });
    });
  }, [uid, debouncedSave]);

  // Save student immediately (no debounce)
  const saveStudentNow = useCallback(async (classId, studentId, data) => {
    if (!uid) return;
    const ref = doc(db, 'teachers', uid, 'classes', classId, 'students', studentId);
    await setDoc(ref, data, { merge: true });
  }, [uid]);

  // Add a new class
  const addClass = useCallback(async (className) => {
    if (!uid || !className.trim()) return;
    const classId = 'class_' + Date.now();
    const data = { name: className.trim(), createdAt: new Date().toISOString() };
    await saveClass(classId, data);
    await loadClasses();
    return classId;
  }, [uid, saveClass, loadClasses]);

  // Add a student to a class
  const addStudent = useCallback(async (classId, studentName, pronoun = 'he', house = '') => {
    if (!uid || !studentName.trim()) return;
    const studentId = 'student_' + Date.now();
    const data = {
      name: studentName.trim(),
      pronoun,
      house,
      scores: {},
      createdAt: new Date().toISOString()
    };
    const ref = doc(db, 'teachers', uid, 'classes', classId, 'students', studentId);
    await setDoc(ref, data);
    await loadClasses();
    return studentId;
  }, [uid, loadClasses]);

  // Save daily score for a student
  const saveDailyScore = useCallback(async (classId, studentId, date, virtueKey, score) => {
    if (!uid) return;
    debouncedSave(async () => {
      const ref = doc(db, 'teachers', uid, 'classes', classId, 'students', studentId);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      const scores = existing.scores || {};
      if (!scores[date]) scores[date] = {};
      scores[date][virtueKey] = score;
      await setDoc(ref, { ...existing, scores }, { merge: true });
    });
  }, [uid, debouncedSave]);

  // Delete a student
  const deleteStudent = useCallback(async (classId, studentId) => {
    if (!uid) return;
    const { deleteDoc } = await import('firebase/firestore');
    const ref = doc(db, 'teachers', uid, 'classes', classId, 'students', studentId);
    await deleteDoc(ref);
    await loadClasses();
  }, [uid, loadClasses]);

  // Delete a class
  const deleteClass = useCallback(async (classId) => {
    if (!uid) return;
    const { deleteDoc } = await import('firebase/firestore');
    // Delete all students first
    const studentsRef = collection(db, 'teachers', uid, 'classes', classId, 'students');
    const snap = await getDocs(studentsRef);
    for (const s of snap.docs) {
      await deleteDoc(s.ref);
    }
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    await deleteDoc(ref);
    await loadClasses();
  }, [uid, loadClasses]);

  return {
    classes,
    loading,
    loadClasses,
    saveClass,
    saveStudent,
    saveStudentNow,
    addClass,
    addStudent,
    saveDailyScore,
    deleteStudent,
    deleteClass,
  };
}

// ============================================================
// NARRATIVE DATA HOOK — manages narrative builder state
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
      const ref = doc(db, 'teachers', uid, 'narrative');
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
      const ref = doc(db, 'teachers', uid, 'narrative');
      await setDoc(ref, data);
    });
  }, [uid, debouncedSave]);

  return { narrativeConfig, setNarrativeConfig: saveNarrative, loading };
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
      const teachersRef = collection(db, 'teachers');
      const teacherSnap = await getDocs(teachersRef);
      const teachers = [];

      for (const tDoc of teacherSnap.docs) {
        const teacherData = { uid: tDoc.id, ...tDoc.data() };
        // Load classes
        const classesRef = collection(db, 'teachers', tDoc.id, 'classes');
        const classSnap = await getDocs(classesRef);
        teacherData.classes = [];

        for (const cDoc of classSnap.docs) {
          const classData = { id: cDoc.id, ...cDoc.data() };
          // Load students
          const studentsRef = collection(db, 'teachers', tDoc.id, 'classes', cDoc.id, 'students');
          const studentSnap = await getDocs(studentsRef);
          classData.students = studentSnap.docs.map(s => ({ id: s.id, ...s.data() }));
          teacherData.classes.push(classData);
        }
        teachers.push(teacherData);
      }
      setAllTeachers(teachers);
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return { allTeachers, loading, refresh: loadAll };
}
