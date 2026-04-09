import React, { useState, useMemo } from 'react';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const AGENDA_SECTIONS = [
  'Call to Order & Opening Prayer',
  'Approval of Previous Minutes',
  'Old Business',
  'New Business',
  'Financial Report',
  'Headmaster Report',
  'Committee Reports',
  'Action Items',
  'Closing Prayer & Adjournment',
];

const STATUS_LABELS = { draft: 'Draft', approved: 'Approved' };
const STATUS_COLORS = { draft: '#CA8A04', approved: '#16A34A' };

export default function BoardMinutes({ meetings, onSave, onDelete, directors }) {
  const [view, setView] = useState('list'); // list | edit | view
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const sorted = useMemo(() => {
    let list = [...(meetings || [])];
    if (filterStatus !== 'all') list = list.filter(m => m.status === filterStatus);
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [meetings, filterStatus]);

  const createMeeting = () => {
    if (!newDate) return;
    const meeting = {
      id: genId(),
      date: newDate,
      title: newTitle || `Board Meeting — ${new Date(newDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      attendees: [],
      sections: AGENDA_SECTIONS.map(name => ({ id: genId(), name, content: '' })),
      actionItems: [],
      versions: [],
    };
    onSave([...(meetings || []), meeting]);
    setNewDate('');
    setNewTitle('');
    setShowNewForm(false);
    openEdit(meeting);
  };

  const openEdit = (meeting) => {
    setDraft(JSON.parse(JSON.stringify(meeting)));
    setActiveMeeting(meeting.id);
    setView('edit');
  };

  const openView = (meeting) => {
    setActiveMeeting(meeting.id);
    setDraft(null);
    setView('view');
  };

  const saveDraft = () => {
    if (!draft) return;
    // Save a version snapshot before updating
    const existing = meetings.find(m => m.id === draft.id);
    if (existing && existing.status === 'draft') {
      if (!draft.versions) draft.versions = [];
      draft.versions.push({
        id: genId(),
        timestamp: new Date().toISOString(),
        snapshot: JSON.parse(JSON.stringify(existing)),
      });
      // Keep only last 20 versions
      if (draft.versions.length > 20) draft.versions = draft.versions.slice(-20);
    }
    draft.lastModified = new Date().toISOString();
    const updated = (meetings || []).map(m => m.id === draft.id ? draft : m);
    onSave(updated);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Minutes saved' }));
  };

  const approveMinutes = () => {
    if (!draft) return;
    if (!window.confirm('Approve and lock these minutes? They will become read-only.')) return;
    draft.status = 'approved';
    draft.approvedAt = new Date().toISOString();
    draft.lastModified = new Date().toISOString();
    const updated = (meetings || []).map(m => m.id === draft.id ? draft : m);
    onSave(updated);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Minutes approved and locked' }));
    openView(draft);
  };

  const deleteMeeting = (id) => {
    const meeting = meetings.find(m => m.id === id);
    if (meeting?.status === 'approved') { alert('Cannot delete approved minutes.'); return; }
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    onSave((meetings || []).filter(m => m.id !== id));
    if (activeMeeting === id) { setView('list'); setActiveMeeting(null); }
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Draft deleted' }));
  };

  const generatePdf = (meeting) => {
    const m = meeting || draft || meetings.find(mm => mm.id === activeMeeting);
    if (!m) return;
    const w = window.open('', '_blank');
    const sectionsHtml = (m.sections || []).map(s => `
      <div style="margin-bottom:16px;">
        <h3 style="font-family:Georgia,serif;color:#1B3A5C;font-size:14px;margin-bottom:4px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">${s.name}</h3>
        <div style="font-size:12px;color:#374151;white-space:pre-wrap;line-height:1.6;">${s.content || '<em style="color:#9CA3AF;">No notes</em>'}</div>
      </div>
    `).join('');
    const actionHtml = (m.actionItems || []).length > 0 ? `
      <h3 style="font-family:Georgia,serif;color:#1B3A5C;font-size:14px;margin-top:20px;margin-bottom:8px;">Action Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="text-align:left;padding:6px;border-bottom:2px solid #E5E7EB;">Task</th><th style="text-align:left;padding:6px;border-bottom:2px solid #E5E7EB;">Assigned To</th><th style="text-align:left;padding:6px;border-bottom:2px solid #E5E7EB;">Due Date</th><th style="text-align:center;padding:6px;border-bottom:2px solid #E5E7EB;">Status</th></tr></thead>
        <tbody>${m.actionItems.map(a => `<tr><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.task}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.assignee || ''}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.dueDate || ''}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;text-align:center;">${a.complete ? '✓ Complete' : 'Pending'}</td></tr>`).join('')}</tbody>
      </table>` : '';
    const attendeeHtml = (m.attendees || []).length > 0 ? `<div style="font-size:12px;color:#6B7280;margin-bottom:16px;"><strong>Attendees:</strong> ${m.attendees.join(', ')}</div>` : '';
    w.document.write(`<!DOCTYPE html><html><head><title>Board Minutes — ${m.date}</title>
      <style>body{font-family:'Segoe UI',sans-serif;color:#1F2937;max-width:800px;margin:0 auto;padding:32px;}
      @media print{body{padding:16px;}}</style></head><body>
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="font-family:Georgia,serif;color:#1B3A5C;font-size:20px;margin-bottom:2px;">Chesterton Academy of the Florida Martyrs</h1>
        <h2 style="font-family:Georgia,serif;color:#6B7280;font-size:16px;font-weight:400;margin-top:4px;">${m.title}</h2>
        <div style="font-size:12px;color:#9CA3AF;">${new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${m.status === 'approved' ? ' · APPROVED' : ' · DRAFT'}</div>
      </div>
      ${attendeeHtml}
      ${sectionsHtml}
      ${actionHtml}
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E5E7EB;font-size:10px;color:#9CA3AF;text-align:center;">
        Generated ${new Date().toLocaleDateString()} · Chesterton Academy of the Florida Martyrs
      </div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ---- LIST VIEW ----
  if (view === 'list') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="section-title">Board Minutes</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB' }}>
              <option value="all">All ({(meetings || []).length})</option>
              <option value="draft">Drafts ({(meetings || []).filter(m => m.status === 'draft').length})</option>
              <option value="approved">Approved ({(meetings || []).filter(m => m.status === 'approved').length})</option>
            </select>
            <button className="btn btn-sm btn-primary" onClick={() => setShowNewForm(!showNewForm)}>{showNewForm ? 'Cancel' : '+ New Meeting'}</button>
          </div>
        </div>

        {showNewForm && (
          <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>New Meeting</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Date *</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Title (optional)</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Board Meeting" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
              </div>
              <button className="btn btn-sm btn-gold" onClick={createMeeting} disabled={!newDate}>Create</button>
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>&#128221;</div>
            <p>No board minutes yet. Create your first meeting to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onClick={() => m.status === 'approved' ? openView(m) : openEdit(m)}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 14 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    {new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    {m.actionItems?.length > 0 && <span style={{ marginLeft: 8 }}>{m.actionItems.filter(a => !a.complete).length} open tasks</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[m.status], padding: '2px 8px', background: m.status === 'approved' ? '#F0FDF4' : '#FFFBEB', borderRadius: 4, border: `1px solid ${m.status === 'approved' ? '#BBF7D0' : '#FDE68A'}` }}>
                    {m.status === 'approved' ? '\u{1F512} ' : ''}{STATUS_LABELS[m.status]}
                  </span>
                  <button className="btn btn-sm btn-secondary" style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); generatePdf(m); }}>PDF</button>
                  {m.status === 'draft' && <button className="remove-btn" onClick={e => { e.stopPropagation(); deleteMeeting(m.id); }}>x</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- VIEW MODE (approved, read-only) ----
  if (view === 'view') {
    const m = meetings.find(mm => mm.id === activeMeeting);
    if (!m) { setView('list'); return null; }
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setView('list')}>&larr; Back to All Minutes</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', padding: '4px 10px', background: '#F0FDF4', borderRadius: 6, border: '1px solid #BBF7D0' }}>
              &#128274; Approved {m.approvedAt ? new Date(m.approvedAt).toLocaleDateString() : ''}
            </span>
            <button className="btn btn-sm btn-gold" onClick={() => generatePdf(m)}>Export PDF</button>
          </div>
        </div>
        <h3 className="section-title" style={{ marginBottom: 4 }}>{m.title}</h3>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
          {new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {m.attendees?.length > 0 && <span style={{ marginLeft: 12 }}>Attendees: {m.attendees.join(', ')}</span>}
        </div>
        {(m.sections || []).map(s => (
          <div key={s.id} style={{ marginBottom: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13, marginBottom: 4 }}>{s.name}</div>
            <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{s.content || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No notes</span>}</div>
          </div>
        ))}
        {(m.actionItems || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginBottom: 8, fontSize: 14 }}>Action Items</h4>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th>Task</th><th>Assigned To</th><th>Due Date</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
              <tbody>
                {m.actionItems.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.task}</td>
                    <td>{a.assignee}</td>
                    <td>{a.dueDate}</td>
                    <td style={{ textAlign: 'center', color: a.complete ? '#16A34A' : '#CA8A04', fontWeight: 600 }}>{a.complete ? '✓ Complete' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---- EDIT MODE (draft) ----
  if (view === 'edit' && draft) {
    const updateDraft = (fn) => { setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; }); };
    const updateSection = (sId, content) => { updateDraft(d => { const s = d.sections.find(sec => sec.id === sId); if (s) s.content = content; }); };
    const addSection = () => {
      const name = window.prompt('Section name:');
      if (!name) return;
      updateDraft(d => { d.sections.push({ id: genId(), name, content: '' }); });
    };
    const removeSection = (sId) => { if (window.confirm('Remove this section?')) updateDraft(d => { d.sections = d.sections.filter(s => s.id !== sId); }); };
    const addActionItem = () => { updateDraft(d => { if (!d.actionItems) d.actionItems = []; d.actionItems.push({ id: genId(), task: '', assignee: '', dueDate: '', complete: false }); }); };
    const updateAction = (aId, field, value) => { updateDraft(d => { const a = (d.actionItems || []).find(ai => ai.id === aId); if (a) a[field] = value; }); };
    const removeAction = (aId) => { updateDraft(d => { d.actionItems = (d.actionItems || []).filter(a => a.id !== aId); }); };
    const toggleAction = (aId) => { updateDraft(d => { const a = (d.actionItems || []).find(ai => ai.id === aId); if (a) a.complete = !a.complete; }); };

    // Attendee management
    const [newAttendee, setNewAttendee] = useState('');
    const addAttendee = () => { if (!newAttendee.trim()) return; updateDraft(d => { if (!d.attendees) d.attendees = []; if (!d.attendees.includes(newAttendee.trim())) d.attendees.push(newAttendee.trim()); }); setNewAttendee(''); };
    const removeAttendee = (name) => { updateDraft(d => { d.attendees = (d.attendees || []).filter(a => a !== name); }); };

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setView('list')}>&larr; Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#CA8A04', padding: '4px 10px', background: '#FFFBEB', borderRadius: 6, border: '1px solid #FDE68A' }}>DRAFT</span>
            <button className="btn btn-sm btn-secondary" onClick={() => generatePdf(draft)}>Preview PDF</button>
            <button className="btn btn-sm btn-primary" onClick={saveDraft}>Save Draft</button>
            <button className="btn btn-sm btn-gold" onClick={approveMinutes}>Approve & Lock</button>
          </div>
        </div>

        {/* Title & Date */}
        <div style={{ marginBottom: 16 }}>
          <input type="text" value={draft.title} onChange={e => updateDraft(d => { d.title = e.target.value; })}
            style={{ width: '100%', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: '#1B3A5C', border: 'none', borderBottom: '2px solid #E5E7EB', padding: '8px 0', background: 'transparent' }} />
          <input type="date" value={draft.date} onChange={e => updateDraft(d => { d.date = e.target.value; })}
            style={{ fontSize: 12, marginTop: 8, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }} />
        </div>

        {/* Attendees */}
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>Attendees</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {(draft.attendees || []).map(a => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}>
                {a} <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeAttendee(a)}>x</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="text" value={newAttendee} onChange={e => setNewAttendee(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAttendee()}
              placeholder="Add attendee name" style={{ fontSize: 12, padding: '4px 8px', width: 200 }} />
            {directors && directors.filter(d => !(draft.attendees || []).includes(d.name)).length > 0 && (
              <select onChange={e => { if (e.target.value) { updateDraft(d => { if (!d.attendees) d.attendees = []; if (!d.attendees.includes(e.target.value)) d.attendees.push(e.target.value); }); e.target.value = ''; } }}
                style={{ fontSize: 12, padding: '4px 8px' }}>
                <option value="">Quick add...</option>
                {directors.filter(d => !(draft.attendees || []).includes(d.name)).map(d => (
                  <option key={d.id || d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            )}
            <button className="btn btn-sm btn-secondary" onClick={addAttendee}>+</button>
          </div>
        </div>

        {/* Agenda / Minutes Sections */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Agenda & Minutes</div>
            <button className="btn btn-sm btn-secondary" onClick={addSection}>+ Add Section</button>
          </div>
          {(draft.sections || []).map(s => (
            <div key={s.id} style={{ marginBottom: 10, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <span style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>{s.name}</span>
                <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeSection(s.id)}>x</button>
              </div>
              <textarea value={s.content} onChange={e => updateSection(s.id, e.target.value)}
                placeholder="Enter notes for this section..."
                style={{ width: '100%', border: 'none', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, minHeight: 80, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>

        {/* Action Items */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Action Items</div>
            <button className="btn btn-sm btn-secondary" onClick={addActionItem}>+ Add Task</button>
          </div>
          {(draft.actionItems || []).length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12, border: '1px dashed #E5E7EB', borderRadius: 8 }}>No action items yet</div>
          ) : (
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th style={{ width: 30 }}></th><th>Task</th><th style={{ width: 150 }}>Assigned To</th><th style={{ width: 120 }}>Due Date</th><th style={{ width: 30 }}></th></tr></thead>
              <tbody>
                {(draft.actionItems || []).map(a => (
                  <tr key={a.id} style={{ background: a.complete ? '#F0FDF4' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={a.complete || false} onChange={() => toggleAction(a.id)} />
                    </td>
                    <td><input type="text" value={a.task} onChange={e => updateAction(a.id, 'task', e.target.value)} placeholder="Task description" style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12, textDecoration: a.complete ? 'line-through' : 'none' }} /></td>
                    <td><input type="text" value={a.assignee || ''} onChange={e => updateAction(a.id, 'assignee', e.target.value)} placeholder="Who?" style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12 }} /></td>
                    <td><input type="date" value={a.dueDate || ''} onChange={e => updateAction(a.id, 'dueDate', e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12 }} /></td>
                    <td><button className="remove-btn" onClick={() => removeAction(a.id)}>x</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Version History */}
        {(draft.versions || []).length > 0 && (
          <details style={{ marginTop: 16, padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Version History ({draft.versions.length} saved versions)</summary>
            <div style={{ marginTop: 8 }}>
              {[...draft.versions].reverse().map(v => (
                <div key={v.id} style={{ fontSize: 12, color: '#6B7280', padding: '4px 0', borderBottom: '1px solid #E5E7EB' }}>
                  {new Date(v.timestamp).toLocaleString()} — {v.snapshot?.sections?.filter(s => s.content).length || 0} sections with content
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  return null;
}
