import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useBudget } from '../hooks/useFirestore';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const OWNERS = ['HM', 'Treasurer', 'ED', 'Secretary', 'Other'];

const DEFAULT_LINE_ITEMS = [
  { name: 'Admin Salary', owner: 'Treasurer' },
  { name: 'Teacher Salaries', owner: 'Treasurer' },
  { name: 'Contract Expenses', owner: 'Treasurer' },
  { name: 'Employment Taxes', owner: 'Treasurer' },
  { name: 'Books', owner: 'HM' },
  { name: 'Teacher Development/Training', owner: 'HM' },
  { name: 'Vehicle Rental', owner: 'HM' },
  { name: 'Teacher/Class Supplies', owner: 'HM' },
  { name: 'Technology', owner: 'HM' },
  { name: 'Office Supplies', owner: 'HM' },
  { name: 'House Activities / Student Life / Clubs', owner: 'HM' },
  { name: 'CLT Exams', owner: 'HM' },
  { name: 'Student Retreat', owner: 'HM' },
  { name: 'Christmas Bonus', owner: 'HM' },
  { name: 'Drama', owner: 'HM' },
  { name: 'Music', owner: 'HM' },
  { name: 'HM Discretionary', owner: 'HM' },
  { name: 'Graduation', owner: 'HM' },
  { name: 'Facilities Rental', owner: 'Treasurer' },
  { name: 'Security Infrastructure', owner: 'ED' },
  { name: 'Storage Unit', owner: 'ED' },
  { name: 'Insurance', owner: 'Secretary' },
  { name: 'CSN Annual Fee', owner: 'Treasurer' },
  { name: 'CSN Annual Conference', owner: 'ED' },
  { name: 'Fundraising Expenses', owner: 'HM' },
  { name: 'Uniform Compliance', owner: 'HM' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function BudgetTool() {
  const { data, loading, saveData } = useBudget();
  const [local, setLocal] = useState(null);
  const [view, setView] = useState('dashboard');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !local) setLocal(JSON.parse(JSON.stringify(data)));
  }, [data, local]);

  const update = useCallback((fn) => {
    setLocal(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });
    setDirty(true);
  }, []);

  const handleSave = async () => { if (local) { await saveData(local); setDirty(false); } };

  if (loading || !local) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading budget...</div>;

  // Initialize with defaults if empty
  if (!local.lineItems || local.lineItems.length === 0) {
    const items = DEFAULT_LINE_ITEMS.map(d => ({
      id: genId(), name: d.name, owner: d.owner, scenarios: {}, notes: '',
    }));
    setLocal(prev => ({ ...prev, lineItems: items, scenarios: ['Scenario A'], spending: [], publishedBudget: null }));
  }

  const scenarios = local.scenarios || ['Scenario A'];
  const lineItems = local.lineItems || [];
  const spending = local.spending || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'builder', label: 'Budget Builder' },
            { id: 'spending', label: 'Spending Log' },
          ].map(t => (
            <button key={t.id} className={`btn btn-sm ${view === t.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView(t.id)}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved</span>}
          <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={!dirty}>Save</button>
        </div>
      </div>

      {view === 'dashboard' && <BudgetDashboard lineItems={lineItems} scenarios={scenarios} spending={spending} />}
      {view === 'builder' && <BudgetBuilder lineItems={lineItems} scenarios={scenarios} update={update} />}
      {view === 'spending' && <SpendingLog lineItems={lineItems} spending={spending} update={update} />}
    </div>
  );
}

// ============================================================
// BUDGET DASHBOARD — summary cards, category progress bars
// ============================================================
function BudgetDashboard({ lineItems, scenarios, spending }) {
  const activeScenario = scenarios[0] || 'Scenario A';

  const stats = useMemo(() => {
    let totalBudget = 0, totalSpent = 0;
    const categories = [];

    lineItems.forEach(item => {
      const budgeted = parseFloat(item.scenarios?.[activeScenario]) || 0;
      totalBudget += budgeted;

      const itemSpending = spending.filter(s => s.categoryId === item.id);
      const spent = itemSpending.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      totalSpent += spent;

      categories.push({
        id: item.id, name: item.name, owner: item.owner,
        budgeted, spent, remaining: budgeted - spent,
        pct: budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0,
        overBudget: spent > budgeted && budgeted > 0,
      });
    });

    // Percentage through fiscal year (Aug-May = 10 months)
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const fiscalMonth = month >= 7 ? month - 7 : month + 5; // Aug=0, Jul=11
    const pctYear = Math.round((fiscalMonth / 10) * 100);

    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, pctSpent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0, pctYear, categories };
  }, [lineItems, spending, activeScenario]);

  const exportPDF = () => {
    const w = window.open('', '_blank');
    const catRows = stats.categories.filter(c => c.budgeted > 0).map(c => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-weight:500;">${c.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#6B7280;">${c.owner}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">$${c.budgeted.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">$${c.spent.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;color:${c.remaining < 0 ? '#DC2626' : '#1B3A5C'};">$${c.remaining.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;${c.overBudget ? 'color:#DC2626;font-weight:600;' : ''}">${c.pct}%</td>
      </tr>
    `).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>CAFM Budget Summary</title>
      <style>body{font-family:'Segoe UI',sans-serif;color:#1F2937;max-width:850px;margin:0 auto;padding:32px;}
      h1{font-family:Georgia,serif;color:#1B3A5C;font-size:20px;margin-bottom:2px;}
      .sub{font-size:12px;color:#6B7280;margin-bottom:20px;}
      .stats{display:flex;gap:16px;margin-bottom:24px;}
      .stat{flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;text-align:center;}
      .stat-val{font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B3A5C;}
      .stat-lbl{font-size:11px;color:#6B7280;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;padding:8px;background:#F9FAFB;border-bottom:2px solid #E5E7EB;font-size:10px;text-transform:uppercase;color:#6B7280;}
      @media print{body{padding:16px;}}</style></head><body>
      <h1>CAFM Budget Summary — ${activeScenario}</h1>
      <div class="sub">Chesterton Academy of the Florida Martyrs · Generated ${new Date().toLocaleDateString()}</div>
      <div class="stats">
        <div class="stat"><div class="stat-val">$${stats.totalBudget.toLocaleString()}</div><div class="stat-lbl">Total Budget</div></div>
        <div class="stat"><div class="stat-val">$${stats.totalSpent.toLocaleString()}</div><div class="stat-lbl">Total Spent</div></div>
        <div class="stat"><div class="stat-val" style="color:${stats.remaining < 0 ? '#DC2626' : '#1B3A5C'}">$${stats.remaining.toLocaleString()}</div><div class="stat-lbl">Remaining</div></div>
        <div class="stat"><div class="stat-val">${stats.pctSpent}%</div><div class="stat-lbl">Budget Used</div></div>
      </div>
      <table><thead><tr><th>Line Item</th><th>Owner</th><th style="text-align:right">Budgeted</th><th style="text-align:right">Spent</th><th style="text-align:right">Remaining</th><th style="text-align:right">Used</th></tr></thead>
      <tbody>${catRows}
        <tr style="font-weight:700;border-top:2px solid #1B3A5C;">
          <td style="padding:8px;" colspan="2">TOTAL</td>
          <td style="padding:8px;text-align:right;">$${stats.totalBudget.toLocaleString()}</td>
          <td style="padding:8px;text-align:right;">$${stats.totalSpent.toLocaleString()}</td>
          <td style="padding:8px;text-align:right;color:${stats.remaining < 0 ? '#DC2626' : '#1B3A5C'}">$${stats.remaining.toLocaleString()}</td>
          <td style="padding:8px;text-align:right;">${stats.pctSpent}%</td>
        </tr>
      </tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="section-title">Budget Overview — {activeScenario}</h3>
        <button className="btn btn-sm btn-gold" onClick={exportPDF}>Export PDF</button>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-value">${stats.totalBudget.toLocaleString()}</div><div className="stat-label">Total Budget</div></div>
        <div className="stat-card"><div className="stat-value">${stats.totalSpent.toLocaleString()}</div><div className="stat-label">Total Spent</div></div>
        <div className={`stat-card ${stats.remaining < 0 ? 'alert' : ''}`}><div className="stat-value">${stats.remaining.toLocaleString()}</div><div className="stat-label">Remaining</div></div>
        <div className={`stat-card ${stats.pctSpent > stats.pctYear + 10 ? 'alert' : ''}`}>
          <div className="stat-value">{stats.pctSpent}%</div>
          <div className="stat-label">Used ({stats.pctYear}% through year)</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="budget-category-list">
        {stats.categories.filter(c => c.budgeted > 0).map(c => (
          <div key={c.id} className={`budget-category-row ${c.overBudget ? 'over-budget' : ''}`}>
            <div className="budget-cat-info">
              <div className="budget-cat-name">{c.name}</div>
              <div className="budget-cat-owner">{c.owner}</div>
            </div>
            <div className="budget-cat-bar-area">
              <div className="budget-cat-bar-track">
                <div className="budget-cat-bar-fill" style={{ width: `${Math.min(c.pct, 100)}%`, background: c.overBudget ? '#DC2626' : c.pct > 80 ? '#CA8A04' : '#16A34A' }} />
              </div>
              <div className="budget-cat-numbers">
                <span>${c.spent.toLocaleString()} / ${c.budgeted.toLocaleString()}</span>
                <span style={{ fontWeight: 600, color: c.overBudget ? '#DC2626' : undefined }}>{c.pct}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// BUDGET BUILDER — line items with scenario columns
// ============================================================
function BudgetBuilder({ lineItems, scenarios, update }) {
  const [newItemName, setNewItemName] = useState('');
  const [newScenarioName, setNewScenarioName] = useState('');

  const addLineItem = () => {
    if (!newItemName.trim()) return;
    update(c => {
      c.lineItems.push({ id: genId(), name: newItemName.trim(), owner: 'HM', scenarios: {}, notes: '' });
    });
    setNewItemName('');
  };

  const removeLineItem = (id) => {
    if (!window.confirm('Remove this line item? Spending entries will remain.')) return;
    update(c => { c.lineItems = c.lineItems.filter(i => i.id !== id); });
  };

  const addScenario = () => {
    if (!newScenarioName.trim()) return;
    update(c => { c.scenarios.push(newScenarioName.trim()); });
    setNewScenarioName('');
  };

  const removeScenario = (idx) => {
    if (scenarios.length <= 1) return;
    if (!window.confirm(`Remove scenario "${scenarios[idx]}"?`)) return;
    update(c => { c.scenarios.splice(idx, 1); });
  };

  const updateItem = (id, field, value) => {
    update(c => {
      const item = c.lineItems.find(i => i.id === id);
      if (item) item[field] = value;
    });
  };

  const updateScenarioAmount = (id, scenario, value) => {
    update(c => {
      const item = c.lineItems.find(i => i.id === id);
      if (item) {
        if (!item.scenarios) item.scenarios = {};
        item.scenarios[scenario] = value;
      }
    });
  };

  // Calculate totals per scenario
  const totals = {};
  scenarios.forEach(s => {
    totals[s] = lineItems.reduce((sum, item) => sum + (parseFloat(item.scenarios?.[s]) || 0), 0);
  });

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 12 }}>Budget Builder</h3>

      {/* Scenario management */}
      <div className="sched-inline-row" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>SCENARIOS:</span>
        {scenarios.map((s, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span className="badge badge-green">{s}</span>
            {scenarios.length > 1 && <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeScenario(idx)}>×</button>}
          </div>
        ))}
        <input type="text" value={newScenarioName} placeholder="New scenario" onChange={e => setNewScenarioName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addScenario()} style={{ width: 140, fontSize: 12 }} />
        <button className="btn btn-sm btn-secondary" onClick={addScenario}>+ Add</button>
      </div>

      {/* Line items table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Line Item</th>
              <th style={{ width: 80 }}>Owner</th>
              {scenarios.map(s => <th key={s} style={{ minWidth: 120, textAlign: 'right' }}>{s}</th>)}
              <th style={{ minWidth: 200 }}>Notes</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map(item => (
              <tr key={item.id}>
                <td>
                  <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                    style={{ border: 'none', fontWeight: 500, width: '100%', background: 'transparent', padding: '2px 0' }} />
                </td>
                <td>
                  <select value={item.owner || 'HM'} onChange={e => updateItem(item.id, 'owner', e.target.value)}
                    style={{ border: 'none', fontSize: 11, background: 'transparent', color: '#6B7280' }}>
                    {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                {scenarios.map(s => (
                  <td key={s} style={{ textAlign: 'right' }}>
                    <input type="number" value={item.scenarios?.[s] || ''} placeholder="0"
                      onChange={e => updateScenarioAmount(item.id, s, e.target.value)}
                      style={{ border: 'none', textAlign: 'right', width: 100, background: 'transparent', fontWeight: 500, padding: '2px 0' }} />
                  </td>
                ))}
                <td>
                  <input type="text" value={item.notes || ''} onChange={e => updateItem(item.id, 'notes', e.target.value)}
                    placeholder="Notes..." style={{ border: 'none', fontSize: 12, width: '100%', background: 'transparent', color: '#6B7280', padding: '2px 0' }} />
                </td>
                <td><button className="remove-btn" onClick={() => removeLineItem(item.id)}>×</button></td>
              </tr>
            ))}
            {/* Totals row */}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
              <td style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>TOTAL</td>
              <td></td>
              {scenarios.map(s => (
                <td key={s} style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#1B3A5C', fontSize: 15 }}>
                  ${totals[s]?.toLocaleString() || '0'}
                </td>
              ))}
              <td></td><td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Add line item */}
      <div className="sched-inline-row" style={{ marginTop: 12 }}>
        <input type="text" value={newItemName} placeholder="New line item name"
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLineItem()} style={{ width: 250 }} />
        <button className="btn btn-sm btn-primary" onClick={addLineItem}>+ Add Line Item</button>
      </div>
    </div>
  );
}

// ============================================================
// SPENDING LOG — individual purchases by category
// ============================================================
function SpendingLog({ lineItems, spending, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ categoryId: '', date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  const [filterCat, setFilterCat] = useState('all');

  const addEntry = () => {
    if (!newEntry.categoryId || !newEntry.amount) return;
    update(c => {
      if (!c.spending) c.spending = [];
      c.spending.push({ id: genId(), ...newEntry, amount: parseFloat(newEntry.amount) || 0 });
    });
    setNewEntry({ categoryId: newEntry.categoryId, date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  };

  const removeEntry = (id) => {
    update(c => { c.spending = (c.spending || []).filter(s => s.id !== id); });
  };

  const filtered = filterCat === 'all' ? spending : spending.filter(s => s.categoryId === filterCat);
  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Category totals
  const catTotals = {};
  spending.forEach(s => {
    if (!catTotals[s.categoryId]) catTotals[s.categoryId] = 0;
    catTotals[s.categoryId] += parseFloat(s.amount) || 0;
  });

  const getCatName = (id) => lineItems.find(i => i.id === id)?.name || 'Unknown';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-title">Spending Log</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Log Purchase'}</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="sched-inline-row">
            <select value={newEntry.categoryId} onChange={e => setNewEntry({ ...newEntry, categoryId: e.target.value })} style={{ width: 220 }}>
              <option value="">— Budget Category —</option>
              {lineItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} style={{ width: 150 }} />
            <input type="number" value={newEntry.amount} placeholder="Amount" step="0.01"
              onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })} style={{ width: 110 }} />
          </div>
          <div className="sched-inline-row" style={{ marginTop: 8 }}>
            <input type="text" value={newEntry.description} placeholder="Description (e.g. Amazon - textbooks)"
              onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addEntry()} style={{ flex: 1 }} />
            <button className="btn btn-gold btn-sm" onClick={addEntry} disabled={!newEntry.categoryId || !newEntry.amount}>Log</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ marginBottom: 12 }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 250 }}>
          <option value="all">All Categories ({spending.length} entries)</option>
          {lineItems.filter(i => catTotals[i.id]).map(i => (
            <option key={i.id} value={i.id}>{i.name} — ${(catTotals[i.id] || 0).toLocaleString()}</option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No spending entries{filterCat !== 'all' ? ' for this category' : ''} yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={{ fontSize: 12 }}>{getCatName(s.categoryId)}</td>
                  <td style={{ fontSize: 13 }}>{s.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${(parseFloat(s.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td><button className="remove-btn" onClick={() => removeEntry(s.id)}>×</button></td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
                <td colSpan={3} style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>
                  TOTAL ({sorted.length} entries)
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>
                  ${sorted.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
