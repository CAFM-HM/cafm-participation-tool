import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

// ── BUCKET DEFINITIONS ──
const BUCKETS = [
  { key: 'pre_admission', label: 'Pre-Admission', color: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
  { key: 'enrollment', label: 'Enrollment', color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  { key: 'maintenance', label: 'Maintenance', color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
];

// Default doc types (used when no custom config exists)
const DEFAULT_STUDENT_DOCS = [
  { key: 'application', label: 'Application', bucket: 'pre_admission' },
  { key: 'parent_questionnaire', label: 'Parent Questionnaire', bucket: 'pre_admission' },
  { key: 'student_questionnaire', label: 'Student Questionnaire', bucket: 'pre_admission' },
  { key: 'teacher_questionnaire', label: 'Teacher Questionnaire', bucket: 'pre_admission' },
  { key: 'immunization', label: 'Immunization Records', bucket: 'enrollment' },
  { key: 'handbook_ack', label: 'Handbook Acknowledgement', bucket: 'enrollment' },
  { key: 'parent_agreement', label: 'Parent Agreement', bucket: 'enrollment' },
];

const DEFAULT_PERSONNEL_DOCS = [
  { key: 'application', label: 'Application', bucket: 'pre_admission' },
  { key: 'background_check', label: 'Background Check', bucket: 'enrollment' },
  { key: 'safe_environment', label: 'Safe Environment Documentation', bucket: 'enrollment' },
];

const GRADES = ['9th', '10th', '11th', '12th'];
const HOUSES = ['Augustine', 'Athanasius', 'Ambrose', 'Chrysostom'];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── MAIN COMPONENT ──
export default function DocumentRepository({ masterStudents, uid }) {
  const [section, setSection] = useState('students');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRecord, setActiveRecord] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDocConfig, setShowDocConfig] = useState(false);

  // Custom document type configs from Firestore
  const [studentDocTypes, setStudentDocTypes] = useState(DEFAULT_STUDENT_DOCS);
  const [personnelDocTypes, setPersonnelDocTypes] = useState(DEFAULT_PERSONNEL_DOCS);

  // New person form
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newHouse, setNewHouse] = useState('');
  const [newRole, setNewRole] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  // Load document type config from Firestore
  const loadDocConfig = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'documentTypes'));
      if (snap.exists()) {
        const data = snap.data();
        if (data.studentDocs?.length > 0) setStudentDocTypes(data.studentDocs);
        if (data.personnelDocs?.length > 0) setPersonnelDocTypes(data.personnelDocs);
      }
    } catch (err) { console.error('Doc config load failed:', err); }
  }, []);

  const saveDocConfig = useCallback(async (studentDocs, personnelDocs) => {
    try {
      await setDoc(doc(db, 'config', 'documentTypes'), { studentDocs, personnelDocs });
      setStudentDocTypes(studentDocs);
      setPersonnelDocTypes(personnelDocs);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Document types saved' }));
    } catch (err) {
      console.error('Doc config save failed:', err);
      alert('Failed to save: ' + err.message);
    }
  }, []);

  // Load records
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'documentRepository'), orderBy('name', 'asc')));
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      try {
        const snap = await getDocs(collection(db, 'documentRepository'));
        setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err2) { console.error(err2); }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); loadDocConfig(); }, [load, loadDocConfig]);

  const docChecklist = section === 'students' ? studentDocTypes : personnelDocTypes;

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => r.type === section)
      .filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [records, section, searchTerm]);

  const active = records.find(r => r.id === activeRecord);

  const rosterMatches = useMemo(() => {
    if (!rosterSearch || !masterStudents) return [];
    return masterStudents.filter(s => s.name.toLowerCase().includes(rosterSearch.toLowerCase())).slice(0, 8);
  }, [rosterSearch, masterStudents]);

  const selectFromRoster = (student) => {
    setNewName(student.name);
    setNewHouse(student.house || '');
    setRosterSearch('');
    if (student.grade) setNewGrade(student.grade);
  };

  const addRecord = async () => {
    if (!newName.trim()) return;
    const record = {
      name: newName.trim(), type: section,
      dob: section === 'students' ? newDob : '',
      grade: section === 'students' ? newGrade : '',
      house: section === 'students' ? newHouse : '',
      role: section === 'personnel' ? newRole : '',
      documents: {}, additionalDocs: [], overrides: {},
      createdAt: new Date().toISOString(), createdBy: uid,
    };
    try {
      await addDoc(collection(db, 'documentRepository'), record);
      const savedName = newName.trim();
      setNewName(''); setNewDob(''); setNewGrade(''); setNewHouse(''); setNewRole('');
      setShowAddForm(false);
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${savedName} added to ${section}` }));
    } catch (err) {
      alert('Failed to add record: ' + err.message);
    }
  };

  const deleteRecord = async (id) => {
    const rec = records.find(r => r.id === id);
    if (!rec || !window.confirm(`Delete ${rec.name} and all uploaded documents? This cannot be undone.`)) return;
    for (const key of Object.keys(rec.documents || {})) {
      if (rec.documents[key]?.storagePath) { try { await deleteObject(ref(storage, rec.documents[key].storagePath)); } catch (_) {} }
    }
    for (const ad of (rec.additionalDocs || [])) {
      if (ad.storagePath) { try { await deleteObject(ref(storage, ad.storagePath)); } catch (_) {} }
    }
    await deleteDoc(doc(db, 'documentRepository', id));
    if (activeRecord === id) setActiveRecord(null);
    await load();
  };

  const uploadDocument = async (recordId, docKey, file) => {
    setUploading(docKey);
    try {
      const rec = records.find(r => r.id === recordId);
      const storagePath = `documents/${rec.type}/${recordId}/${docKey}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const documents = { ...(rec.documents || {}) };
      documents[docKey] = { fileName: file.name, storagePath, url, uploadedAt: new Date().toISOString(), uploadedBy: uid };
      await updateDoc(doc(db, 'documentRepository', recordId), { documents });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${file.name} uploaded` }));
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(null);
  };

  const uploadAdditional = async (recordId, file, label) => {
    setUploading('additional');
    try {
      const rec = records.find(r => r.id === recordId);
      const storagePath = `documents/${rec.type}/${recordId}/additional_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const additionalDocs = [...(rec.additionalDocs || [])];
      additionalDocs.push({ id: genId(), label: label || file.name, fileName: file.name, storagePath, url, uploadedAt: new Date().toISOString(), uploadedBy: uid });
      await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
      await load();
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(null);
  };

  const linkDocument = async (recordId, docKey) => {
    const url = window.prompt('Paste the Google Drive share link (or any URL) for this document:');
    if (!url?.trim()) return;
    try {
      const rec = records.find(r => r.id === recordId);
      const documents = { ...(rec.documents || {}) };
      documents[docKey] = { fileName: 'Google Drive Link', url: url.trim(), isLink: true, uploadedAt: new Date().toISOString(), uploadedBy: uid };
      await updateDoc(doc(db, 'documentRepository', recordId), { documents });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Document linked' }));
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const linkAdditional = async (recordId, label) => {
    const url = window.prompt('Paste the Google Drive share link (or any URL):');
    if (!url?.trim()) return;
    const docLabel = label || window.prompt('Label for this document:') || 'Linked Document';
    try {
      const rec = records.find(r => r.id === recordId);
      const additionalDocs = [...(rec.additionalDocs || [])];
      additionalDocs.push({ id: genId(), label: docLabel, fileName: 'Google Drive Link', url: url.trim(), isLink: true, uploadedAt: new Date().toISOString(), uploadedBy: uid });
      await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
      await load();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const deleteDocument = async (recordId, docKey) => {
    if (!window.confirm('Remove this document?')) return;
    const rec = records.find(r => r.id === recordId);
    if (rec.documents[docKey]?.storagePath) { try { await deleteObject(ref(storage, rec.documents[docKey].storagePath)); } catch (_) {} }
    const documents = { ...(rec.documents || {}) };
    delete documents[docKey];
    await updateDoc(doc(db, 'documentRepository', recordId), { documents });
    await load();
  };

  const deleteAdditionalDoc = async (recordId, docId) => {
    if (!window.confirm('Remove this document?')) return;
    const rec = records.find(r => r.id === recordId);
    const ad = (rec.additionalDocs || []).find(d => d.id === docId);
    if (ad?.storagePath) { try { await deleteObject(ref(storage, ad.storagePath)); } catch (_) {} }
    const additionalDocs = (rec.additionalDocs || []).filter(d => d.id !== docId);
    await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
    await load();
  };

  const updateField = async (recordId, field, value) => {
    await updateDoc(doc(db, 'documentRepository', recordId), { [field]: value });
    await load();
  };

  // Override a doc requirement (waive it)
  const toggleOverride = async (recordId, docKey) => {
    const rec = records.find(r => r.id === recordId);
    const overrides = { ...(rec.overrides || {}) };
    if (overrides[docKey]) { delete overrides[docKey]; } else { overrides[docKey] = { at: new Date().toISOString(), by: uid }; }
    await updateDoc(doc(db, 'documentRepository', recordId), { overrides });
    await load();
  };

  // Completion helpers
  const getCompletion = useCallback((rec) => {
    const checklist = rec.type === 'students' ? studentDocTypes : personnelDocTypes;
    const uploaded = checklist.filter(d => rec.documents?.[d.key] || rec.overrides?.[d.key]).length;
    return { uploaded, total: checklist.length, pct: checklist.length > 0 ? Math.round((uploaded / checklist.length) * 100) : 100 };
  }, [studentDocTypes, personnelDocTypes]);

  const getBucketCompletion = useCallback((rec, bucketKey) => {
    const checklist = rec.type === 'students' ? studentDocTypes : personnelDocTypes;
    const bucketDocs = checklist.filter(d => d.bucket === bucketKey);
    const uploaded = bucketDocs.filter(d => rec.documents?.[d.key] || rec.overrides?.[d.key]).length;
    return { uploaded, total: bucketDocs.length, pct: bucketDocs.length > 0 ? Math.round((uploaded / bucketDocs.length) * 100) : 100, docs: bucketDocs };
  }, [studentDocTypes, personnelDocTypes]);

  const getMissingDocs = useCallback((rec) => {
    const checklist = rec.type === 'students' ? studentDocTypes : personnelDocTypes;
    return checklist.filter(d => !rec.documents?.[d.key] && !rec.overrides?.[d.key]);
  }, [studentDocTypes, personnelDocTypes]);

  // ── Admission letter generator ──
  const generateAdmissionLetter = (rec) => {
    const now = new Date();
    const currentYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const schoolYear = `${currentYear}-${currentYear + 1}`;
    const gradeNum = rec.grade ? parseInt(rec.grade) : 9;
    const gradYear = now.getFullYear() + (12 - gradeNum + (now.getMonth() >= 6 ? 1 : 0));

    let text = `CHESTERTON ACADEMY OF THE FLORIDA MARTYRS\n\n`;
    text += `${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    text += `Dear ${rec.name} and Family,\n\n`;
    text += `We are pleased to inform you that ${rec.name} has been admitted to `;
    text += `Chesterton Academy of the Florida Martyrs for the ${schoolYear} school year `;
    text += `as a member of the Graduating Class of ${gradYear}.\n\n`;
    if (rec.house) {
      text += `${rec.name} has been assigned to the House of ${rec.house}.\n\n`;
    }
    text += `We look forward to welcoming ${rec.name} to our school community. `;
    text += `Please complete any remaining enrollment documents at your earliest convenience.\n\n`;
    text += `In Christ,\n\n\n`;
    text += `_________________________________\n`;
    text += `Headmaster\n`;
    text += `Chesterton Academy of the Florida Martyrs\n`;
    return text;
  };

  // ── Reports ──
  const generateStudentReport = (rec) => {
    const missing = getMissingDocs(rec);
    if (missing.length === 0) return null;
    const comp = getCompletion(rec);
    let text = `MISSING DOCUMENTS REPORT\nChesterton Academy of the Florida Martyrs\n`;
    text += `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n${'─'.repeat(50)}\n\n`;
    text += `Name: ${rec.name}\n`;
    if (rec.grade) text += `Grade: ${rec.grade}\n`;
    if (rec.house) text += `House: ${rec.house}\n`;
    text += `Status: ${comp.uploaded}/${comp.total} documents on file (${comp.pct}% complete)\n\n`;

    BUCKETS.forEach(bucket => {
      const bucketMissing = missing.filter(d => d.bucket === bucket.key);
      if (bucketMissing.length === 0) return;
      text += `${bucket.label.toUpperCase()}:\n`;
      bucketMissing.forEach((d, i) => { text += `  ${i + 1}. ${d.label}\n`; });
      text += `\n`;
    });
    const noBucket = missing.filter(d => !d.bucket || !BUCKETS.some(b => b.key === d.bucket));
    if (noBucket.length > 0) {
      text += `OTHER:\n`;
      noBucket.forEach((d, i) => { text += `  ${i + 1}. ${d.label}\n`; });
      text += `\n`;
    }
    text += `Please submit these documents at your earliest convenience.\n`;
    return text;
  };

  const generateBulkReport = () => {
    const incomplete = filteredRecords.filter(r => getCompletion(r).pct < 100);
    if (incomplete.length === 0) { alert('All records are complete!'); return; }
    const isStudents = section === 'students';
    let text = `MISSING DOCUMENTS REPORT — ALL ${isStudents ? 'STUDENTS' : 'PERSONNEL'}\n`;
    text += `Chesterton Academy of the Florida Martyrs\n`;
    text += `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    text += `${'─'.repeat(60)}\n\n`;
    text += `${incomplete.length} of ${filteredRecords.length} ${isStudents ? 'students' : 'personnel'} have missing documents.\n\n`;

    // By bucket
    BUCKETS.forEach(bucket => {
      const bucketIncomplete = incomplete.filter(r => {
        const bc = getBucketCompletion(r, bucket.key);
        return bc.total > 0 && bc.pct < 100;
      });
      if (bucketIncomplete.length === 0) return;
      text += `\n${'═'.repeat(60)}\n${bucket.label.toUpperCase()}\n${'═'.repeat(60)}\n\n`;
      bucketIncomplete.forEach(r => {
        const missing = getMissingDocs(r).filter(d => d.bucket === bucket.key);
        const label = isStudents ? `${r.name}${r.grade ? ` (${r.grade})` : ''}` : `${r.name}${r.role ? ` — ${r.role}` : ''}`;
        text += `${label}\n`;
        missing.forEach((d, i) => { text += `  ${i + 1}. ${d.label}\n`; });
        text += `\n`;
      });
    });
    return text;
  };

  const copyReport = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Report copied to clipboard' }));
    }).catch(() => {
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre>' + text.replace(/</g, '&lt;') + '</pre>'); w.document.title = 'Report'; }
    });
  };

  const downloadReport = (text, fileName) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
  };

  // ════════════════════════════════════════════
  // DOC TYPE CONFIGURATION PANEL
  // ════════════════════════════════════════════
  if (showDocConfig) {
    return (
      <DocTypeConfig
        studentDocs={studentDocTypes}
        personnelDocs={personnelDocTypes}
        onSave={(s, p) => { saveDocConfig(s, p); setShowDocConfig(false); }}
        onCancel={() => setShowDocConfig(false)}
      />
    );
  }

  // ════════════════════════════════════════════
  // DETAIL VIEW
  // ════════════════════════════════════════════
  if (active) {
    const comp = getCompletion(active);
    const isStudent = active.type === 'students';
    const preAdmComp = getBucketCompletion(active, 'pre_admission');
    const canGenerateLetter = isStudent && preAdmComp.pct === 100;

    return (
      <div>
        <button className="btn btn-sm btn-secondary" onClick={() => setActiveRecord(null)} style={{ marginBottom: 12 }}>&larr; Back to {isStudent ? 'Students' : 'Personnel'}</button>

        {/* Header */}
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', margin: 0 }}>{active.name}</h3>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                {isStudent && active.grade && <span style={{ marginRight: 12 }}>Grade: {active.grade}</span>}
                {isStudent && active.house && <span style={{ marginRight: 12, padding: '1px 8px', background: '#EFF6FF', borderRadius: 4, border: '1px solid #BFDBFE', fontWeight: 600 }}>House: {active.house}</span>}
                {isStudent && active.dob && <span style={{ marginRight: 12 }}>DOB: {active.dob}</span>}
                {!isStudent && active.role && <span>Role: {active.role}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {comp.pct < 100 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => { const t = generateStudentReport(active); if (t) copyReport(t); }}
                    style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}>{'\u{1F4CB}'} Copy Missing Docs</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => {
                    const t = generateStudentReport(active);
                    if (t) downloadReport(t, `missing-docs-${active.name.replace(/\s+/g, '-').toLowerCase()}.txt`);
                  }} style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}>{'\u{1F4E5}'} Download Report</button>
                </div>
              )}
              {canGenerateLetter && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <button className="btn btn-sm btn-gold" onClick={() => { const t = generateAdmissionLetter(active); copyReport(t); }}
                    style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}>{'\u{1F4DC}'} Admission Letter</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => {
                    const t = generateAdmissionLetter(active);
                    downloadReport(t, `admission-letter-${active.name.replace(/\s+/g, '-').toLowerCase()}.txt`);
                  }} style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}>{'\u{1F4E5}'} Download Letter</button>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: comp.pct === 100 ? '#16A34A' : '#CA8A04' }}>{comp.pct}%</div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>{comp.uploaded}/{comp.total} docs</div>
              </div>
              <div style={{ width: 60, height: 60, borderRadius: '50%', border: `4px solid ${comp.pct === 100 ? '#16A34A' : '#E5E7EB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {comp.pct === 100 ? <span style={{ color: '#16A34A', fontSize: 24 }}>{'\u2713'}</span> : <span style={{ color: '#CA8A04', fontSize: 12, fontWeight: 700 }}>{comp.uploaded}/{comp.total}</span>}
              </div>
            </div>
          </div>

          {/* Editable fields */}
          {isStudent && (
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Date of Birth</label>
                <input type="date" value={active.dob || ''} onChange={e => updateField(active.id, 'dob', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Grade</label>
                <select value={active.grade || ''} onChange={e => updateField(active.id, 'grade', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }}>
                  <option value="">--</option>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>House</label>
                <select value={active.house || ''} onChange={e => updateField(active.id, 'house', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }}>
                  <option value="">--</option>
                  {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}
          {!isStudent && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Role / Title</label>
              <input type="text" value={active.role || ''} onBlur={e => updateField(active.id, 'role', e.target.value)}
                onChange={e => { const val = e.target.value; setRecords(prev => prev.map(r => r.id === active.id ? { ...r, role: val } : r)); }}
                placeholder="e.g. Math Teacher" style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4, width: 300 }} />
            </div>
          )}

          {/* Bucket progress bars */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {BUCKETS.map(bucket => {
              const bc = getBucketCompletion(active, bucket.key);
              if (bc.total === 0) return null;
              return (
                <div key={bucket.key} style={{ flex: 1, minWidth: 140, padding: '8px 12px', background: bucket.bg, border: `1px solid ${bucket.border}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: bucket.color, marginBottom: 4 }}>{bucket.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: '#fff', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${bc.pct}%`, height: '100%', background: bc.pct === 100 ? '#16A34A' : bucket.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: bc.pct === 100 ? '#16A34A' : bucket.color }}>{bc.uploaded}/{bc.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Documents by bucket */}
        {BUCKETS.map(bucket => {
          const bucketDocs = docChecklist.filter(d => d.bucket === bucket.key);
          if (bucketDocs.length === 0) return null;
          return (
            <div key={bucket.key} className="card" style={{ marginBottom: 16, padding: 16 }}>
              <h4 style={{ fontFamily: 'var(--font-display)', color: bucket.color, margin: '0 0 12px 0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: bucket.color, display: 'inline-block' }}></span>
                {bucket.label}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bucketDocs.map(d => {
                  const uploaded = active.documents?.[d.key];
                  const overridden = active.overrides?.[d.key];
                  const isDone = uploaded || overridden;
                  return (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px',
                      background: isDone ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${isDone ? '#BBF7D0' : '#FED7AA'}`, borderRadius: 8, flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{isDone ? '\u2705' : '\u{1F7E0}'}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C' }}>
                            {d.label}
                            {uploaded?.isLink && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6, fontWeight: 400 }}>(Drive link)</span>}
                            {overridden && !uploaded && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6, fontWeight: 400 }}>(waived)</span>}
                          </div>
                          {uploaded && <div style={{ fontSize: 11, color: '#6B7280' }}>{uploaded.isLink ? 'Linked' : uploaded.fileName} &middot; {new Date(uploaded.uploadedAt).toLocaleDateString()}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {uploaded && (
                          <>
                            <a href={uploaded.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ fontSize: 11, textDecoration: 'none' }}>View</a>
                            {!uploaded.isLink && (
                              <span title="This file was uploaded directly to Firebase Storage. Consider replacing with a Google Drive link for long-term durability." style={{ fontSize: 10, color: '#B45309', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>⚠ legacy upload</span>
                            )}
                            <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => deleteDocument(active.id, d.key)}>x</button>
                          </>
                        )}
                        <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => linkDocument(active.id, d.key)}>📁 {uploaded ? 'Replace with Drive link' : 'Link Drive document'}</button>
                        <button className={`btn btn-sm ${overridden ? 'btn-gold' : 'btn-secondary'}`}
                          style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => toggleOverride(active.id, d.key)}
                          title={overridden ? 'Remove waiver' : 'Waive this requirement'}>
                          {overridden ? 'Waived' : 'Waive'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Additional Documentation */}
        <AdditionalDocs record={active} uploading={uploading}
          onUpload={(file, label) => uploadAdditional(active.id, file, label)}
          onLink={(label) => linkAdditional(active.id, label)}
          onDelete={(docId) => deleteAdditionalDoc(active.id, docId)} />
      </div>
    );
  }

  // ════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title" style={{ margin: 0 }}>Document Repository</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn btn-sm ${section === 'students' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setSection('students'); setSearchTerm(''); setActiveRecord(null); }}>
            Students ({records.filter(r => r.type === 'students').length})
          </button>
          <button className={`btn btn-sm ${section === 'personnel' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setSection('personnel'); setSearchTerm(''); setActiveRecord(null); }}>
            Personnel ({records.filter(r => r.type === 'personnel').length})
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowDocConfig(true)}
            style={{ fontSize: 11 }}>{'\u2699\uFE0F'} Doc Types</button>
        </div>
      </div>

      {/* Search & Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder={`Search ${section}...`}
          style={{ flex: 1, minWidth: 200, fontSize: 13, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 6 }} />
        <button className="btn btn-sm btn-secondary" onClick={() => { const t = generateBulkReport(); if (t) copyReport(t); }}
          title="Copy missing docs report to clipboard">{'\u{1F4CB}'} Missing Docs Report</button>
        <button className="btn btn-sm btn-secondary" onClick={() => {
          const t = generateBulkReport();
          if (t) downloadReport(t, `missing-docs-all-${section}-${new Date().toISOString().split('T')[0]}.txt`);
        }} title="Download missing docs report">{'\u{1F4E5}'}</button>
        <button className="btn btn-sm btn-gold" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : `+ Add ${section === 'students' ? 'Student' : 'Personnel'}`}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 10 }}>
            Add {section === 'students' ? 'Student' : 'Personnel'}
          </div>
          {section === 'students' && masterStudents?.length > 0 && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Pull from Roster</label>
              <input type="text" value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}
                placeholder="Type to search roster..." style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
              {rosterMatches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 200, overflow: 'auto' }}>
                  {rosterMatches.map(s => (
                    <div key={s.name} onClick={() => selectFromRoster(s)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500 }}>{s.name}</span>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>{s.house}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Name *</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Full name" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
            </div>
            {section === 'students' && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>DOB</label>
                  <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Grade</label>
                  <select value={newGrade} onChange={e => setNewGrade(e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }}>
                    <option value="">--</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>House</label>
                  <select value={newHouse} onChange={e => setNewHouse(e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }}>
                    <option value="">--</option>
                    {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            )}
            {section === 'personnel' && (
              <div style={{ minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Role / Title</label>
                <input type="text" value={newRole} onChange={e => setNewRole(e.target.value)}
                  placeholder="e.g. Math Teacher" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
              </div>
            )}
            <button className="btn btn-sm btn-gold" onClick={addRecord} disabled={!newName.trim()}>Add</button>
          </div>
        </div>
      )}

      {/* Summary stats with bucket breakdown */}
      {!loading && filteredRecords.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-label">Total</div>
            <div className="stat-value">{filteredRecords.length}</div>
          </div>
          {BUCKETS.map(bucket => {
            const complete = filteredRecords.filter(r => getBucketCompletion(r, bucket.key).pct === 100).length;
            const total = filteredRecords.filter(r => getBucketCompletion(r, bucket.key).total > 0).length;
            if (total === 0) return null;
            return (
              <div key={bucket.key} className="stat-card" style={{ flex: 1 }}>
                <div className="stat-label" style={{ color: bucket.color }}>{bucket.label}</div>
                <div className="stat-value" style={{ color: complete === total ? '#16A34A' : '#CA8A04' }}>{complete}/{total}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Records list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{section === 'students' ? '\u{1F393}' : '\u{1F4BC}'}</div>
          <p>No {section} records yet. Click the button above to add one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredRecords.map(r => {
            const comp = getCompletion(r);
            const additionalCount = (r.additionalDocs || []).length;
            return (
              <div key={r.id} onClick={() => setActiveRecord(r.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: comp.pct === 100 ? '#F0FDF4' : '#FFFBEB', border: `2px solid ${comp.pct === 100 ? '#16A34A' : '#CA8A04'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: comp.pct === 100 ? 16 : 10, fontWeight: 700, color: comp.pct === 100 ? '#16A34A' : '#CA8A04' }}>
                    {comp.pct === 100 ? '\u2713' : `${comp.pct}%`}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>
                      {section === 'students' && r.grade && <span style={{ marginRight: 8 }}>{r.grade}</span>}
                      {section === 'students' && r.house && <span style={{ marginRight: 8 }}>{r.house}</span>}
                      {section === 'personnel' && r.role && <span style={{ marginRight: 8 }}>{r.role}</span>}
                      {BUCKETS.map(b => {
                        const bc = getBucketCompletion(r, b.key);
                        if (bc.total === 0) return null;
                        return <span key={b.key} style={{ marginRight: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: bc.pct === 100 ? '#D1FAE5' : b.bg, color: bc.pct === 100 ? '#065F46' : b.color, fontWeight: 600 }}>{b.label[0]}: {bc.uploaded}/{bc.total}</span>;
                      })}
                      {additionalCount > 0 && <span style={{ fontSize: 10 }}>+{additionalCount}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ width: 80, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${comp.pct}%`, height: '100%', background: comp.pct === 100 ? '#16A34A' : '#CA8A04', borderRadius: 3 }} />
                  </div>
                  <button className="remove-btn" style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); deleteRecord(r.id); }}>x</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// DOC TYPE CONFIGURATION — manage custom document types and buckets
// ════════════════════════════════════════════
function DocTypeConfig({ studentDocs, personnelDocs, onSave, onCancel }) {
  const [sDocs, setSDocs] = useState(studentDocs.map(d => ({ ...d })));
  const [pDocs, setPDocs] = useState(personnelDocs.map(d => ({ ...d })));
  const [tab, setTab] = useState('students');
  const docs = tab === 'students' ? sDocs : pDocs;
  const setDocs = tab === 'students' ? setSDocs : setPDocs;

  const addDoc = () => {
    const label = window.prompt('New document type name:');
    if (!label?.trim()) return;
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (docs.some(d => d.key === key)) { alert('A document with that name already exists.'); return; }
    setDocs([...docs, { key, label: label.trim(), bucket: 'enrollment' }]);
  };

  const removeDoc = (key) => {
    if (!window.confirm('Remove this document type? Students who already uploaded it will keep their files.')) return;
    setDocs(docs.filter(d => d.key !== key));
  };

  const updateBucket = (key, bucket) => {
    setDocs(docs.map(d => d.key === key ? { ...d, bucket } : d));
  };

  const renameDoc = (key) => {
    const current = docs.find(d => d.key === key);
    const newLabel = window.prompt('Rename document type:', current?.label || '');
    if (!newLabel?.trim()) return;
    setDocs(docs.map(d => d.key === key ? { ...d, label: newLabel.trim() } : d));
  };

  const moveDoc = (idx, dir) => {
    const arr = [...docs];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setDocs(arr);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title" style={{ margin: 0 }}>Document Type Configuration</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-gold" onClick={() => onSave(sDocs, pDocs)}>Save Changes</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'students' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('students')}>Student Documents</button>
        <button className={`btn btn-sm ${tab === 'personnel' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('personnel')}>Personnel Documents</button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: '#6B7280' }}>
        Assign each document type to a bucket: <strong style={{ color: '#7C3AED' }}>Pre-Admission</strong> (required before acceptance),{' '}
        <strong style={{ color: '#0369A1' }}>Enrollment</strong> (due before first day),{' '}
        <strong style={{ color: '#15803D' }}>Maintenance</strong> (ongoing/annual).
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {docs.map((d, idx) => {
          const bucket = BUCKETS.find(b => b.key === d.bucket) || BUCKETS[1];
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button onClick={() => moveDoc(idx, -1)} disabled={idx === 0}
                  style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, color: idx === 0 ? '#D1D5DB' : '#6B7280', padding: 0 }}>▲</button>
                <button onClick={() => moveDoc(idx, 1)} disabled={idx === docs.length - 1}
                  style={{ background: 'none', border: 'none', cursor: idx === docs.length - 1 ? 'default' : 'pointer', fontSize: 10, color: idx === docs.length - 1 ? '#D1D5DB' : '#6B7280', padding: 0 }}>▼</button>
              </div>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C', flex: 1, cursor: 'pointer' }} onClick={() => renameDoc(d.key)}>{d.label}</span>
              <select value={d.bucket || 'enrollment'} onChange={e => updateBucket(d.key, e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${bucket.border}`, borderRadius: 4, background: bucket.bg, color: bucket.color, fontWeight: 600 }}>
                {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeDoc(d.key)}>x</button>
            </div>
          );
        })}
      </div>

      <button className="btn btn-sm btn-secondary" onClick={addDoc} style={{ marginTop: 12 }}>+ Add Document Type</button>
    </div>
  );
}

// ════════════════════════════════════════════
// ADDITIONAL DOCS SUB-COMPONENT
// ════════════════════════════════════════════
function AdditionalDocs({ record, uploading, onUpload, onLink, onDelete }) {
  const [addLabel, setAddLabel] = useState('');
  const [addFile, setAddFile] = useState(null);

  const handleUpload = () => {
    if (!addFile) return;
    onUpload(addFile, addLabel || addFile.name);
    setAddLabel(''); setAddFile(null);
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', margin: '0 0 12px 0', fontSize: 14 }}>Additional Documentation</h4>
      {(record.additionalDocs || []).length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12, border: '1px dashed #E5E7EB', borderRadius: 8, marginBottom: 12 }}>No additional documents yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {(record.additionalDocs || []).map(ad => (
            <div key={ad.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#1B3A5C' }}>{ad.label}{ad.isLink && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6 }}>(Drive link)</span>}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{ad.isLink ? 'Linked' : ad.fileName} &middot; {new Date(ad.uploadedAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={ad.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ fontSize: 11, textDecoration: 'none' }}>View</a>
                <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => onDelete(ad.id)}>x</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Document Label</label>
          <input type="text" value={addLabel} onChange={e => setAddLabel(e.target.value)}
            placeholder="e.g. Medical Form, Transcript" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }} />
        </div>
        <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => onLink(addLabel)}>📁 Link from Google Drive</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
        Tip: upload your document to Google Drive first, then paste the share link here. This keeps files safe in your school's Drive even if this app is retired.
      </div>
    </div>
  );
}
