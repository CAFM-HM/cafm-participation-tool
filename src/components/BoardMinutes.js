import React, { useState, useMemo } from 'react';
import VersionHistory, { createVersion, trimVersions } from './VersionHistory';

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

const BOARD_TIMELINE = [
  { month: 'July', discussion: ['Annual Fundraising Plan', 'Annual Recruiting Plan', 'Family Handbook'], decision: [], events: [] },
  { month: 'September', discussion: ['Business Plan', 'Tuition (next year)', 'Location needs (next year)'], decision: ['Annual Fundraising Plan', 'Annual Recruiting Plan'], events: ['Mass of the Holy Spirit'] },
  { month: 'November', discussion: ['Business Plan', 'Tuition (next year)', 'Location needs'], decision: [], events: ['All Saints Day Party (board hosted)', 'Namestorming Party'] },
  { month: 'January', discussion: ['Introduce Prelim Budget', 'HM Mid-Year Self-Review'], decision: ['HM renewal (engagement letter)'], events: [] },
  { month: 'March', discussion: ['Preliminary Budget', 'HM Contract', 'HM Performance Eval'], decision: [], events: [] },
  { month: 'May', discussion: ['Family Handbook'], decision: ['Budget', 'HM Contract', 'HM Performance Eval', 'Board term renewals'], events: [] },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_LABELS = { draft: 'Draft', approved: 'Approved' };
const STATUS_COLORS = { draft: '#CA8A04', approved: '#16A34A' };

export default function BoardMinutes({ meetings, onSave, onDelete, directors, meetingDetails }) {
  const [view, setView] = useState('list'); // list | edit | view
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [newAttendee, setNewAttendee] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const sorted = useMemo(() => {
    let list = [...(meetings || [])];
    if (filterStatus !== 'all') list = list.filter(m => m.status === filterStatus);
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [meetings, filterStatus]);

  // Get timeline items for a given month name
  const getTimelineForMonth = (monthName) => {
    const tl = BOARD_TIMELINE.find(t => t.month === monthName);
    if (!tl) return null;
    return tl;
  };

  const createMeeting = () => {
    if (!newDate) return;
    const dateObj = new Date(newDate + 'T00:00:00');
    const monthName = MONTH_NAMES[dateObj.getMonth()];
    const timeline = getTimelineForMonth(monthName);

    // Build sections — start with standard agenda, inject timeline items into relevant sections
    const sections = AGENDA_SECTIONS.map(name => {
      let content = '';
      if (timeline) {
        if (name === 'Old Business' && timeline.discussion.length > 0) {
          content = 'Discussion Items (from Board Timeline):\n' + timeline.discussion.map(d => '- ' + d).join('\n');
        }
        if (name === 'New Business' && timeline.decision.length > 0) {
          content = 'Items for Decision (from Board Timeline):\n' + timeline.decision.map(d => '- ' + d).join('\n');
        }
        if (name === 'Committee Reports' && timeline.events.length > 0) {
          content = 'Upcoming Events:\n' + timeline.events.map(e => '- ' + e).join('\n');
        }
      }
      return { id: genId(), name, content };
    });

    // Pull meeting details (time, location) from CommandCenter's meetingDetails if available
    const details = (meetingDetails || {})[monthName] || {};
    const time = newTime || details.time || '';
    const location = newLocation || details.location || '';

    const meeting = {
      id: genId(),
      date: newDate,
      title: newTitle || `Board Meeting — ${dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      time,
      location,
      status: 'draft',
      createdAt: new Date().toISOString(),
      attendees: [],
      sections,
      actionItems: [],
      versions: [],
    };
    onSave([...(meetings || []), meeting]);
    setNewDate('');
    setNewTitle('');
    setNewTime('');
    setNewLocation('');
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
    const existing = meetings.find(m => m.id === draft.id);
    if (existing && existing.status === 'draft') {
      if (!draft.versions) draft.versions = [];
      const sectionsWithContent = (existing.sections || []).filter(s => s.content).length;
      draft.versions.push(createVersion(existing, `${sectionsWithContent} sections with content`));
      draft.versions = trimVersions(draft.versions);
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

  const logoUrl = `${process.env.PUBLIC_URL || ''}/logo.png`;

  const generatePdf = (meeting) => {
    const m = meeting || draft || meetings.find(mm => mm.id === activeMeeting);
    if (!m) return;
    const w = window.open('', '_blank');
    const dateFormatted = new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const metaLines = [dateFormatted];
    if (m.time) metaLines.push(m.time);
    if (m.location) metaLines.push(m.location);
    const metaHtml = metaLines.join(' &middot; ');
    const statusLabel = m.status === 'approved' ? 'APPROVED' : 'DRAFT';

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
        <tbody>${m.actionItems.map(a => `<tr><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.task}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.assignee || ''}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;">${a.dueDate || ''}</td><td style="padding:6px;border-bottom:1px solid #E5E7EB;text-align:center;">${a.complete ? '\u2713 Complete' : 'Pending'}</td></tr>`).join('')}</tbody>
      </table>` : '';
    const attendeeHtml = (m.attendees || []).length > 0
      ? `<div style="font-size:12px;margin-bottom:16px;padding:8px 12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;">
          <strong style="color:#1B3A5C;">Present:</strong> <span style="color:#374151;">${m.attendees.join(', ')}</span>
         </div>`
      : '';

    // Build full page with logo
    const fullLogoUrl = window.location.origin + (process.env.PUBLIC_URL || '') + '/logo.png';
    w.document.write(`<!DOCTYPE html><html><head><title>Board Minutes \u2014 ${m.date}</title>
      <style>
        body{font-family:'Segoe UI',sans-serif;color:#1F2937;max-width:800px;margin:0 auto;padding:32px;}
        @media print{body{padding:16px;} .no-print{display:none !important;}}
      </style></head><body>
      <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1B3A5C;padding-bottom:16px;">
        <img src="${fullLogoUrl}" alt="CAFM Logo" style="height:80px;margin-bottom:8px;" crossorigin="anonymous" />
        <h1 style="font-family:Georgia,serif;color:#1B3A5C;font-size:20px;margin:0 0 2px 0;">Chesterton Academy of the Florida Martyrs</h1>
        <h2 style="font-family:Georgia,serif;color:#6B7280;font-size:16px;font-weight:400;margin:4px 0 6px 0;">${m.title}</h2>
        <div style="font-size:12px;color:#6B7280;">${metaHtml}</div>
        <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">${statusLabel}</div>
      </div>
      ${attendeeHtml}
      ${sectionsHtml}
      ${actionHtml}
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E5E7EB;font-size:10px;color:#9CA3AF;text-align:center;">
        Generated ${new Date().toLocaleDateString()} \u00b7 Chesterton Academy of the Florida Martyrs
      </div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
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
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Time</label>
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }} />
              </div>
              <div style={{ minWidth: 180 }}>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Location</label>
                <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. Conference Room" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Title (optional)</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Board Meeting" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
              </div>
              <button className="btn btn-sm btn-gold" onClick={createMeeting} disabled={!newDate}>Create</button>
            </div>
            {newDate && (() => {
              const monthName = MONTH_NAMES[new Date(newDate + 'T00:00:00').getMonth()];
              const tl = getTimelineForMonth(monthName);
              if (!tl) return null;
              return (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#1E40AF' }}>
                  <strong>{monthName} Board Timeline items will be pre-filled:</strong>
                  {tl.discussion.length > 0 && <div style={{ marginTop: 4 }}>Discussion: {tl.discussion.join(', ')}</div>}
                  {tl.decision.length > 0 && <div style={{ marginTop: 2 }}>Decisions: {tl.decision.join(', ')}</div>}
                  {tl.events.length > 0 && <div style={{ marginTop: 2 }}>Events: {tl.events.join(', ')}</div>}
                </div>
              );
            })()}
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
                    {m.time && <span style={{ marginLeft: 8 }}>{m.time}</span>}
                    {m.location && <span style={{ marginLeft: 8 }}>{m.location}</span>}
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
          {m.time && <span style={{ marginLeft: 8 }}>{m.time}</span>}
          {m.location && <span style={{ marginLeft: 8 }}>{m.location}</span>}
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
                    <td style={{ textAlign: 'center', color: a.complete ? '#16A34A' : '#CA8A04', fontWeight: 600 }}>{a.complete ? '\u2713 Complete' : 'Pending'}</td>
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
    const addAttendee = () => { if (!newAttendee.trim()) return; updateDraft(d => { if (!d.attendees) d.attendees = []; if (!d.attendees.includes(newAttendee.trim())) d.attendees.push(newAttendee.trim()); }); setNewAttendee(''); };
    const removeAttendee = (name) => { updateDraft(d => { d.attendees = (d.attendees || []).filter(a => a !== name); }); };

    // Drag-to-reorder sections
    const handleDragStart = (idx) => { setDragIdx(idx); };
    const handleDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
    const handleDrop = (idx) => {
      if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
      updateDraft(d => {
        const sections = [...d.sections];
        const [moved] = sections.splice(dragIdx, 1);
        sections.splice(idx, 0, moved);
        d.sections = sections;
      });
      setDragIdx(null);
      setDragOverIdx(null);
    };
    const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

    // Move section up/down (for accessibility / mobile)
    const moveSection = (idx, dir) => {
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= (draft.sections || []).length) return;
      updateDraft(d => {
        const sections = [...d.sections];
        [sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]];
        d.sections = sections;
      });
    };

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

        {/* Title, Date, Time, Location */}
        <div style={{ marginBottom: 16 }}>
          <input type="text" value={draft.title} onChange={e => updateDraft(d => { d.title = e.target.value; })}
            style={{ width: '100%', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: '#1B3A5C', border: 'none', borderBottom: '2px solid #E5E7EB', padding: '8px 0', background: 'transparent' }} />
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Date</label>
              <input type="date" value={draft.date} onChange={e => updateDraft(d => { d.date = e.target.value; })}
                style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Time</label>
              <input type="time" value={draft.time || ''} onChange={e => updateDraft(d => { d.time = e.target.value; })}
                style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>Location</label>
              <input type="text" value={draft.location || ''} onChange={e => updateDraft(d => { d.location = e.target.value; })}
                placeholder="e.g. Conference Room" style={{ width: '100%', fontSize: 12, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 4 }} />
            </div>
          </div>
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

        {/* Agenda / Minutes Sections — draggable */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Agenda & Minutes</div>
            <button className="btn btn-sm btn-secondary" onClick={addSection}>+ Add Section</button>
          </div>
          {(draft.sections || []).map((s, idx) => (
            <div key={s.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              style={{
                marginBottom: 10, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden',
                opacity: dragIdx === idx ? 0.5 : 1,
                borderTop: dragOverIdx === idx && dragIdx !== idx ? '3px solid #C9A227' : undefined,
                transition: 'border-top 0.1s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', cursor: 'grab' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#9CA3AF', fontSize: 14, cursor: 'grab', userSelect: 'none' }} title="Drag to reorder">{'\u2630'}</span>
                  <span style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>{s.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px', minWidth: 0 }} onClick={() => moveSection(idx, -1)} disabled={idx === 0} title="Move up">{'\u25B2'}</button>
                  <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px', minWidth: 0 }} onClick={() => moveSection(idx, 1)} disabled={idx === (draft.sections || []).length - 1} title="Move down">{'\u25BC'}</button>
                  <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeSection(s.id)}>x</button>
                </div>
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
        <VersionHistory
          versions={draft.versions || []}
          onRestore={(snapshot) => {
            updateDraft(d => {
              d.sections = snapshot.sections || d.sections;
              d.actionItems = snapshot.actionItems || d.actionItems;
              d.attendees = snapshot.attendees || d.attendees;
            });
          }}
          renderDiff={(snapshot) => (
            <div>
              <div>{(snapshot.sections || []).filter(s => s.content).length} sections with content</div>
              <div>{(snapshot.actionItems || []).length} action items</div>
              {(snapshot.attendees || []).length > 0 && <div>Attendees: {snapshot.attendees.join(', ')}</div>}
            </div>
          )}
        />
      </div>
    );
  }

  return null;
}
