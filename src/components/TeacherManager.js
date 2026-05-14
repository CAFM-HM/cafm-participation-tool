import React, { useState, useMemo } from 'react';
import { useTeacherDirectory } from '../hooks/useFirestore';

const PERMISSIONS = [
  { id: 'teacher', label: 'Teacher', color: '#6B7280' },
  { id: 'admin', label: 'Admin', color: '#16A34A' },
  { id: 'board', label: 'Board Member', color: '#0284C7' },
];

const CONTRACT_TYPES = [
  { id: 'ft', label: 'Full-time' },
  { id: 'pt', label: 'Part-time' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function blankTeacher() {
  return {
    name: '',
    email: '',
    phone: '',
    title: '',
    classesTaughtText: '',
    contractType: 'ft',
    defaultRoom: '',
    permission: 'teacher',
    active: true,
    pto: { sick: 0, vacation: 0, bereavement: 0 },
  };
}

function teacherToForm(t) {
  return {
    name: t.name || '',
    email: t.email || '',
    phone: t.phone || '',
    title: t.title || '',
    classesTaughtText: (t.classesTaught || []).join(', '),
    contractType: t.contractType || 'ft',
    defaultRoom: t.defaultRoom || '',
    permission: t.permission || 'teacher',
    active: t.active !== false,
    pto: {
      sick: t.pto?.sick || 0,
      vacation: t.pto?.vacation || 0,
      bereavement: t.pto?.bereavement || 0,
    },
  };
}

function formToData(form) {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    title: form.title.trim(),
    classesTaught: form.classesTaughtText.split(',').map(s => s.trim()).filter(Boolean),
    contractType: form.contractType,
    defaultRoom: form.defaultRoom.trim(),
    permission: form.permission,
    active: form.active,
    pto: {
      sick: Number(form.pto.sick) || 0,
      vacation: Number(form.pto.vacation) || 0,
      bereavement: Number(form.pto.bereavement) || 0,
    },
  };
}

function unavailabilitySummary(blocks) {
  if (!blocks || blocks.length === 0) return 'Available all periods';
  const byDay = {};
  for (const b of blocks) {
    const d = typeof b.day === 'number' ? DAY_LABELS[b.day] || `Day ${b.day}` : (b.day || '?');
    byDay[d] = (byDay[d] || 0) + (Array.isArray(b.periods) ? b.periods.length : 1);
  }
  return Object.entries(byDay).map(([d, n]) => `${d}: ${n} period${n === 1 ? '' : 's'}`).join(' · ');
}

export default function TeacherManager() {
  const { teachers, loading, migrating, addTeacher, updateTeacher, removeTeacher } = useTeacherDirectory();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [filterPermission, setFilterPermission] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [formCache, setFormCache] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState(blankTeacher());

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return teachers.filter(t => {
      if (!showInactive && t.active === false) return false;
      if (filterPermission !== 'all' && (t.permission || 'teacher') !== filterPermission) return false;
      if (s && !(`${t.name} ${t.email} ${t.title}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [teachers, search, showInactive, filterPermission]);

  const startEdit = (t) => {
    setExpandedId(expandedId === t.id ? null : t.id);
    if (expandedId !== t.id) setFormCache({ ...formCache, [t.id]: teacherToForm(t) });
  };

  const handleSave = async (t) => {
    const form = formCache[t.id];
    if (!form) return;
    if (!form.name.trim()) { alert('Name is required.'); return; }
    setSaving(true);
    try {
      await updateTeacher(t.id, formToData(form));
      setExpandedId(null);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Teacher saved' }));
    } catch (err) { console.error(err); alert('Save failed: ' + err.message); }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newForm.name.trim()) { alert('Name is required.'); return; }
    setSaving(true);
    try {
      await addTeacher(formToData(newForm));
      setNewForm(blankTeacher());
      setShowAdd(false);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Teacher added' }));
    } catch (err) { console.error(err); alert('Add failed: ' + err.message); }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    setSaving(true);
    try {
      await removeTeacher(t.id);
      setConfirmDeleteId(null);
      setExpandedId(null);
      window.dispatchEvent(new CustomEvent('toast', { detail: `Removed ${t.name}` }));
    } catch (err) { console.error(err); alert('Remove failed: ' + err.message); }
    setSaving(false);
  };

  if (loading || migrating) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
        {migrating ? 'Importing existing teachers…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Teacher Manager</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Teacher'}
        </button>
      </div>

      <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#075985', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
        This is the source of truth for staff records. Edits here sync to Schedule Builder, PTO Admin, and Access Control so those views stay in step.
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 20, padding: 16, background: '#F9FAFB' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>New Teacher</h3>
          <TeacherForm form={newForm} setForm={setNewForm} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setNewForm(blankTeacher()); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newForm.name.trim()}>
              {saving ? 'Saving…' : 'Add Teacher'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search name, email, title…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
        <select value={filterPermission} onChange={e => setFilterPermission(e.target.value)}>
          <option value="all">All roles</option>
          {PERMISSIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6B7280' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>
          {filtered.length} of {teachers.length} {teachers.length === 1 ? 'teacher' : 'teachers'}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 8 }}>
          {teachers.length === 0 ? 'No teachers yet. Click "+ Add Teacher" to add the first one.' : 'No teachers match these filters.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(t => {
            const isOpen = expandedId === t.id;
            const perm = PERMISSIONS.find(p => p.id === (t.permission || 'teacher'));
            return (
              <div key={t.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: t.active === false ? 0.6 : 1 }}>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => startEdit(t)}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1B3A5C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>
                    {(t.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name || <em style={{ color: '#9CA3AF' }}>Unnamed</em>}</div>
                    <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {t.email && <span>{t.email}</span>}
                      {t.title && <span>· {t.title}</span>}
                      {t.contractType && <span>· {t.contractType === 'ft' ? 'Full-time' : 'Part-time'}</span>}
                    </div>
                  </div>
                  <span className="badge" style={{ background: `${perm.color}1A`, color: perm.color }}>{perm.label}</span>
                  {t.active === false && <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>Inactive</span>}
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && formCache[t.id] && (
                  <div style={{ padding: 16, borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                    <TeacherForm form={formCache[t.id]} setForm={f => setFormCache({ ...formCache, [t.id]: f })} />
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12 }}>
                      <strong style={{ color: '#6B7280' }}>Availability:</strong>{' '}
                      <span style={{ color: '#1F2937' }}>{unavailabilitySummary(t.unavailable)}</span>
                      <span style={{ color: '#9CA3AF', marginLeft: 8 }}>(edit per-period blocks in Schedule Builder)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        {confirmDeleteId === t.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#DC2626' }}>Remove {t.name}? Their records elsewhere stay intact.</span>
                            <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => handleDelete(t)}>Yes, remove</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" style={{ background: 'none', color: '#DC2626' }}
                            onClick={() => setConfirmDeleteId(t.id)}>Remove teacher</button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={() => setExpandedId(null)}>Cancel</button>
                        <button className="btn btn-primary" disabled={saving || !formCache[t.id]?.name?.trim()} onClick={() => handleSave(t)}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeacherForm({ form, setForm }) {
  const upd = (patch) => setForm({ ...form, ...patch });
  const updPto = (patch) => setForm({ ...form, pto: { ...form.pto, ...patch } });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <Field label="Full name *">
          <input type="text" value={form.name} onChange={e => upd({ name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={e => upd({ email: e.target.value })} placeholder="name@chestertonpensacola.org" />
        </Field>
        <Field label="Phone">
          <input type="tel" value={form.phone} onChange={e => upd({ phone: e.target.value })} />
        </Field>
        <Field label="Title / position">
          <input type="text" value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="Theology Teacher" />
        </Field>
      </div>

      <Field label="Classes / subjects taught (comma-separated)">
        <input type="text" value={form.classesTaughtText} onChange={e => upd({ classesTaughtText: e.target.value })} placeholder="Theology I, Latin I, Rhetoric" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <Field label="Permission level">
          <select value={form.permission} onChange={e => upd({ permission: e.target.value })}>
            {PERMISSIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Contract">
          <select value={form.contractType} onChange={e => upd({ contractType: e.target.value })}>
            {CONTRACT_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Default room">
          <input type="text" value={form.defaultRoom} onChange={e => upd({ defaultRoom: e.target.value })} placeholder="Room 2" />
        </Field>
        <Field label="Status">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 0' }}>
            <input type="checkbox" checked={form.active} onChange={e => upd({ active: e.target.checked })} />
            Active staff
          </label>
        </Field>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          PTO Allotment (days/year)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <Field label="Sick">
            <input type="number" min="0" step="0.5" value={form.pto.sick} onChange={e => updPto({ sick: e.target.value })} />
          </Field>
          <Field label="Vacation">
            <input type="number" min="0" step="0.5" value={form.pto.vacation} onChange={e => updPto({ vacation: e.target.value })} />
          </Field>
          <Field label="Bereavement">
            <input type="number" min="0" step="0.5" value={form.pto.bereavement} onChange={e => updPto({ bereavement: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
