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
          const num = Number(value);
          result[dateStr][VIRTUE_LONG[shortKey]] = (!isNaN(num) && value !== null && value !== '') ? num : null;
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

    // Write immediately — NO debounce. Each score writes to a unique dot-path field
    // (e.g., scores.2026-04-11.StudentName.D) so concurrent writes never conflict.
    // The old debounce was cancelling previous saves, causing ~75% data loss when
    // a teacher clicks through scores quickly.
    const ref = doc(db, 'teachers', uid, 'classes', classId);
    if (virtueKey === 'absent') {
      updateDoc(ref, { [`scores.${date}.${student.name}.E`]: score }).catch(e => console.error('Score save failed:', e));
    } else {
      const shortKey = VIRTUE_SHORT[virtueKey];
      if (shortKey) {
        updateDoc(ref, { [`scores.${date}.${student.name}.${shortKey}`]: score }).catch(e => console.error('Score save failed:', e));
      }
    }

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
  }, [uid, classes]);

  // Bulk save — single Firestore write for all changes (used by "All 4", "Copy Prev Day", etc.)
  // updates = [{ studentId, virtueKey, score }, ...]
  const saveBulkScores = useCallback(async (classId, date, updates) => {
    if (!uid || updates.length === 0) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;

    // Build a single Firestore field map
    const fieldUpdates = {};
    updates.forEach(({ studentId, virtueKey, score }) => {
      const student = cls.students.find(s => s.id === studentId);
      if (!student) return;
      if (virtueKey === 'absent') {
        fieldUpdates[`scores.${date}.${student.name}.E`] = score;
      } else {
        const shortKey = VIRTUE_SHORT[virtueKey];
        if (shortKey) fieldUpdates[`scores.${date}.${student.name}.${shortKey}`] = score;
      }
    });

    // Single Firestore write
    if (Object.keys(fieldUpdates).length > 0) {
      const ref = doc(db, 'teachers', uid, 'classes', classId);
      await updateDoc(ref, fieldUpdates);
    }

    // Update local state
    setClasses(prev => prev.map(c => {
      if (c.id !== classId) return c;
      return {
        ...c,
        students: c.students.map(s => {
          const myUpdates = updates.filter(u => u.studentId === s.id);
          if (myUpdates.length === 0) return s;
          const newScores = { ...s.scores };
          if (!newScores[date]) newScores[date] = {};
          myUpdates.forEach(u => {
            if (u.virtueKey === 'absent') newScores[date].absent = u.score;
            else newScores[date][u.virtueKey] = u.score;
          });
          return { ...s, scores: newScores };
        })
      };
    }));
  }, [uid, classes]);

  // Manual "Save All" — writes every score for a class+date in one Firestore write.
  // Acts as a safety net: even if individual auto-saves failed, this captures everything.
  const saveAllScoresForDay = useCallback(async (classId, date) => {
    if (!uid) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;

    const fieldUpdates = {};
    cls.students.forEach(student => {
      const dayScores = student.scores?.[date];
      if (!dayScores) return;
      Object.entries(dayScores).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (key === 'absent') {
          fieldUpdates[`scores.${date}.${student.name}.E`] = value;
        } else {
          const shortKey = VIRTUE_SHORT[key];
          if (shortKey) fieldUpdates[`scores.${date}.${student.name}.${shortKey}`] = value;
        }
      });
    });

    if (Object.keys(fieldUpdates).length > 0) {
      const ref = doc(db, 'teachers', uid, 'classes', classId);
      await updateDoc(ref, fieldUpdates);
    }
    return Object.keys(fieldUpdates).length;
  }, [uid, classes]);

  const deleteClass = useCallback(async (classId) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'teachers', uid, 'classes', classId));
    setRefreshKey(k => k + 1);
  }, [uid]);

  return {
    classes, loading, loadClasses: () => setRefreshKey(k => k + 1),
    addClass, addStudentToClass, removeStudentFromClass, saveDailyScore, saveBulkScores, saveAllScoresForDay, deleteClass,
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
      const q = query(collection(db, 'housePointEntries'), orderBy('createdAt', 'desc'), limit(2000));
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addEntry = useCallback(async (entry) => {
    await addDoc(collection(db, 'housePointEntries'), {
      ...entry, points: Number(entry.points), createdAt: entry.createdAt || new Date().toISOString(),
    });
    await load();
  }, [load]);

  const bulkAddEntries = useCallback(async (entriesArr, onProgress) => {
    for (let i = 0; i < entriesArr.length; i += 50) {
      const chunk = entriesArr.slice(i, i + 50);
      const promises = chunk.map(entry =>
        addDoc(collection(db, 'housePointEntries'), {
          ...entry, points: Number(entry.points), createdAt: entry.createdAt || new Date().toISOString(),
        })
      );
      await Promise.all(promises);
      if (onProgress) onProgress(Math.min(i + 50, entriesArr.length), entriesArr.length);
    }
    if (onProgress) onProgress(entriesArr.length, entriesArr.length, 'Loading entries...');
    await load();
  }, [load]);

  const deleteEntry = useCallback(async (id) => {
    await deleteDoc(doc(db, 'housePointEntries', id));
    await load();
  }, [load]);

  const resetAll = useCallback(async () => {
    for (const entry of entries) {
      await deleteDoc(doc(db, 'housePointEntries', entry.id));
    }
    await load();
  }, [entries, load]);

  return { entries, loading, addEntry, bulkAddEntries, deleteEntry, resetAll, refresh: load };
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

// ============================================================
// ANNOUNCEMENTS HOOK — admin posts, everyone reads
// Firestore: announcements/{id} = { title, body, postedBy, postedAt, pinned }
// ============================================================
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'announcements'), orderBy('postedAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      // If index not ready, try without ordering
      console.warn('Announcements ordered query failed, trying unordered:', err.message);
      try {
        const snap = await getDocs(collection(db, 'announcements'));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || ''));
        setAnnouncements(docs);
      } catch (err2) { console.error('Announcements load failed:', err2); }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addAnnouncement = useCallback(async (data) => {
    await addDoc(collection(db, 'announcements'), {
      title: data.title,
      body: data.body,
      postedBy: data.postedBy || '',
      postedByName: data.postedByName || '',
      postedAt: new Date().toISOString(),
      pinned: data.pinned || false,
    });
    await load();
  }, [load]);

  const removeAnnouncement = useCallback(async (id) => {
    await deleteDoc(doc(db, 'announcements', id));
    await load();
  }, [load]);

  const togglePin = useCallback(async (id, currentPinned) => {
    await updateDoc(doc(db, 'announcements', id), { pinned: !currentPinned });
    await load();
  }, [load]);

  return { announcements, loading, addAnnouncement, removeAnnouncement, togglePin, refresh: load };
}

// ============================================================
// QUICK LINKS HOOK — admin manages, everyone sees
// Firestore: quickLinks/{id} = { label, url, order }
// ============================================================
export function useQuickLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'quickLinks'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      setLinks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addLink = useCallback(async (data) => {
    const maxOrder = links.reduce((max, l) => Math.max(max, l.order || 0), 0);
    await addDoc(collection(db, 'quickLinks'), {
      label: data.label, url: data.url, order: maxOrder + 1,
    });
    await load();
  }, [load, links]);

  const removeLink = useCallback(async (id) => {
    await deleteDoc(doc(db, 'quickLinks', id));
    await load();
  }, [load]);

  return { links, loading, addLink, removeLink, refresh: load };
}

// ============================================================
// SCHEDULE HOOK — single document stores entire schedule config
// Firestore: schedule/config = { schoolDay, rooms, teachers, studentGroups, classes, grid, published }
// Firestore: schedule/published = { ...same shape, set when admin hits Publish }
// ============================================================
export function useSchedule() {
  const [config, setConfig] = useState(null);
  const [published, setPublished] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const configSnap = await getDoc(doc(db, 'schedule', 'config'));
      if (configSnap.exists()) setConfig(configSnap.data());
      else setConfig(getDefaultConfig());

      const pubSnap = await getDoc(doc(db, 'schedule', 'published'));
      if (pubSnap.exists()) setPublished(pubSnap.data());
    } catch (err) { console.error('Error loading schedule:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = useCallback(async (newConfig) => {
    setConfig(newConfig);
    await setDoc(doc(db, 'schedule', 'config'), newConfig);
  }, []);

  const publish = useCallback(async (configToPublish) => {
    const pubData = { ...configToPublish, publishedAt: new Date().toISOString() };
    await setDoc(doc(db, 'schedule', 'published'), pubData);
    setPublished(pubData);
  }, []);

  return { config, published, loading, saveConfig, publish, refresh: load };
}

// ============================================================
// DOCUMENTS HOOK — embedded PDFs on Home tab
// Firestore: documents/{id} = { label, url, order }
// ============================================================
export function useDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'documents'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      // Fallback if index not ready
      try {
        const snap = await getDocs(collection(db, 'documents'));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.order || 0) - (b.order || 0));
        setDocuments(docs);
      } catch (err2) { console.error('Documents load failed:', err2); }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addDocument = useCallback(async (data) => {
    const maxOrder = documents.reduce((max, d) => Math.max(max, d.order || 0), 0);
    await addDoc(collection(db, 'documents'), {
      label: data.label, url: data.url, order: maxOrder + 1,
    });
    await load();
  }, [load, documents]);

  const removeDocument = useCallback(async (id) => {
    await deleteDoc(doc(db, 'documents', id));
    await load();
  }, [load]);

  return { documents, loading, addDocument, removeDocument, refresh: load };
}

// ============================================================
// COMMAND CENTER HOOK — single document stores board data
// Firestore: commandCenter/data = { directors, completedMonths, boardDocs }
// ============================================================
export function useCommandCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'commandCenter', 'data'));
      if (snap.exists()) setData(snap.data());
      else setData({ directors: [], completedMonths: [], boardDocs: [] });
    } catch (err) { console.error('Error loading command center:', err); setData({ directors: [], completedMonths: [], boardDocs: [] }); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveData = useCallback(async (newData) => {
    setData(newData);
    await setDoc(doc(db, 'commandCenter', 'data'), newData);
  }, []);

  return { data, loading, saveData, refresh: load };
}

// ============================================================
// BUDGET HOOK — stores budget data
// Firestore: budget/data = { lineItems, scenarios, spending, publishedBudget }
// ============================================================
export function useBudget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'budget', 'data'));
      if (snap.exists()) setData(snap.data());
      else setData({ lineItems: [], scenarios: ['Scenario A'], spending: [], publishedBudget: null });
    } catch (err) { console.error('Error loading budget:', err); setData({ lineItems: [], scenarios: ['Scenario A'], spending: [], publishedBudget: null }); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveData = useCallback(async (newData) => {
    setData(newData);
    await setDoc(doc(db, 'budget', 'data'), newData);
  }, []);

  return { data, loading, saveData, refresh: load };
}

// ============================================================
// FINANCIAL PLANNING HOOK — 6-year projections, tuition model, salary schedule, financial aid
// Firestore: financialPlanning/data = { initialized, projections, revenue, tuition, salary, aid }
// ============================================================
export function useFinancialPlanning() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'financialPlanning', 'data'));
      if (snap.exists()) setData(snap.data());
      else setData({});
    } catch (err) {
      console.error('Error loading financial planning:', err);
      setData({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveData = useCallback(async (newData) => {
    setData(newData);
    await setDoc(doc(db, 'financialPlanning', 'data'), newData);
  }, []);

  return { data, loading, saveData, refresh: load };
}

// ============================================================
// SERVICE HOURS HOOK — individual documents per entry
// Firestore: serviceHours/{id} = { student, date, hours, organization, description, supervisor, supervisorContact, verification, createdAt }
// ============================================================
export function useServiceHours() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'serviceHours'));
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Service hours load failed:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addEntry = useCallback(async (data) => {
    await addDoc(collection(db, 'serviceHours'), data);
    await load();
  }, [load]);

  const updateEntry = useCallback(async (id, updates) => {
    await updateDoc(doc(db, 'serviceHours', id), updates);
    await load();
  }, [load]);

  const deleteEntry = useCallback(async (id) => {
    await deleteDoc(doc(db, 'serviceHours', id));
    await load();
  }, [load]);

  return { entries, loading, addEntry, updateEntry, deleteEntry, refresh: load };
}

function getDefaultConfig() {
  return {
    schoolDay: {
      startTime: '08:00',
      endTime: '15:00',
      periodMinutes: 45,
      passingMinutes: 5,
      lunchAfterPeriod: 4,
      lunchMinutes: 30,
    },
    rooms: [
      { id: 'r1', name: 'Room 1', capacity: 10, notes: 'Small classes only' },
      { id: 'r2', name: 'Room 2', capacity: 25, notes: '' },
      { id: 'r3', name: 'Room 3', capacity: 25, notes: '' },
      { id: 'r4', name: 'Room 4', capacity: 25, notes: '' },
    ],
    teachers: [],
    studentGroups: [
      { id: 'g9', name: 'Grade 9', color: '#1B3A5C' },
      { id: 'g10', name: 'Grade 10', color: '#8B2252' },
      { id: 'g11-12', name: 'Grade 11/12', color: '#2E7D5B' },
    ],
    classes: [],
    grid: {}, // grid[periodIndex] = { classId, roomId }
    publishedAt: null,
  };
}

// ============================================================
// PTO ALLOTMENTS HOOK
// Firestore: ptoAllotments/{teacherId} = {
//   teacherId, displayName, contractType,
//   sick: number, vacation: number, bereavement: number,
//   updatedAt
// }
// ============================================================
export function usePTOAllotments() {
  const [allotments, setAllotments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'ptoAllotments'));
      setAllotments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('PTO allotments load failed:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setAllotment = useCallback(async (teacherId, data) => {
    const payload = { ...data, teacherId, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'ptoAllotments', teacherId), payload);
    setAllotments(prev => {
      const others = prev.filter(a => a.id !== teacherId);
      return [...others, { id: teacherId, ...payload }];
    });
  }, []);

  return { allotments, loading, setAllotment, refresh: load };
}

// ============================================================
// PTO REQUESTS HOOK
// Firestore: ptoRequests/{id} = {
//   teacherId, displayName, type ('sick'|'vacation'|'bereavement'),
//   startDate ('YYYY-MM-DD'), endDate, days (number),
//   reason, status ('pending'|'approved'|'denied'),
//   requestedAt, requestedBy (uid), submittedByAdmin (bool),
//   decidedAt, decidedBy (uid), decisionNote
// }
// ============================================================
export function usePTORequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'ptoRequests'));
      const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
      setRequests(sorted);
    } catch (err) { console.error('PTO requests load failed:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitRequest = useCallback(async (data) => {
    const payload = {
      status: 'pending',
      ...data,
      requestedAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, 'ptoRequests'), payload);
    const newReq = { id: ref.id, ...payload };
    setRequests(prev => [newReq, ...prev]);
    return ref.id;
  }, []);

  const decideRequest = useCallback(async (id, decision, decidedBy, note) => {
    const update = {
      status: decision,
      decidedAt: new Date().toISOString(),
      decidedBy: decidedBy || null,
      decisionNote: note || null,
    };
    await updateDoc(doc(db, 'ptoRequests', id), update);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...update } : r));
  }, []);

  const deleteRequest = useCallback(async (id) => {
    await deleteDoc(doc(db, 'ptoRequests', id));
    setRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  return { requests, loading, submitRequest, decideRequest, deleteRequest, refresh: load };
}

