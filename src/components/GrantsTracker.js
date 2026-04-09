import React, { useState, useMemo } from 'react';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return n != null && !isNaN(n) ? '$' + Math.round(n).toLocaleString() : '$0'; }

const STATUSES = ['Draft', 'Submitted', 'Approved', 'Denied', 'Completed', 'Closed'];
const STATUS_COLORS = { Draft: '#6B7280', Submitted: '#2563EB', Approved: '#16A34A', Denied: '#DC2626', Completed: '#7C3AED', Closed: '#9CA3AF' };

export default function GrantsTracker({ grants, onSave }) {
  const [view, setView] = useState('list'); // list | detail
  const [activeId, setActiveId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newGrant, setNewGrant] = useState({ name: '', source: '', requested: '', status: 'Draft' });
  const [filterStatus, setFilterStatus] = useState('all');

  const list = grants || [];

  const stats = useMemo(() => {
    const active = list.filter(g => !['Denied', 'Closed'].includes(g.status));
    return {
      totalRequested: list.reduce((s, g) => s + (parseFloat(g.requested) || 0), 0),
      totalApproved: list.filter(g => ['Approved', 'Completed'].includes(g.status)).reduce((s, g) => s + (parseFloat(g.approved) || parseFloat(g.requested) || 0), 0),
      totalSpent: list.reduce((s, g) => s + (parseFloat(g.spent) || 0), 0),
      activeCount: active.length,
    };
  }, [list]);

  const filtered = useMemo(() => {
    let items = [...list];
    if (filterStatus !== 'all') items = items.filter(g => g.status === filterStatus);
    return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [list, filterStatus]);

  const addGrant = () => {
    if (!newGrant.name.trim()) return;
    const grant = {
      id: genId(),
      name: newGrant.name.trim(),
      source: newGrant.source.trim(),
      contact: '',
      requested: parseFloat(newGrant.requested) || 0,
      approved: 0,
      spent: 0,
      status: newGrant.status,
      dateSubmitted: '',
      dateApproved: '',
      startDate: '',
      endDate: '',
      reportingDeadline: '',
      notes: '',
      createdAt: new Date().toISOString(),
    };
    onSave([...list, grant]);
    setNewGrant({ name: '', source: '', requested: '', status: 'Draft' });
    setShowAdd(false);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Grant added' }));
  };

  const updateGrant = (id, field, value) => {
    const updated = list.map(g => g.id === id ? { ...g, [field]: value } : g);
    onSave(updated);
  };

  const deleteGrant = (id) => {
    if (!window.confirm('Delete this grant?')) return;
    onSave(list.filter(g => g.id !== id));
    if (activeId === id) { setView('list'); setActiveId(null); }
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Grant deleted' }));
  };

  const openDetail = (id) => { setActiveId(id); setView('detail'); };

  const exportCsv = () => {
    const header = ['Name', 'Source', 'Status', 'Requested', 'Approved', 'Spent', 'Remaining', 'Submitted', 'Approved Date', 'Start', 'End', 'Notes'];
    const rows = filtered.map(g => [
      '"' + (g.name || '').replace(/"/g, '""') + '"',
      '"' + (g.source || '').replace(/"/g, '""') + '"',
      g.status,
      (parseFloat(g.requested) || 0).toFixed(2),
      (parseFloat(g.approved) || 0).toFixed(2),
      (parseFloat(g.spent) || 0).toFixed(2),
      ((parseFloat(g.approved) || 0) - (parseFloat(g.spent) || 0)).toFixed(2),
      g.dateSubmitted || '', g.dateApproved || '', g.startDate || '', g.endDate || '',
      '"' + (g.notes || '').replace(/"/g, '""') + '"',
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cafm-grants.csv'; a.click();
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Grants exported' }));
  };

  // ---- DETAIL VIEW ----
  if (view === 'detail') {
    const g = list.find(gg => gg.id === activeId);
    if (!g) { setView('list'); return null; }
    const remaining = (parseFloat(g.approved) || 0) - (parseFloat(g.spent) || 0);
    const pct = (parseFloat(g.approved) || 0) > 0 ? Math.round(((parseFloat(g.spent) || 0) / (parseFloat(g.approved) || 0)) * 100) : 0;

    const field = (label, key, type = 'text', opts = {}) => (
      <div style={{ marginBottom: 10, ...opts.containerStyle }}>
        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2, fontWeight: 600 }}>{label}</label>
        {type === 'textarea' ? (
          <textarea value={g[key] || ''} onChange={e => updateGrant(g.id, key, e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, minHeight: 80, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        ) : type === 'number' ? (
          <input type="number" step="0.01" value={g[key] || ''} onChange={e => updateGrant(g.id, key, e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'right', boxSizing: 'border-box' }} />
        ) : type === 'select' ? (
          <select value={g[key] || ''} onChange={e => updateGrant(g.id, key, e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6 }}>
            {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={type} value={g[key] || ''} onChange={e => updateGrant(g.id, key, e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, boxSizing: 'border-box' }} />
        )}
      </div>
    );

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setView('list')}>&larr; Back to Grants</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-secondary" style={{ color: '#DC2626' }} onClick={() => deleteGrant(g.id)}>Delete</button>
          </div>
        </div>

        <h3 className="section-title" style={{ marginBottom: 4 }}>{g.name}</h3>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
          {g.source && <span>Source: {g.source}</span>}
          <span style={{ marginLeft: 12, fontWeight: 600, color: STATUS_COLORS[g.status] }}>{g.status}</span>
        </div>

        {/* Financial summary cards */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-value">{fmt(g.requested)}</div><div className="stat-label">Requested</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: '#16A34A' }}>{fmt(g.approved)}</div><div className="stat-label">Approved</div></div>
          <div className="stat-card"><div className="stat-value">{fmt(g.spent)}</div><div className="stat-label">Spent</div></div>
          <div className={`stat-card ${remaining < 0 ? 'alert' : ''}`}><div className="stat-value" style={{ color: remaining < 0 ? '#DC2626' : undefined }}>{fmt(remaining)}</div><div className="stat-label">Remaining ({pct}% used)</div></div>
        </div>

        {/* Spend progress bar */}
        {(parseFloat(g.approved) || 0) > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 90 ? '#DC2626' : pct > 70 ? '#CA8A04' : '#16A34A', borderRadius: 4 }} />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginBottom: 8, fontSize: 14 }}>Grant Details</h4>
            {field('Grant Name', 'name')}
            {field('Source / Funder', 'source')}
            {field('Contact Info', 'contact')}
            {field('Status', 'status', 'select', { options: STATUSES })}
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginBottom: 8, fontSize: 14 }}>Financials</h4>
            {field('Amount Requested', 'requested', 'number')}
            {field('Amount Approved', 'approved', 'number')}
            {field('Amount Spent', 'spent', 'number')}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          {field('Date Submitted', 'dateSubmitted', 'date')}
          {field('Date Approved', 'dateApproved', 'date')}
          {field('Start Date', 'startDate', 'date')}
          {field('End Date', 'endDate', 'date')}
          {field('Reporting Deadline', 'reportingDeadline', 'date')}
        </div>

        <div style={{ marginTop: 12 }}>
          {field('Notes / Details', 'notes', 'textarea')}
        </div>
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title">Grants Tracker</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB' }}>
            <option value="all">All ({list.length})</option>
            {STATUSES.map(s => <option key={s} value={s}>{s} ({list.filter(g => g.status === s).length})</option>)}
          </select>
          {list.length > 0 && <button className="btn btn-sm btn-secondary" onClick={exportCsv}>Export CSV</button>}
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ New Grant'}</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-value">{fmt(stats.totalRequested)}</div><div className="stat-label">Total Requested</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#16A34A' }}>{fmt(stats.totalApproved)}</div><div className="stat-label">Total Approved</div></div>
        <div className="stat-card"><div className="stat-value">{fmt(stats.totalSpent)}</div><div className="stat-label">Total Spent</div></div>
        <div className="stat-card"><div className="stat-value">{stats.activeCount}</div><div className="stat-label">Active Grants</div></div>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>New Grant</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Grant Name *</label>
              <input type="text" value={newGrant.name} onChange={e => setNewGrant({ ...newGrant, name: e.target.value })} placeholder="e.g., CAPE Equipment Grant" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Source / Funder</label>
              <input type="text" value={newGrant.source} onChange={e => setNewGrant({ ...newGrant, source: e.target.value })} placeholder="e.g., FL Dept of Education" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
            </div>
            <div style={{ width: 120 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Requested ($)</label>
              <input type="number" step="0.01" value={newGrant.requested} onChange={e => setNewGrant({ ...newGrant, requested: e.target.value })} placeholder="0" style={{ width: '100%', fontSize: 12, padding: '6px 8px', textAlign: 'right' }} />
            </div>
            <div style={{ width: 120 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Status</label>
              <select value={newGrant.status} onChange={e => setNewGrant({ ...newGrant, status: e.target.value })} style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn btn-sm btn-gold" onClick={addGrant} disabled={!newGrant.name.trim()}>Add Grant</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>&#128176;</div>
          <p>No grants tracked yet. Add your first grant to get started.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Grant Name</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Requested</th>
                <th style={{ textAlign: 'right' }}>Approved</th>
                <th style={{ textAlign: 'right' }}>Spent</th>
                <th style={{ textAlign: 'right' }}>Remaining</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => {
                const remaining = (parseFloat(g.approved) || 0) - (parseFloat(g.spent) || 0);
                return (
                  <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(g.id)}>
                    <td style={{ fontWeight: 600, color: '#1B3A5C' }}>{g.name}</td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{g.source}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(g.requested)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{(parseFloat(g.approved) || 0) > 0 ? fmt(g.approved) : '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{(parseFloat(g.spent) || 0) > 0 ? fmt(g.spent) : '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: remaining < 0 ? '#DC2626' : undefined }}>{(parseFloat(g.approved) || 0) > 0 ? fmt(remaining) : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[g.status], padding: '2px 8px', background: g.status === 'Approved' ? '#F0FDF4' : g.status === 'Denied' ? '#FEF2F2' : '#F9FAFB', borderRadius: 4 }}>{g.status}</span>
                    </td>
                    <td><button className="remove-btn" onClick={e => { e.stopPropagation(); deleteGrant(g.id); }}>x</button></td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
                <td colSpan={2} style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>TOTALS</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)' }}>{fmt(filtered.reduce((s, g) => s + (parseFloat(g.requested) || 0), 0))}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#16A34A' }}>{fmt(filtered.filter(g => ['Approved', 'Completed'].includes(g.status)).reduce((s, g) => s + (parseFloat(g.approved) || parseFloat(g.requested) || 0), 0))}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)' }}>{fmt(filtered.reduce((s, g) => s + (parseFloat(g.spent) || 0), 0))}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
