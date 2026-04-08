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
// BOARD TIMELINE — interactive annual view
// ============================================================
function BoardTimeline({ data, update }) {
  const currentMonth = getCurrentMonthName();
  const completedMonths = data.completedMonths || [];

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

  // Reorder to start from July (fiscal year)
  const julyIdx = BOARD_TIMELINE.findIndex(m => m.month === 'July');
  const ordered = [...BOARD_TIMELINE.slice(julyIdx), ...BOARD_TIMELINE.slice(0, julyIdx)];

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 4 }}>Annual Board Timeline</h3>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
        Click items to mark as completed. Current month is highlighted.
      </div>

      <div className="cc-timeline-grid">
        {ordered.map(m => {
          const isCurrent = m.month === currentMonth;
          const isPast = MONTH_NAMES.indexOf(m.month) < MONTH_NAMES.indexOf(currentMonth);
          const hasContent = m.discussion.length > 0 || m.decision.length > 0 || m.events.length > 0;

          return (
            <div key={m.month} className={`cc-timeline-card ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${!m.meetingMonth ? 'no-meeting' : ''}`}>
              <div className="cc-timeline-month">
                <span>{m.month}</span>
                {isCurrent && <span className="cc-current-badge">NOW</span>}
                {!m.meetingMonth && <span style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No meeting</span>}
              </div>

              {m.discussion.length > 0 && (
                <div className="cc-timeline-section">
                  <div className="cc-timeline-section-label discuss">For Discussion</div>
                  {m.discussion.map(item => (
                    <div key={item} className={`cc-timeline-item ${isCompleted(m.month, item, 'discuss') ? 'completed' : ''}`}
                      onClick={() => toggleCompleted(m.month, item, 'discuss')}>
                      <span className="cc-check">{isCompleted(m.month, item, 'discuss') ? '✓' : '○'}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {m.decision.length > 0 && (
                <div className="cc-timeline-section">
                  <div className="cc-timeline-section-label decide">For Decision</div>
                  {m.decision.map(item => (
                    <div key={item} className={`cc-timeline-item ${isCompleted(m.month, item, 'decide') ? 'completed' : ''}`}
                      onClick={() => toggleCompleted(m.month, item, 'decide')}>
                      <span className="cc-check">{isCompleted(m.month, item, 'decide') ? '✓' : '○'}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {m.events.length > 0 && (
                <div className="cc-timeline-section">
                  <div className="cc-timeline-section-label events">Events</div>
                  {m.events.map(item => (
                    <div key={item} className={`cc-timeline-item ${isCompleted(m.month, item, 'event') ? 'completed' : ''}`}
                      onClick={() => toggleCompleted(m.month, item, 'event')}>
                      <span className="cc-check">{isCompleted(m.month, item, 'event') ? '✓' : '○'}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {!hasContent && m.note && (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', padding: '8px 0' }}>{m.note}</div>
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
