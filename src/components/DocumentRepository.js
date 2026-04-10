import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

// Required document checklists
const STUDENT_DOCS = [
  { key: 'application', label: 'Application' },
  { key: 'parent_questionnaire', label: 'Parent Questionnaire' },
  { key: 'student_questionnaire', label: 'Student Questionnaire' },
  { key: 'teacher_questionnaire', label: 'Teacher Questionnaire' },
  { key: 'immunization', label: 'Immunization Documentation' },
  { key: 'handbook_ack', label: 'Handbook Acknowledgement' },
  { key: 'parent_agreement', label: 'Parent Agreement' },
];

const PERSONNEL_DOCS = [
  { key: 'application', label: 'Application' },
  { key: 'background_check', label: 'Background Check' },
  { key: 'safe_environment', label: 'Safe Environment Documentation' },
];

const GRADES = ['9th', '10th', '11th', '12th'];

export default function DocumentRepository({ masterStudents, uid }) {
  const [section, setSection] = useState('students'); // students | personnel
  const [records, setRecords] = useState([]); // all document records from Firestore
  const [loading, setLoading] = useState(true);
  const [activeRecord, setActiveRecord] = useState(null); // selected person's ID
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(null); // which doc key is currently uploading
  const [searchTerm, setSearchTerm] = useState('');

  // New person form
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newHouse, setNewHouse] = useState('');
  const [newRole, setNewRole] = useState(''); // personnel role/title
  const [rosterSearch, setRosterSearch] = useState('');

  const HOUSES = ['Augustine', 'Athanasius', 'Ambrose', 'Chrysostom'];

  // Load all document records
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'documentRepository'), orderBy('name', 'asc')));
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Document repository load failed:', err);
      // Try without ordering
      try {
        const snap = await getDocs(collection(db, 'documentRepository'));
        setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err2) { console.error(err2); }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => r.type === section)
      .filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [records, section, searchTerm]);

  const active = records.find(r => r.id === activeRecord);
  const docChecklist = section === 'students' ? STUDENT_DOCS : PERSONNEL_DOCS;

  // Roster matching for auto-fill
  const rosterMatches = useMemo(() => {
    if (!rosterSearch || !masterStudents) return [];
    return masterStudents.filter(s =>
      s.name.toLowerCase().includes(rosterSearch.toLowerCase())
    ).slice(0, 8);
  }, [rosterSearch, masterStudents]);

  const selectFromRoster = (student) => {
    setNewName(student.name);
    setNewHouse(student.house || '');
    setRosterSearch('');
    // Try to find grade from student data if available
    if (student.grade) setNewGrade(student.grade);
  };

  const addRecord = async () => {
    if (!newName.trim()) return;
    const record = {
      name: newName.trim(),
      type: section,
      dob: section === 'students' ? newDob : '',
      grade: section === 'students' ? newGrade : '',
      house: section === 'students' ? newHouse : '',
      role: section === 'personnel' ? newRole : '',
      documents: {},
      additionalDocs: [],
      createdAt: new Date().toISOString(),
      createdBy: uid,
    };
    try {
      await addDoc(collection(db, 'documentRepository'), record);
      const savedName = newName.trim();
      setNewName(''); setNewDob(''); setNewGrade(''); setNewHouse(''); setNewRole('');
      setShowAddForm(false);
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${savedName} added to ${section}` }));
    } catch (err) {
      console.error('Add record failed:', err);
      alert('Failed to add record: ' + err.message + '\n\nCheck your Firestore rules — they need to allow authenticated writes.');
    }
  };

  const deleteRecord = async (id) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    if (!window.confirm(`Delete ${rec.name} and all uploaded documents? This cannot be undone.`)) return;
    // Delete all files from storage
    const allDocs = { ...rec.documents };
    for (const key of Object.keys(allDocs)) {
      if (allDocs[key]?.storagePath) {
        try { await deleteObject(ref(storage, allDocs[key].storagePath)); } catch (_) {}
      }
    }
    for (const ad of (rec.additionalDocs || [])) {
      if (ad.storagePath) {
        try { await deleteObject(ref(storage, ad.storagePath)); } catch (_) {}
      }
    }
    await deleteDoc(doc(db, 'documentRepository', id));
    if (activeRecord === id) setActiveRecord(null);
    await load();
    window.dispatchEvent(new CustomEvent('toast', { detail: `${rec.name} deleted` }));
  };

  // Upload a required document
  const uploadDocument = async (recordId, docKey, file) => {
    setUploading(docKey);
    try {
      const rec = records.find(r => r.id === recordId);
      const storagePath = `documents/${rec.type}/${recordId}/${docKey}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const documents = { ...(rec.documents || {}) };
      documents[docKey] = {
        fileName: file.name,
        storagePath,
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      };
      await updateDoc(doc(db, 'documentRepository', recordId), { documents });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${file.name} uploaded` }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
    }
    setUploading(null);
  };

  // Upload additional document
  const uploadAdditional = async (recordId, file, label) => {
    setUploading('additional');
    try {
      const rec = records.find(r => r.id === recordId);
      const storagePath = `documents/${rec.type}/${recordId}/additional_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const additionalDocs = [...(rec.additionalDocs || [])];
      additionalDocs.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        label: label || file.name,
        fileName: file.name,
        storagePath,
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      });
      await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${file.name} uploaded` }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
    }
    setUploading(null);
  };

  // Link a document from Google Drive (or any URL)
  const linkDocument = async (recordId, docKey) => {
    const url = window.prompt('Paste the Google Drive share link (or any URL) for this document:');
    if (!url || !url.trim()) return;
    try {
      const rec = records.find(r => r.id === recordId);
      const documents = { ...(rec.documents || {}) };
      documents[docKey] = {
        fileName: 'Google Drive Link',
        url: url.trim(),
        isLink: true,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      };
      await updateDoc(doc(db, 'documentRepository', recordId), { documents });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Document linked' }));
    } catch (err) {
      console.error('Link error:', err);
      alert('Failed to link document: ' + err.message);
    }
  };

  // Link additional document
  const linkAdditional = async (recordId, label) => {
    const url = window.prompt('Paste the Google Drive share link (or any URL):');
    if (!url || !url.trim()) return;
    const docLabel = label || window.prompt('Label for this document:') || 'Linked Document';
    try {
      const rec = records.find(r => r.id === recordId);
      const additionalDocs = [...(rec.additionalDocs || [])];
      additionalDocs.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        label: docLabel,
        fileName: 'Google Drive Link',
        url: url.trim(),
        isLink: true,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uid,
      });
      await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
      await load();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Document linked' }));
    } catch (err) {
      console.error('Link error:', err);
      alert('Failed to link document: ' + err.message);
    }
  };

  // Delete a specific document
  const deleteDocument = async (recordId, docKey) => {
    if (!window.confirm('Remove this document?')) return;
    const rec = records.find(r => r.id === recordId);
    const docInfo = rec.documents[docKey];
    if (docInfo?.storagePath) {
      try { await deleteObject(ref(storage, docInfo.storagePath)); } catch (_) {}
    }
    const documents = { ...(rec.documents || {}) };
    delete documents[docKey];
    await updateDoc(doc(db, 'documentRepository', recordId), { documents });
    await load();
  };

  // Delete additional document
  const deleteAdditionalDoc = async (recordId, docId) => {
    if (!window.confirm('Remove this document?')) return;
    const rec = records.find(r => r.id === recordId);
    const ad = (rec.additionalDocs || []).find(d => d.id === docId);
    if (ad?.storagePath) {
      try { await deleteObject(ref(storage, ad.storagePath)); } catch (_) {}
    }
    const additionalDocs = (rec.additionalDocs || []).filter(d => d.id !== docId);
    await updateDoc(doc(db, 'documentRepository', recordId), { additionalDocs });
    await load();
  };

  // Update record fields (DOB, grade, house, role)
  const updateField = async (recordId, field, value) => {
    await updateDoc(doc(db, 'documentRepository', recordId), { [field]: value });
    await load();
  };

  // Completion stats
  const getCompletion = (rec) => {
    const checklist = rec.type === 'students' ? STUDENT_DOCS : PERSONNEL_DOCS;
    const uploaded = checklist.filter(d => rec.documents?.[d.key]).length;
    return { uploaded, total: checklist.length, pct: Math.round((uploaded / checklist.length) * 100) };
  };

  // ---- DETAIL VIEW ----
  if (active) {
    const comp = getCompletion(active);
    const isStudent = active.type === 'students';

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
                onChange={e => {
                  const val = e.target.value;
                  setRecords(prev => prev.map(r => r.id === active.id ? { ...r, role: val } : r));
                }}
                placeholder="e.g. Math Teacher, Administrator"
                style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4, width: 300 }} />
            </div>
          )}
        </div>

        {/* Required Documents Checklist */}
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', margin: '0 0 12px 0', fontSize: 14 }}>Required Documents</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docChecklist.map(d => {
              const uploaded = active.documents?.[d.key];
              return (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: uploaded ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${uploaded ? '#BBF7D0' : '#FED7AA'}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{uploaded ? '\u2705' : '\u{1F7E0}'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A5C' }}>
                        {d.label}
                        {uploaded?.isLink && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6, fontWeight: 400 }}>(Drive link)</span>}
                      </div>
                      {uploaded && (
                        <div style={{ fontSize: 11, color: '#6B7280' }}>
                          {uploaded.isLink ? 'Linked' : uploaded.fileName} &middot; {new Date(uploaded.uploadedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {uploaded && (
                      <>
                        <a href={uploaded.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ fontSize: 11, textDecoration: 'none' }}>View</a>
                        <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => deleteDocument(active.id, d.key)}>x</button>
                      </>
                    )}
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
                      onClick={() => linkDocument(active.id, d.key)}>
                      {'\u{1F517}'} Link
                    </button>
                    <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer', margin: 0, fontSize: 11, opacity: uploading === d.key ? 0.5 : 1 }}>
                      {uploading === d.key ? 'Uploading...' : (uploaded ? 'Replace' : 'Upload')}
                      <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" style={{ display: 'none' }}
                        disabled={uploading === d.key}
                        onChange={e => { if (e.target.files[0]) uploadDocument(active.id, d.key, e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Additional Documentation */}
        <AdditionalDocs
          record={active}
          uploading={uploading}
          onUpload={(file, label) => uploadAdditional(active.id, file, label)}
          onLink={(label) => linkAdditional(active.id, label)}
          onDelete={(docId) => deleteAdditionalDoc(active.id, docId)}
        />
      </div>
    );
  }

  // ---- LIST VIEW ----
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
        </div>
      </div>

      {/* Search & Add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder={`Search ${section}...`}
          style={{ flex: 1, minWidth: 200, fontSize: 13, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 6 }} />
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

          {/* Roster lookup for students */}
          {section === 'students' && masterStudents && masterStudents.length > 0 && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Pull from Roster</label>
              <input type="text" value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}
                placeholder="Type to search roster..."
                style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
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
                  <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)}
                    style={{ fontSize: 12, padding: '6px 8px' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Grade</label>
                  <select value={newGrade} onChange={e => setNewGrade(e.target.value)}
                    style={{ fontSize: 12, padding: '6px 8px' }}>
                    <option value="">--</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>House</label>
                  <select value={newHouse} onChange={e => setNewHouse(e.target.value)}
                    style={{ fontSize: 12, padding: '6px 8px' }}>
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

      {/* Summary stats */}
      {!loading && filteredRecords.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-label">Total {section === 'students' ? 'Students' : 'Personnel'}</div>
            <div className="stat-value">{filteredRecords.length}</div>
          </div>
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-label">Complete Files</div>
            <div className="stat-value" style={{ color: '#16A34A' }}>{filteredRecords.filter(r => getCompletion(r).pct === 100).length}</div>
          </div>
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-label">Incomplete Files</div>
            <div className="stat-value" style={{ color: '#DC2626' }}>{filteredRecords.filter(r => getCompletion(r).pct < 100).length}</div>
          </div>
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
              <div key={r.id}
                onClick={() => setActiveRecord(r.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}>
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
                      <span>{comp.uploaded}/{comp.total} required</span>
                      {additionalCount > 0 && <span style={{ marginLeft: 6 }}>+ {additionalCount} additional</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Progress bar */}
                  <div style={{ width: 80, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${comp.pct}%`, height: '100%', background: comp.pct === 100 ? '#16A34A' : '#CA8A04', borderRadius: 3, transition: 'width 0.3s' }} />
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

// Additional Documents sub-component
function AdditionalDocs({ record, uploading, onUpload, onLink, onDelete }) {
  const [addLabel, setAddLabel] = useState('');
  const [addFile, setAddFile] = useState(null);

  const handleUpload = () => {
    if (!addFile) return;
    onUpload(addFile, addLabel || addFile.name);
    setAddLabel('');
    setAddFile(null);
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', margin: '0 0 12px 0', fontSize: 14 }}>Additional Documentation</h4>

      {(record.additionalDocs || []).length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12, border: '1px dashed #E5E7EB', borderRadius: 8, marginBottom: 12 }}>
          No additional documents yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {(record.additionalDocs || []).map(ad => (
            <div key={ad.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#1B3A5C' }}>
                  {ad.label}
                  {ad.isLink && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6, fontWeight: 400 }}>(Drive link)</span>}
                </div>
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

      {/* Upload new additional doc */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Document Label</label>
          <input type="text" value={addLabel} onChange={e => setAddLabel(e.target.value)}
            placeholder="e.g. Medical Form, Transcript" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }} />
        </div>
        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}>
          {addFile ? addFile.name : 'Choose File'}
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xlsx,.csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) setAddFile(e.target.files[0]); }} />
        </label>
        <button className="btn btn-sm btn-primary" onClick={handleUpload}
          disabled={!addFile || uploading === 'additional'} style={{ fontSize: 11 }}>
          {uploading === 'additional' ? 'Uploading...' : 'Upload'}
        </button>
        <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
          onClick={() => onLink(addLabel)}>
          {'\u{1F517}'} Link from Drive
        </button>
      </div>
    </div>
  );
}
