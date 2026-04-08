import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useCommandCenter } from '../hooks/useFirestore';

// ============================================================
// BOARD TIMELINE DATA — from the Annual Board Schedule PDF
// ============================================================
const BOARD_TIMELINE = [
  {
    month: 'July', meetingMonth: true,
    discussion: ['Annual Fundraising Plan', 'Annual Recruiting Plan', 'Family Handbook'],
    decision: [],
    events: [],
  },
  {
    month: 'August', meetingMonth: false,
    discussion: [], decision: [],
    events: ['Mass at First Day of School'],
    note: 'No board meeting',
  },
  {
    month: 'September', meetingMonth: true,
    discussion: ['Business Plan', 'Tuition (next year)', 'Location needs (next year)'],
    decision: ['Annual Fundraising Plan', 'Annual Recruiting Plan'],
    events: ['Mass of the Holy Spirit'],
  },
  {
    month: 'October', meetingMonth: false,
    discussion: [], decision: [],
    events: ['Consecration Renewal (Oct 7th)', 'Open House'],
    note: 'No board meeting',
  },
  {
    month: 'November', meetingMonth: true,
    discussion: ['Business Plan', 'Tuition (next year)', 'Location needs'],
    decision: [],
    events: ['All Saints Day Party (board hosted)', 'Namestorming Party'],
  },
  {
    month: 'December', meetingMonth: false,
    discussion: [], decision: [],
    events: [],
    note: 'No board meeting',
  },
  {
    month: 'January', meetingMonth: true,
    discussion: ['Introduce Prelim Budget', 'HM Mid-Year Self-Review'],
    decision: ['HM renewal (engagement letter)'],
    events: [],
  },
  {
    month: 'February', meetingMonth: false,
    discussion: [], decision: [],
    events: ['School Play'],
    note: 'No board meeting',
  },
  {
    month: 'March', meetingMonth: true,
    discussion: ['Preliminary Budget', 'HM Contract', 'HM Performance Eval'],
    decision: [],
    events: [],
  },
  {
    month: 'April', meetingMonth: false,
    discussion: [], decision: [],
    events: ['Vision Dinner'],
    note: 'No board meeting',
  },
  {
    month: 'May', meetingMonth: true,
    discussion: ['Family Handbook'],
    decision: ['Budget', 'HM Contract', 'HM Performance Eval', 'Board term renewals'],
    events: [],
  },
  {
    month: 'June', meetingMonth: false,
    discussion: [], decision: [],
    events: ['CSN Annual Summit'],
    note: 'No board meeting',
  },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getCurrentMonthName() {
  return MONTH_NAMES[new Date().getMonth()];
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CommandCenter() {
  const { data, loading, saveData } = useCommandCenter();
  const [local, setLocal] = useState(null);
  const [tab, setTab] = useState('timeline');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !local) setLocal(JSON.parse(JSON.stringify(data)));
  }, [data, local]);

  const update = useCallback((fn) => {
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!local) return;
    await saveData(local);
    setDirty(false);
  };

  if (loading || !local) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading Command Center...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">School Command Center</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved changes</span>}
          <button className="btn btn-secondary" onClick={handleSave} disabled={!dirty}>Save</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'timeline', label: 'Board Timeline' },
          { id: 'directory', label: 'Board Directory' },
          { id: 'documents', label: 'Board Documents' },
        ].map(t => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'timeline' && <BoardTimeline data={local} update={update} />}
      {tab === 'directory' && <BoardDirectory data={local} update={update} />}
      {tab === 'documents' && <BoardDocuments data={local} update={update} />}
    </div>
  );
}

// ============================================================
// BOARD TIMELINE — interactive annual view with custom items
// ============================================================
function BoardTimeline({ data, update }) {
  const currentMonth = getCurrentMonthName();
  const completedMonths = data.completedMonths || [];
  const customItems = data.customTimelineItems || []; // { id, month, category, text }
  const [addingTo, setAddingTo] = useState(null); // "month-category"
  const [newItemText, setNewItemText] = useState('');

  const toggleCompleted = (month, item, category) => {
    const key = `${month}-${category}-${item}`;
    update(c => {
      if (!c.completedMonths) c.completedMonths = [];
      if (c.completedMonths.includes(key)) {
        c.completedMonths = c.completedMonths.filter(k => k !== key);
      } else {
        c.completedMonths.push(key);
      }
    });
  };

  const isCompleted = (month, item, category) => {
    return completedMonths.includes(`${month}-${category}-${item}`);
  };

  const addCustomItem = (month, category) => {
    if (!newItemText.trim()) return;
    update(c => {
      if (!c.customTimelineItems) c.customTimelineItems = [];
      c.customTimelineItems.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        month, category, text: newItemText.trim(),
      });
    });
    setNewItemText('');
    setAddingTo(null);
  };

  const removeCustomItem = (id) => {
    update(c => {
      c.customTimelineItems = (c.customTimelineItems || []).filter(i => i.id !== id);
      // Also remove any completion status for this item
      const item = customItems.find(i => i.id === id);
      if (item) {
        const key = `${item.month}-${item.category}-${item.text}`;
        c.completedMonths = (c.completedMonths || []).filter(k => k !== key);
      }
    });
  };

  const getCustomForSection = (month, category) => {
    return customItems.filter(i => i.month === month && i.category === category);
  };

  // Reorder to start from July (fiscal year)
  const julyIdx = BOARD_TIMELINE.findIndex(m => m.month === 'July');
  const ordered = [...BOARD_TIMELINE.slice(julyIdx), ...BOARD_TIMELINE.slice(0, julyIdx)];

  const CATEGORIES = [
    { key: 'discuss', label: 'For Discussion', cssClass: 'discuss' },
    { key: 'decide', label: 'For Decision', cssClass: 'decide' },
    { key: 'event', label: 'Events', cssClass: 'events' },
  ];

  const getBaseItems = (m, catKey) => {
    if (catKey === 'discuss') return m.discussion;
    if (catKey === 'decide') return m.decision;
    if (catKey === 'event') return m.events;
    return [];
  };

  const exportPDF = () => {
    const w = window.open('', '_blank');
    const schoolYear = `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`;

    const monthsHtml = ordered.map(m => {
      const sections = CATEGORIES.map(cat => {
        const base = getBaseItems(m, cat.key);
        const custom = getCustomForSection(m.month, cat.key);
        const all = [...base, ...custom.map(c => c.text)];
        if (all.length === 0) return '';
        const colorMap = { discuss: '#1D4ED8', decide: '#B45309', event: '#047857' };
        const bgMap = { discuss: '#EFF6FF', decide: '#FFFBEB', event: '#ECFDF5' };
        return `
          <div style="margin-bottom:6px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${colorMap[cat.key]};background:${bgMap[cat.key]};display:inline-block;padding:1px 6px;border-radius:3px;margin-bottom:3px;">${cat.label}</div>
            ${all.map(item => {
              const done = isCompleted(m.month, item, cat.key);
              return `<div style="font-size:11px;padding:2px 0;${done ? 'text-decoration:line-through;color:#9CA3AF;' : 'color:#374151;'}">
                <span style="margin-right:4px;">${done ? '✓' : '○'}</span>${item}
              </div>`;
            }).join('')}
          </div>
        `;
      }).join('');

      const isCurrent = m.month === currentMonth;
      return `
        <div style="break-inside:avoid;border:1px solid ${isCurrent ? '#1B3A5C' : '#E5E7EB'};border-radius:8px;padding:12px;${isCurrent ? 'background:#EFF6FF;border-width:2px;' : m.meetingMonth ? '' : 'background:#F9FAFB;'}">
          <div style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:#1B3A5C;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;">
            <span>${m.month}</span>
            ${isCurrent ? '<span style="font-family:sans-serif;font-size:9px;background:#1B3A5C;color:white;padding:2px 8px;border-radius:10px;">CURRENT</span>' : ''}
            ${!m.meetingMonth ? '<span style="font-size:9px;color:#9CA3AF;font-style:italic;">No meeting</span>' : ''}
          </div>
          ${sections || (m.note ? `<div style="font-size:11px;color:#9CA3AF;font-style:italic;">${m.note}</div>` : '')}
        </div>
      `;
    }).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>CAFM Board Timeline ${schoolYear}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; color: #1F2937; max-width: 900px; margin: 0 auto; padding: 32px; }
        h1 { font-family: Georgia, serif; color: #1B3A5C; font-size: 20px; margin-bottom: 2px; }
        .subtitle { font-size: 12px; color: #6B7280; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media print { body { padding: 16px; } .grid { grid-template-columns: repeat(3, 1fr); } }
      </style></head><body>
      <h1>CAFM Board of Directors — Annual Timeline</h1>
      <div class="subtitle">Chesterton Academy of the Florida Martyrs · ${schoolYear} · Generated ${new Date().toLocaleDateString()}</div>
      <div class="grid">${monthsHtml}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 className="section-title">Annual Board Timeline</h3>
        <button className="btn btn-sm btn-gold" onClick={exportPDF}>Export PDF</button>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
        Click items to mark as completed. Use + to add custom items to any month.
      </div>

      <div className="cc-timeline-grid">
        {ordered.map(m => {
          const isCurrent = m.month === currentMonth;
          const isPast = MONTH_NAMES.indexOf(m.month) < MONTH_NAMES.indexOf(currentMonth);

          return (
            <div key={m.month} className={`cc-timeline-card ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${!m.meetingMonth ? 'no-meeting' : ''}`}>
              <div className="cc-timeline-month">
                <span>{m.month}</span>
                {isCurrent && <span className="cc-current-badge">NOW</span>}
                {!m.meetingMonth && <span style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No meeting</span>}
              </div>

              {CATEGORIES.map(cat => {
                const baseItems = getBaseItems(m, cat.key);
                const custom = getCustomForSection(m.month, cat.key);
                const allItems = [...baseItems.map(text => ({ text, isCustom: false })), ...custom.map(c => ({ text: c.text, isCustom: true, id: c.id }))];
                const addKey = `${m.month}-${cat.key}`;

                if (allItems.length === 0 && addingTo !== addKey) return null;

                return (
                  <div key={cat.key} className="cc-timeline-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className={`cc-timeline-section-label ${cat.cssClass}`}>{cat.label}</div>
                      <button className="cc-add-item-btn" onClick={() => { setAddingTo(addingTo === addKey ? null : addKey); setNewItemText(''); }}
                        title={`Add ${cat.label.toLowerCase()} item`}>+</button>
                    </div>
                    {allItems.map((item, idx) => (
                      <div key={idx} className={`cc-timeline-item ${isCompleted(m.month, item.text, cat.key) ? 'completed' : ''}`}>
                        <span className="cc-check" onClick={() => toggleCompleted(m.month, item.text, cat.key)}>
                          {isCompleted(m.month, item.text, cat.key) ? '✓' : '○'}
                        </span>
                        <span onClick={() => toggleCompleted(m.month, item.text, cat.key)} style={{ flex: 1, cursor: 'pointer' }}>{item.text}</span>
                        {item.isCustom && (
                          <button className="remove-btn" style={{ fontSize: 11, marginLeft: 4 }}
                            onClick={(e) => { e.stopPropagation(); removeCustomItem(item.id); }}>×</button>
                        )}
                      </div>
                    ))}
                    {addingTo === addKey && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input type="text" value={newItemText} placeholder="New item..."
                          onChange={e => setNewItemText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCustomItem(m.month, cat.key)}
                          style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
                          autoFocus />
                        <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => addCustomItem(m.month, cat.key)}>Add</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Show + buttons for empty categories */}
              {CATEGORIES.map(cat => {
                const baseItems = getBaseItems(m, cat.key);
                const custom = getCustomForSection(m.month, cat.key);
                const addKey = `${m.month}-${cat.key}`;
                if (baseItems.length > 0 || custom.length > 0 || addingTo === addKey) return null;

                return addingTo === addKey ? null : (
                  <button key={cat.key} className="cc-add-section-btn"
                    onClick={() => { setAddingTo(addKey); setNewItemText(''); }}>
                    + Add {cat.label.toLowerCase()}
                  </button>
                );
              })}

              {m.note && !m.meetingMonth && getBaseItems(m, 'discuss').length === 0 && getBaseItems(m, 'decide').length === 0 && getBaseItems(m, 'event').length === 0 && getCustomForSection(m.month, 'discuss').length === 0 && getCustomForSection(m.month, 'decide').length === 0 && getCustomForSection(m.month, 'event').length === 0 && (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>{m.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// BOARD DIRECTORY
// ============================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function BoardDirectory({ data, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newDir, setNewDir] = useState({ name: '', role: 'Member', email: '', phone: '', termStart: '', termEnd: '', oathDate: '', oathNote: '' });

  const directors = data.directors || [];

  const addDirector = () => {
    if (!newDir.name.trim()) return;
    update(c => {
      if (!c.directors) c.directors = [];
      c.directors.push({ id: genId(), ...newDir, name: newDir.name.trim() });
    });
    setNewDir({ name: '', role: 'Member', email: '', phone: '', termStart: '', termEnd: '', oathDate: '', oathNote: '' });
    setShowAdd(false);
  };

  const removeDirector = (id) => {
    if (!window.confirm('Remove this director?')) return;
    update(c => { c.directors = (c.directors || []).filter(d => d.id !== id); });
  };

  const updateDirector = (id, field, value) => {
    update(c => {
      const d = (c.directors || []).find(d => d.id === id);
      if (d) d[field] = value;
    });
  };

  // Sort: officers first, then alphabetical
  const roleOrder = { 'President': 0, 'Vice President': 1, 'Secretary': 2, 'Treasurer': 3, 'Member': 4, 'Chaplain': 5 };
  const sorted = [...directors].sort((a, b) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9) || a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="section-title">Board of Directors</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Director'}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
          <div className="sched-inline-row">
            <input type="text" placeholder="Full name" value={newDir.name}
              onChange={e => setNewDir({ ...newDir, name: e.target.value })} style={{ width: 180 }} />
            <select value={newDir.role} onChange={e => setNewDir({ ...newDir, role: e.target.value })} style={{ width: 140 }}>
              {['President', 'Vice President', 'Secretary', 'Treasurer', 'Member', 'Chaplain'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input type="email" placeholder="Email" value={newDir.email}
              onChange={e => setNewDir({ ...newDir, email: e.target.value })} style={{ width: 200 }} />
          </div>
          <div className="sched-inline-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Phone" value={newDir.phone}
              onChange={e => setNewDir({ ...newDir, phone: e.target.value })} style={{ width: 140 }} />
            <div className="sched-field" style={{ flex: 0 }}>
              <label>Term Start</label>
              <input type="date" value={newDir.termStart} onChange={e => setNewDir({ ...newDir, termStart: e.target.value })} />
            </div>
            <div className="sched-field" style={{ flex: 0 }}>
              <label>Term End</label>
              <input type="date" value={newDir.termEnd} onChange={e => setNewDir({ ...newDir, termEnd: e.target.value })} />
            </div>
            <div className="sched-field" style={{ flex: 0 }}>
              <label>Oath Date</label>
              <input type="date" value={newDir.oathDate} onChange={e => setNewDir({ ...newDir, oathDate: e.target.value })} />
            </div>
            <button className="btn btn-gold btn-sm" onClick={addDirector}>Add</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No directors added yet.</div>
      ) : (
        <div className="cc-director-grid">
          {sorted.map(d => {
            const termExpired = d.termEnd && new Date(d.termEnd) < new Date();
            const termSoon = d.termEnd && !termExpired && (new Date(d.termEnd) - new Date()) < 90 * 86400000;
            return (
              <div key={d.id} className="cc-director-card">
                <div className="cc-director-header">
                  <div>
                    <div className="cc-director-name">{d.name}</div>
                    <div className="cc-director-role">
                      <span className={`badge ${d.role === 'Chaplain' ? 'badge-gray' : 'badge-green'}`}>{d.role}</span>
                    </div>
                  </div>
                  <button className="remove-btn" onClick={() => removeDirector(d.id)}>×</button>
                </div>

                <div className="cc-director-details">
                  {d.email && <div className="cc-director-detail">{d.email}</div>}
                  {d.phone && <div className="cc-director-detail">{d.phone}</div>}

                  <div className="cc-director-term">
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Term:</span>
                    {d.termStart || d.termEnd ? (
                      <span className={termExpired ? 'cc-term-expired' : termSoon ? 'cc-term-soon' : ''}>
                        {d.termStart ? new Date(d.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?'}
                        {' – '}
                        {d.termEnd ? new Date(d.termEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?'}
                        {termExpired && ' (EXPIRED)'}
                        {termSoon && ' (expiring soon)'}
                      </span>
                    ) : (
                      <span style={{ color: '#9CA3AF', fontSize: 12 }}>Not set</span>
                    )}
                  </div>

                  <div className="cc-director-oath">
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Oath:</span>
                    {d.oathDate ? (
                      <span className="cc-oath-signed">
                        Signed {new Date(d.oathDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    ) : d.oathNote ? (
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>{d.oathNote}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#DC2626' }}>Not signed</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOARD DOCUMENTS — quick links to key governance docs
// ============================================================
function BoardDocuments({ data, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newDoc, setNewDoc] = useState({ label: '', url: '', category: 'Governance' });

  const docs = data.boardDocs || [];
  const categories = ['Governance', 'Meeting Minutes', 'Agendas', 'Financial', 'Planning', 'Other'];

  const addDoc = () => {
    if (!newDoc.label.trim() || !newDoc.url.trim()) return;
    let url = newDoc.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    update(c => {
      if (!c.boardDocs) c.boardDocs = [];
      c.boardDocs.push({ id: genId(), ...newDoc, label: newDoc.label.trim(), url });
    });
    setNewDoc({ label: '', url: '', category: 'Governance' });
    setShowAdd(false);
  };

  const removeDoc = (id) => {
    if (!window.confirm('Remove this document?')) return;
    update(c => { c.boardDocs = (c.boardDocs || []).filter(d => d.id !== id); });
  };

  // Group by category
  const grouped = {};
  categories.forEach(cat => {
    const items = docs.filter(d => d.category === cat);
    if (items.length > 0) grouped[cat] = items;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="section-title">Board Documents</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Document'}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
          <div className="sched-inline-row">
            <input type="text" placeholder="Document name" value={newDoc.label}
              onChange={e => setNewDoc({ ...newDoc, label: e.target.value })} style={{ width: 250 }} />
            <select value={newDoc.category} onChange={e => setNewDoc({ ...newDoc, category: e.target.value })} style={{ width: 160 }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sched-inline-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="URL (Google Drive link, PDF link, etc.)" value={newDoc.url}
              onChange={e => setNewDoc({ ...newDoc, url: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addDoc()} style={{ flex: 1 }} />
            <button className="btn btn-gold btn-sm" onClick={addDoc}>Add</button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 && !showAdd ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          No documents added yet. Add links to your bylaws, meeting minutes, business plan, and other governance documents.
        </div>
      ) : (
        <div className="cc-docs-container">
          {categories.map(cat => {
            const items = grouped[cat];
            if (!items) return null;
            return (
              <div key={cat} className="cc-docs-category">
                <h4 className="cc-docs-category-title">{cat}</h4>
                <div className="cc-docs-list">
                  {items.map(doc => (
                    <div key={doc.id} className="cc-docs-item">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="cc-docs-link">
                        <span className="cc-docs-icon">📄</span>
                        <span>{doc.label}</span>
                      </a>
                      <button className="remove-btn" onClick={() => removeDoc(doc.id)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
