import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useCommandCenter, useBudget } from '../hooks/useFirestore';
import BudgetTool from './BudgetTool';
import FinancialPlanning from './FinancialPlanning';

// ============================================================
// BOARD TIMELINE DATA
// ============================================================
const BOARD_TIMELINE = [
  { month: 'July', meetingMonth: true, discussion: ['Annual Fundraising Plan', 'Annual Recruiting Plan', 'Family Handbook'], decision: [], events: [] },
  { month: 'August', meetingMonth: false, discussion: [], decision: [], events: ['Mass at First Day of School'], note: 'No board meeting' },
  { month: 'September', meetingMonth: true, discussion: ['Business Plan', 'Tuition (next year)', 'Location needs (next year)'], decision: ['Annual Fundraising Plan', 'Annual Recruiting Plan'], events: ['Mass of the Holy Spirit'] },
  { month: 'October', meetingMonth: false, discussion: [], decision: [], events: ['Consecration Renewal (Oct 7th)', 'Open House'], note: 'No board meeting' },
  { month: 'November', meetingMonth: true, discussion: ['Business Plan', 'Tuition (next year)', 'Location needs'], decision: [], events: ['All Saints Day Party (board hosted)', 'Namestorming Party'] },
  { month: 'December', meetingMonth: false, discussion: [], decision: [], events: [], note: 'No board meeting' },
  { month: 'January', meetingMonth: true, discussion: ['Introduce Prelim Budget', 'HM Mid-Year Self-Review'], decision: ['HM renewal (engagement letter)'], events: [] },
  { month: 'February', meetingMonth: false, discussion: [], decision: [], events: ['School Play'], note: 'No board meeting' },
  { month: 'March', meetingMonth: true, discussion: ['Preliminary Budget', 'HM Contract', 'HM Performance Eval'], decision: [], events: [] },
  { month: 'April', meetingMonth: false, discussion: [], decision: [], events: ['Vision Dinner'], note: 'No board meeting' },
  { month: 'May', meetingMonth: true, discussion: ['Family Handbook'], decision: ['Budget', 'HM Contract', 'HM Performance Eval', 'Board term renewals'], events: [] },
  { month: 'June', meetingMonth: false, discussion: [], decision: [], events: ['CSN Annual Summit'], note: 'No board meeting' },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function getCurrentMonthName() { return MONTH_NAMES[new Date().getMonth()]; }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CommandCenter() {
  const { data, loading, saveData } = useCommandCenter();
  const { data: budgetData, loading: budgetLoading } = useBudget();
  const [local, setLocal] = useState(null);
  const [tab, setTab] = useState('overview');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (data && !local) setLocal(JSON.parse(JSON.stringify(data))); }, [data, local]);

  const update = useCallback((fn) => {
    setLocal(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });
    setDirty(true);
  }, []);

  const handleSave = async () => { if (local) { await saveData(local); setDirty(false); } };

  if (loading || budgetLoading || !local) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Board</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved changes</span>}
          <button className="btn btn-secondary" onClick={handleSave} disabled={!dirty}>Save</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ id: 'overview', label: 'Overview' }, { id: 'timeline', label: 'Timeline' }, { id: 'directory', label: 'Directory' }, { id: 'documents', label: 'Documents' }, { id: 'budget', label: 'Budget' }, { id: 'financial', label: 'Financial Planning' }].map(t => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <BoardOverview data={local} update={update} budgetData={budgetData} onNavigate={setTab} />}
      {tab === 'timeline' && <BoardTimeline data={local} update={update} />}
      {tab === 'directory' && <BoardDirectory data={local} update={update} />}
      {tab === 'documents' && <BoardDocuments data={local} update={update} />}
      {tab === 'budget' && <BudgetTool />}
      {tab === 'financial' && <FinancialPlanning />}
    </div>
  );
}

// ============================================================
// BOARD OVERVIEW — executive summary
// ============================================================
function BoardOverview({ data, update, budgetData, onNavigate }) {
  const currentMonth = getCurrentMonthName();
  const currentTimeline = BOARD_TIMELINE.find(m => m.month === currentMonth);
  const customItems = data.customTimelineItems || [];
  const completedMonths = data.completedMonths || [];
  const enrollment = data.enrollment || { current: 22, nextYear: { confirmed: 0, pipeline: 0, target: 30 } };

  const currentIdx = MONTH_NAMES.indexOf(currentMonth);
  const nextMeeting = BOARD_TIMELINE.find(m => m.meetingMonth && MONTH_NAMES.indexOf(m.month) >= currentIdx) || BOARD_TIMELINE.find(m => m.meetingMonth);

  const budgetStats = useMemo(() => {
    if (!budgetData?.lineItems) return null;
    const scenario = (budgetData.scenarios || ['Scenario A'])[0];
    let totalBudget = 0, totalSpent = 0;
    (budgetData.lineItems || []).forEach(item => {
      totalBudget += parseFloat(item.scenarios?.[scenario]) || 0;
      (budgetData.spending || []).filter(s => s.categoryId === item.id).forEach(s => { totalSpent += parseFloat(s.amount) || 0; });
    });
    const month = new Date().getMonth();
    const fiscalMonth = month >= 7 ? month - 7 : month + 5;
    const pctYear = Math.round((fiscalMonth / 10) * 100);
    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, pctSpent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0, pctYear };
  }, [budgetData]);

  const getMonthItems = (cat) => {
    const base = cat === 'discuss' ? (currentTimeline?.discussion || []) : cat === 'decide' ? (currentTimeline?.decision || []) : (currentTimeline?.events || []);
    return [...base, ...customItems.filter(i => i.month === currentMonth && i.category === cat).map(i => i.text)];
  };
  const isCompleted = (item, cat) => completedMonths.includes(`${currentMonth}-${cat}-${item}`);

  const updateEnrollment = (field, value) => {
    update(c => {
      if (!c.enrollment) c.enrollment = { current: 22, nextYear: { confirmed: 0, pipeline: 0, target: 30 } };
      if (field.startsWith('nextYear.')) c.enrollment.nextYear[field.split('.')[1]] = parseInt(value) || 0;
      else c.enrollment[field] = parseInt(value) || 0;
    });
  };

  const discussions = getMonthItems('discuss'), decisions = getMonthItems('decide'), events = getMonthItems('event');

  return (
    <div>
      <div className="cc-overview-header">
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#1B3A5C' }}>Board Overview</h3>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>

      <div className="home-grid">
        <div className="home-main">
          {/* This Month */}
          <div className="home-card">
            <div className="home-card-header">
              <h3>{currentMonth}</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('timeline')}>Full Timeline</button>
            </div>

            {decisions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="cc-timeline-section-label decide" style={{ marginBottom: 6 }}>For Decision (Vote Required)</div>
                {decisions.map(item => (
                  <div key={item} className={`cc-overview-item ${isCompleted(item, 'decide') ? 'completed' : ''}`}>
                    <span className="cc-check">{isCompleted(item, 'decide') ? '✓' : '○'}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {discussions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="cc-timeline-section-label discuss" style={{ marginBottom: 6 }}>For Discussion</div>
                {discussions.map(item => (
                  <div key={item} className={`cc-overview-item ${isCompleted(item, 'discuss') ? 'completed' : ''}`}>
                    <span className="cc-check">{isCompleted(item, 'discuss') ? '✓' : '○'}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {events.length > 0 && (
              <div>
                <div className="cc-timeline-section-label events" style={{ marginBottom: 6 }}>Events</div>
                {events.map(item => (
                  <div key={item} className={`cc-overview-item ${isCompleted(item, 'event') ? 'completed' : ''}`}>
                    <span className="cc-check">{isCompleted(item, 'event') ? '✓' : '○'}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {discussions.length === 0 && decisions.length === 0 && events.length === 0 && (
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>
                {currentTimeline?.meetingMonth ? 'No items scheduled this month.' : 'No board meeting this month.'}
              </div>
            )}

            {nextMeeting && nextMeeting.month !== currentMonth && (() => {
              const mtgDetails = (data.meetingDetails || {})[nextMeeting.month] || {};
              return (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1B3A5C', marginBottom: 4 }}>
                    Next Board Meeting: {nextMeeting.month}
                  </div>
                  {mtgDetails.date ? (
                    <div style={{ fontSize: 13 }}>
                      <div style={{ color: '#374151' }}>
                        {new Date(mtgDetails.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        {mtgDetails.time && ` at ${(() => { const [h, mm] = mtgDetails.time.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()}`}
                      </div>
                      {mtgDetails.location && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{mtgDetails.location}</div>}
                      {mtgDetails.virtualLink && (
                        <a href={mtgDetails.virtualLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D4ED8', marginTop: 2, display: 'inline-block' }}>
                          Join Virtual Meeting
                        </a>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Date not yet set — edit on the Timeline tab</div>
                  )}
                </div>
              );
            })()}

            {/* Current month meeting details if it's a meeting month */}
            {currentTimeline?.meetingMonth && (() => {
              const mtgDetails = (data.meetingDetails || {})[currentMonth] || {};
              if (!mtgDetails.date) return null;
              return (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1B3A5C', marginBottom: 4 }}>Meeting This Month</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {new Date(mtgDetails.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {mtgDetails.time && ` at ${(() => { const [h, mm] = mtgDetails.time.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()}`}
                  </div>
                  {mtgDetails.location && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{mtgDetails.location}</div>}
                  {mtgDetails.virtualLink && (
                    <a href={mtgDetails.virtualLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D4ED8', marginTop: 2, display: 'inline-block' }}>
                      Join Virtual Meeting
                    </a>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Budget Snapshot */}
          {budgetStats && budgetStats.totalBudget > 0 && (
            <div className="home-card">
              <div className="home-card-header">
                <h3>Budget Snapshot</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('budget')}>Full Budget</button>
              </div>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>${budgetStats.totalBudget.toLocaleString()}</div><div className="stat-label">Budget</div></div>
                <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>${budgetStats.totalSpent.toLocaleString()}</div><div className="stat-label">Spent</div></div>
                <div className={`stat-card ${budgetStats.remaining < 0 ? 'alert' : ''}`}><div className="stat-value" style={{ fontSize: 20 }}>${budgetStats.remaining.toLocaleString()}</div><div className="stat-label">Remaining</div></div>
                <div className={`stat-card ${budgetStats.pctSpent > budgetStats.pctYear + 10 ? 'alert' : ''}`}><div className="stat-value" style={{ fontSize: 20 }}>{budgetStats.pctSpent}%</div><div className="stat-label">Used ({budgetStats.pctYear}% thru yr)</div></div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                  <span>Budget used</span><span>Fiscal year progress</span>
                </div>
                <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(budgetStats.pctSpent, 100)}%`, background: budgetStats.pctSpent > budgetStats.pctYear + 10 ? '#DC2626' : '#16A34A', borderRadius: 5 }} />
                  <div style={{ position: 'absolute', left: `${budgetStats.pctYear}%`, top: -2, bottom: -2, width: 2, background: '#1B3A5C' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="home-sidebar">
          {/* Enrollment */}
          <div className="home-card">
            <div className="home-card-header"><h3>Enrollment</h3></div>
            <div className="cc-enrollment-grid">
              <div className="cc-enrollment-item">
                <div className="cc-enrollment-label">Current Year</div>
                <input type="number" className="cc-enrollment-input" value={enrollment.current} onChange={e => updateEnrollment('current', e.target.value)} />
                <div className="cc-enrollment-sub">students enrolled</div>
              </div>
              <div style={{ borderTop: '1px solid #E5E7EB', margin: '8px 0' }} />
              <div className="cc-enrollment-item">
                <div className="cc-enrollment-label">Next Year — Confirmed</div>
                <input type="number" className="cc-enrollment-input confirmed" value={enrollment.nextYear.confirmed} onChange={e => updateEnrollment('nextYear.confirmed', e.target.value)} />
                <div className="cc-enrollment-sub">accepted / deposited</div>
              </div>
              <div className="cc-enrollment-item">
                <div className="cc-enrollment-label">Next Year — Pipeline</div>
                <input type="number" className="cc-enrollment-input pipeline" value={enrollment.nextYear.pipeline} onChange={e => updateEnrollment('nextYear.pipeline', e.target.value)} />
                <div className="cc-enrollment-sub">applied / toured / interested</div>
              </div>
              <div className="cc-enrollment-item">
                <div className="cc-enrollment-label">Target</div>
                <input type="number" className="cc-enrollment-input" value={enrollment.nextYear.target} onChange={e => updateEnrollment('nextYear.target', e.target.value)} />
                <div className="cc-enrollment-sub">enrollment goal</div>
              </div>
            </div>
            {enrollment.nextYear.target > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                  <span>{enrollment.nextYear.confirmed} of {enrollment.nextYear.target}</span>
                  <span>{Math.round((enrollment.nextYear.confirmed / enrollment.nextYear.target) * 100)}%</span>
                </div>
                <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(Math.round((enrollment.nextYear.confirmed / enrollment.nextYear.target) * 100), 100)}%`, background: enrollment.nextYear.confirmed >= enrollment.nextYear.target ? '#16A34A' : '#C9A227' }} />
                </div>
              </div>
            )}
          </div>

          <div className="home-card">
            <div className="home-card-header"><h3>Quick Navigation</h3></div>
            <div className="quick-nav-list">
              <button className="quick-nav-btn" onClick={() => onNavigate('timeline')}>Board Timeline</button>
              <button className="quick-nav-btn" onClick={() => onNavigate('directory')}>Board Directory</button>
              <button className="quick-nav-btn" onClick={() => onNavigate('documents')}>Board Documents</button>
              <button className="quick-nav-btn" onClick={() => onNavigate('budget')}>Budget Tool</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BOARD TIMELINE
// ============================================================
function BoardTimeline({ data, update }) {
  const currentMonth = getCurrentMonthName();
  const completedMonths = data.completedMonths || [];
  const customItems = data.customTimelineItems || [];
  const [addingTo, setAddingTo] = useState(null);
  const [newItemText, setNewItemText] = useState('');

  const toggleCompleted = (month, item, category) => {
    const key = `${month}-${category}-${item}`;
    update(c => {
      if (!c.completedMonths) c.completedMonths = [];
      if (c.completedMonths.includes(key)) c.completedMonths = c.completedMonths.filter(k => k !== key);
      else c.completedMonths.push(key);
    });
  };
  const isCompleted = (month, item, category) => completedMonths.includes(`${month}-${category}-${item}`);

  const addCustomItem = (month, category) => {
    if (!newItemText.trim()) return;
    update(c => {
      if (!c.customTimelineItems) c.customTimelineItems = [];
      c.customTimelineItems.push({ id: genId(), month, category, text: newItemText.trim() });
    });
    setNewItemText(''); setAddingTo(null);
  };

  const removeCustomItem = (id) => {
    update(c => {
      const item = (c.customTimelineItems || []).find(i => i.id === id);
      c.customTimelineItems = (c.customTimelineItems || []).filter(i => i.id !== id);
      if (item) c.completedMonths = (c.completedMonths || []).filter(k => k !== `${item.month}-${item.category}-${item.text}`);
    });
  };

  const getCustomForSection = (month, category) => customItems.filter(i => i.month === month && i.category === category);
  const julyIdx = BOARD_TIMELINE.findIndex(m => m.month === 'July');
  const ordered = [...BOARD_TIMELINE.slice(julyIdx), ...BOARD_TIMELINE.slice(0, julyIdx)];
  const CATEGORIES = [{ key: 'discuss', label: 'For Discussion', cssClass: 'discuss' }, { key: 'decide', label: 'For Decision', cssClass: 'decide' }, { key: 'event', label: 'Events', cssClass: 'events' }];
  const getBaseItems = (m, k) => k === 'discuss' ? m.discussion : k === 'decide' ? m.decision : m.events;

  const exportPDF = () => {
    const w = window.open('', '_blank');
    const monthsHtml = ordered.map(m => {
      const sections = CATEGORIES.map(cat => {
        const all = [...getBaseItems(m, cat.key), ...getCustomForSection(m.month, cat.key).map(c => c.text)];
        if (!all.length) return '';
        const colors = { discuss: '#1D4ED8', decide: '#B45309', event: '#047857' };
        const bgs = { discuss: '#EFF6FF', decide: '#FFFBEB', event: '#ECFDF5' };
        return `<div style="margin-bottom:6px;"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:${colors[cat.key]};background:${bgs[cat.key]};display:inline-block;padding:1px 6px;border-radius:3px;margin-bottom:3px;">${cat.label}</div>${all.map(item => { const done = isCompleted(m.month, item, cat.key); return `<div style="font-size:11px;padding:2px 0;${done ? 'text-decoration:line-through;color:#9CA3AF;' : ''}">${done ? '✓' : '○'} ${item}</div>`; }).join('')}</div>`;
      }).join('');
      const isCur = m.month === currentMonth;
      return `<div style="break-inside:avoid;border:1px solid ${isCur ? '#1B3A5C' : '#E5E7EB'};border-radius:8px;padding:12px;${isCur ? 'background:#EFF6FF;border-width:2px;' : !m.meetingMonth ? 'background:#F9FAFB;' : ''}"><div style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:#1B3A5C;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">${m.month}${isCur ? ' <span style="font-size:9px;background:#1B3A5C;color:white;padding:2px 8px;border-radius:10px;margin-left:8px;">NOW</span>' : ''}</div>${sections || (m.note ? `<div style="font-size:11px;color:#9CA3AF;font-style:italic;">${m.note}</div>` : '')}</div>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>CAFM Board Timeline</title><style>body{font-family:sans-serif;color:#1F2937;max-width:900px;margin:0 auto;padding:32px;}h1{font-family:Georgia,serif;color:#1B3A5C;font-size:20px;}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}@media print{body{padding:16px;}}</style></head><body><h1>CAFM Board Timeline</h1><div style="font-size:12px;color:#6B7280;margin-bottom:20px;">Generated ${new Date().toLocaleDateString()}</div><div class="grid">${monthsHtml}</div></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 className="section-title">Annual Board Timeline</h3>
        <button className="btn btn-sm btn-gold" onClick={exportPDF}>Export PDF</button>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>Click items to mark complete. Use + to add items.</div>

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

              {/* Meeting details for meeting months */}
              {m.meetingMonth && <MeetingDetails month={m.month} data={data} update={update} />}

              {CATEGORIES.map(cat => {
                const baseItems = getBaseItems(m, cat.key);
                const custom = getCustomForSection(m.month, cat.key);
                const allItems = [...baseItems.map(t => ({ text: t, isCustom: false })), ...custom.map(c => ({ text: c.text, isCustom: true, id: c.id }))];
                const addKey = `${m.month}-${cat.key}`;
                if (allItems.length === 0 && addingTo !== addKey) return null;
                return (
                  <div key={cat.key} className="cc-timeline-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className={`cc-timeline-section-label ${cat.cssClass}`}>{cat.label}</div>
                      <button className="cc-add-item-btn" onClick={() => { setAddingTo(addingTo === addKey ? null : addKey); setNewItemText(''); }}>+</button>
                    </div>
                    {allItems.map((item, idx) => (
                      <div key={idx} className={`cc-timeline-item ${isCompleted(m.month, item.text, cat.key) ? 'completed' : ''}`}>
                        <span className="cc-check" onClick={() => toggleCompleted(m.month, item.text, cat.key)}>{isCompleted(m.month, item.text, cat.key) ? '✓' : '○'}</span>
                        <span onClick={() => toggleCompleted(m.month, item.text, cat.key)} style={{ flex: 1, cursor: 'pointer' }}>{item.text}</span>
                        {item.isCustom && <button className="remove-btn" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); removeCustomItem(item.id); }}>×</button>}
                      </div>
                    ))}
                    {addingTo === addKey && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input type="text" value={newItemText} placeholder="New item..." onChange={e => setNewItemText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomItem(m.month, cat.key)} style={{ flex: 1, fontSize: 12, padding: '4px 8px' }} autoFocus />
                        <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addCustomItem(m.month, cat.key)}>Add</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {CATEGORIES.map(cat => {
                const addKey = `${m.month}-${cat.key}`;
                if (getBaseItems(m, cat.key).length > 0 || getCustomForSection(m.month, cat.key).length > 0 || addingTo === addKey) return null;
                return <button key={cat.key} className="cc-add-section-btn" onClick={() => { setAddingTo(addKey); setNewItemText(''); }}>+ Add {cat.label.toLowerCase()}</button>;
              })}

              {m.note && !m.meetingMonth && CATEGORIES.every(cat => getBaseItems(m, cat.key).length === 0 && getCustomForSection(m.month, cat.key).length === 0) && (
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
// MEETING DETAILS — inline editor for date, time, location, link
// ============================================================
function MeetingDetails({ month, data, update }) {
  const meetings = data.meetingDetails || {};
  const meeting = meetings[month] || {};
  const [editing, setEditing] = useState(false);

  const updateField = (field, value) => {
    update(c => {
      if (!c.meetingDetails) c.meetingDetails = {};
      if (!c.meetingDetails[month]) c.meetingDetails[month] = {};
      c.meetingDetails[month][field] = value;
    });
  };

  const hasDetails = meeting.date || meeting.time || meeting.location || meeting.virtualLink;

  if (!editing && !hasDetails) {
    return (
      <button className="cc-meeting-add-btn" onClick={() => setEditing(true)}>
        + Set meeting details
      </button>
    );
  }

  if (editing) {
    return (
      <div className="cc-meeting-edit">
        <div className="sched-inline-row" style={{ marginBottom: 4 }}>
          <input type="date" value={meeting.date || ''} onChange={e => updateField('date', e.target.value)} style={{ width: 140 }} />
          <input type="time" value={meeting.time || ''} onChange={e => updateField('time', e.target.value)} style={{ width: 110 }} />
        </div>
        <input type="text" value={meeting.location || ''} placeholder="Location (e.g. St. Anne Family Life Center)" onChange={e => updateField('location', e.target.value)} style={{ width: '100%', marginBottom: 4, fontSize: 12 }} />
        <input type="text" value={meeting.virtualLink || ''} placeholder="Google Meet / Zoom link (optional)" onChange={e => updateField('virtualLink', e.target.value)} style={{ width: '100%', marginBottom: 4, fontSize: 12 }} />
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)} style={{ fontSize: 11 }}>Done</button>
      </div>
    );
  }

  return (
    <div className="cc-meeting-info" onClick={() => setEditing(true)} title="Click to edit">
      <div className="cc-meeting-datetime">
        {meeting.date && new Date(meeting.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        {meeting.time && ` at ${(() => { const [h, m] = meeting.time.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()}`}
      </div>
      {meeting.location && <div className="cc-meeting-location">{meeting.location}</div>}
      {meeting.virtualLink && (
        <a href={meeting.virtualLink} target="_blank" rel="noopener noreferrer" className="cc-meeting-link" onClick={e => e.stopPropagation()}>
          Join Virtual Meeting
        </a>
      )}
    </div>
  );
}

// ============================================================
// BOARD DIRECTORY
// ============================================================
function BoardDirectory({ data, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newDir, setNewDir] = useState({ name: '', role: 'Member', email: '', phone: '', termStart: '', termEnd: '', oathDate: '', oathNote: '' });
  const directors = data.directors || [];

  const addDirector = () => {
    if (!newDir.name.trim()) return;
    update(c => { if (!c.directors) c.directors = []; c.directors.push({ id: genId(), ...newDir, name: newDir.name.trim() }); });
    setNewDir({ name: '', role: 'Member', email: '', phone: '', termStart: '', termEnd: '', oathDate: '', oathNote: '' }); setShowAdd(false);
  };
  const removeDirector = (id) => { if (window.confirm('Remove this director?')) update(c => { c.directors = (c.directors || []).filter(d => d.id !== id); }); };
  const updateDirector = (id, field, value) => { update(c => { const d = (c.directors || []).find(d => d.id === id); if (d) d[field] = value; }); };

  const roleOrder = { 'President': 0, 'Vice President': 1, 'Secretary': 2, 'Treasurer': 3, 'Member': 4, 'Chaplain': 5 };
  const sorted = [...directors].sort((a, b) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9) || a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="section-title">Board of Directors</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Add Director'}</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
          <div className="sched-inline-row">
            <input type="text" placeholder="Full name" value={newDir.name} onChange={e => setNewDir({ ...newDir, name: e.target.value })} style={{ width: 180 }} />
            <select value={newDir.role} onChange={e => setNewDir({ ...newDir, role: e.target.value })} style={{ width: 140 }}>
              {['President', 'Vice President', 'Secretary', 'Treasurer', 'Member', 'Chaplain'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input type="email" placeholder="Email" value={newDir.email} onChange={e => setNewDir({ ...newDir, email: e.target.value })} style={{ width: 200 }} />
          </div>
          <div className="sched-inline-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Phone" value={newDir.phone} onChange={e => setNewDir({ ...newDir, phone: e.target.value })} style={{ width: 140 }} />
            <div className="sched-field" style={{ flex: 0 }}><label>Term Start</label><input type="date" value={newDir.termStart} onChange={e => setNewDir({ ...newDir, termStart: e.target.value })} /></div>
            <div className="sched-field" style={{ flex: 0 }}><label>Term End</label><input type="date" value={newDir.termEnd} onChange={e => setNewDir({ ...newDir, termEnd: e.target.value })} /></div>
            <div className="sched-field" style={{ flex: 0 }}><label>Oath Date</label><input type="date" value={newDir.oathDate} onChange={e => setNewDir({ ...newDir, oathDate: e.target.value })} /></div>
            <button className="btn btn-gold btn-sm" onClick={addDirector}>Add</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No directors added yet.</div> : (
        <div className="cc-director-grid">
          {sorted.map(d => {
            const termExpired = d.termEnd && new Date(d.termEnd) < new Date();
            const termSoon = d.termEnd && !termExpired && (new Date(d.termEnd) - new Date()) < 90 * 86400000;
            return (
              <div key={d.id} className="cc-director-card">
                <div className="cc-director-header">
                  <div>
                    <div className="cc-director-name">{d.name}</div>
                    <div className="cc-director-role"><span className={`badge ${d.role === 'Chaplain' ? 'badge-gray' : 'badge-green'}`}>{d.role}</span></div>
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
                        {d.termStart ? new Date(d.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?'} – {d.termEnd ? new Date(d.termEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?'}
                        {termExpired && ' (EXPIRED)'}{termSoon && ' (expiring soon)'}
                      </span>
                    ) : <span style={{ color: '#9CA3AF', fontSize: 12 }}>Not set</span>}
                  </div>
                  <div className="cc-director-oath">
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Oath:</span>
                    {d.oathDate ? <span className="cc-oath-signed">Signed {new Date(d.oathDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      : d.oathNote ? <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>{d.oathNote}</span>
                      : <span style={{ fontSize: 12, color: '#DC2626' }}>Not signed</span>}
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
// BOARD DOCUMENTS
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
    update(c => { if (!c.boardDocs) c.boardDocs = []; c.boardDocs.push({ id: genId(), ...newDoc, label: newDoc.label.trim(), url }); });
    setNewDoc({ label: '', url: '', category: 'Governance' }); setShowAdd(false);
  };
  const removeDoc = (id) => { if (window.confirm('Remove?')) update(c => { c.boardDocs = (c.boardDocs || []).filter(d => d.id !== id); }); };

  const grouped = {};
  categories.forEach(cat => { const items = docs.filter(d => d.category === cat); if (items.length > 0) grouped[cat] = items; });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="section-title">Board Documents</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Add Document'}</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
          <div className="sched-inline-row">
            <input type="text" placeholder="Document name" value={newDoc.label} onChange={e => setNewDoc({ ...newDoc, label: e.target.value })} style={{ width: 250 }} />
            <select value={newDoc.category} onChange={e => setNewDoc({ ...newDoc, category: e.target.value })} style={{ width: 160 }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sched-inline-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="URL (Google Drive, PDF, etc.)" value={newDoc.url} onChange={e => setNewDoc({ ...newDoc, url: e.target.value })} onKeyDown={e => e.key === 'Enter' && addDoc()} style={{ flex: 1 }} />
            <button className="btn btn-gold btn-sm" onClick={addDoc}>Add</button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 && !showAdd ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No documents added yet.</div>
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
                        <span className="cc-docs-icon">📄</span><span>{doc.label}</span>
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
