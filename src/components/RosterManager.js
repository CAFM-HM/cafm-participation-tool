import React, { useState, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, teacherDisplayName, UID_MAP } from '../firebase';

export default function RosterManager({ allTeachers, onRefresh }) {
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingClass, setEditingClass] = useState(null); // { teacherUid, classId, newName }
  const [editingTeacher, setEditingTeacher] = useState(null); // { uid, newName }
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Rename class
  const handleRenameClass = useCallback(async () => {
    if (!editingClass || !editingClass.newName.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const ref = doc(db, 'teachers', editingClass.teacherUid, 'classes', editingClass.classId);
      await updateDoc(ref, { cls: editingClass.newName.trim() });
      setMessage(`Class renamed to "${editingClass.newName.trim()}".`);
      setEditingClass(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    setSaving(false);
  }, [editingClass, onRefresh]);

  // Rename teacher display name (stored in config/teacherNames)
  const handleRenameTeacher = useCallback(async () => {
    if (!editingTeacher || !editingTeacher.newName.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const ref = doc(db, 'config', 'teacherNames');
      const snap = await getDoc(ref);
      const names = snap.exists() ? snap.data() : {};
      names[editingTeacher.uid] = editingTeacher.newName.trim();
      await setDoc(ref, names);
      setMessage(`Teacher display name updated to "${editingTeacher.newName.trim()}".`);
      setEditingTeacher(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    setSaving(false);
  }, [editingTeacher, onRefresh]);

  const handleRename = useCallback(async () => {
    if (!editingStudent || !editingStudent.newName.trim()) return;
    if (editingStudent.newName.trim() === editingStudent.oldName) {
      setEditingStudent(null);
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const { teacherUid, classId, oldName, newName: rawNew } = editingStudent;
      const newName = rawNew.trim();
      const ref = doc(db, 'teachers', teacherUid, 'classes', classId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setMessage('Error: Class not found.');
        setSaving(false);
        return;
      }

      const data = snap.data();
      const updates = {};

      // Update roster array
      const newRoster = (data.roster || []).map(n => n === oldName ? newName : n);
      updates.roster = newRoster;

      // Update scores: rename student key under each date
      const scores = data.scores || {};
      const newScores = {};
      for (const [dateStr, dateData] of Object.entries(scores)) {
        newScores[dateStr] = {};
        for (const [stuName, virtueScores] of Object.entries(dateData)) {
          if (stuName === oldName) {
            newScores[dateStr][newName] = virtueScores;
          } else {
            newScores[dateStr][stuName] = virtueScores;
          }
        }
      }
      updates.scores = newScores;

      // Update pronouns/houses maps if they exist
      if (data.pronouns && data.pronouns[oldName]) {
        updates[`pronouns.${newName}`] = data.pronouns[oldName];
        updates[`pronouns.${oldName}`] = null; // Firestore will delete null fields
      }
      if (data.houses && data.houses[oldName]) {
        updates[`houses.${newName}`] = data.houses[oldName];
        updates[`houses.${oldName}`] = null;
      }

      await updateDoc(ref, updates);
      setMessage(`Renamed "${oldName}" to "${newName}" — roster and all scores updated.`);
      setEditingStudent(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error renaming student:', err);
      setMessage('Error: ' + err.message);
    }
    setSaving(false);
  }, [editingStudent, onRefresh]);

  return (
    <div>
      {message && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 6, fontSize: 13,
          background: message.startsWith('Error') ? '#FEF2F2' : '#F0FDF4',
          color: message.startsWith('Error') ? '#DC2626' : '#16A34A',
          border: `1px solid ${message.startsWith('Error') ? '#FECACA' : '#BBF7D0'}`,
        }}>
          {message}
        </div>
      )}

      {allTeachers.map(teacher => (
        <div key={teacher.uid} style={{ marginBottom: 20 }}>
          {editingTeacher?.uid === teacher.uid ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
              <input type="text" value={editingTeacher.newName}
                onChange={e => setEditingTeacher({ ...editingTeacher, newName: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleRenameTeacher()}
                style={{ width: 200, fontSize: 14, padding: '4px 8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}
                autoFocus />
              <button className="btn btn-sm btn-primary" onClick={handleRenameTeacher} disabled={saving}>{saving ? '...' : 'Save'}</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setEditingTeacher(null)}>Cancel</button>
            </div>
          ) : (
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: '#1B3A5C', marginBottom: 8, cursor: 'pointer' }}
              onClick={() => setEditingTeacher({ uid: teacher.uid, newName: teacherDisplayName(teacher.uid) })}
              title="Click to rename">
              {teacherDisplayName(teacher.uid)} <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>✎</span>
            </h3>
          )}
          {(teacher.classes || []).length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 12 }}>No classes</div>
          ) : (
            teacher.classes.map(cls => (
              <div key={cls.id} style={{ marginLeft: 12, marginBottom: 12 }}>
                {editingClass?.classId === cls.id && editingClass?.teacherUid === teacher.uid ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                    <input type="text" value={editingClass.newName}
                      onChange={e => setEditingClass({ ...editingClass, newName: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleRenameClass()}
                      style={{ width: 200, fontSize: 13, padding: '4px 8px' }}
                      autoFocus />
                    <button className="btn btn-sm btn-primary" onClick={handleRenameClass} disabled={saving}>{saving ? '...' : 'Save'}</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => setEditingClass(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => setEditingClass({ teacherUid: teacher.uid, classId: cls.id, newName: cls.name })}
                    title="Click to rename class">
                    {cls.name} ({cls.students?.length || 0} students) <span style={{ fontSize: 11, color: '#9CA3AF' }}>✎</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(cls.students || []).map(stu => {
                    const isEditing = editingStudent?.teacherUid === teacher.uid
                      && editingStudent?.classId === cls.id
                      && editingStudent?.oldName === stu.name;

                    if (isEditing) {
                      return (
                        <div key={stu.name} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={editingStudent.newName}
                            onChange={e => setEditingStudent({ ...editingStudent, newName: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleRename()}
                            style={{ width: 180, fontSize: 13, padding: '4px 8px' }}
                            autoFocus
                          />
                          <button className="btn btn-sm btn-primary" onClick={handleRename} disabled={saving}>
                            {saving ? '...' : 'Save'}
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditingStudent(null)}>Cancel</button>
                        </div>
                      );
                    }

                    return (
                      <button key={stu.name} className="btn btn-sm btn-secondary"
                        onClick={() => setEditingStudent({
                          teacherUid: teacher.uid,
                          classId: cls.id,
                          oldName: stu.name,
                          newName: stu.name,
                        })}
                        title="Click to rename"
                      >
                        {stu.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
