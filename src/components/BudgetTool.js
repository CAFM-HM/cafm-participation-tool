import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useBudget } from '../hooks/useFirestore';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const OWNERS = ['HM', 'Treasurer', 'ED', 'Secretary', 'Other'];
const OWNER_LABELS = { HM: 'Headmaster', Treasurer: 'Treasurer', ED: 'Exec. Director', Secretary: 'Secretary', Other: 'Other' };

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
  const [previewScenario, setPreviewScenario] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (data && !local) setLocal(JSON.parse(JSON.stringify(data)));
  }, [data, local]);

  const update = useCallback((fn) => {
    setLocal(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });
    setDirty(true);
    setSaveStatus(null);
  }, []);

  const handleSave = async () => {
    if (!local) return;
    try {
      await saveData(local);
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Budget save failed:', err);
      setSaveStatus('error');
    }
  };

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
  const published = local.publishedBudget || null;

  // Approve a scenario as the official budget
  const approveScenario = (scenarioName) => {
    if (!window.confirm(`Approve "${scenarioName}" as the official budget? This will replace the current approved budget.`)) return;
    update(c => {
      c.publishedBudget = {
        scenarioName,
        publishedAt: new Date().toISOString(),
        items: (c.lineItems || []).map(item => ({
          id: item.id, name: item.name, owner: item.owner,
          amount: parseFloat(item.scenarios?.[scenarioName]) || 0,
          notes: item.notes || '',
        })),
      };
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'dashboard', label: 'Approved Budget' },
            { id: 'builder', label: 'Budget Builder' },
            { id: 'spending', label: 'Spending Log' },
          ].map(t => (
            <button key={t.id} className={`btn btn-sm ${view === t.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setView(t.id); setPreviewScenario(null); }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saveStatus === 'saved' && <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Saved!</span>}
          {saveStatus === 'error' && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Save failed — try again</span>}
          {dirty && !saveStatus && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved changes</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!dirty && saveStatus !== 'error'} style={{ minWidth: 70 }}>{dirty ? 'Save' : 'Saved'}</button>
        </div>
      </div>

      {/* Preview banner */}
      {previewScenario && (
        <div style={{ padding: '10px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>Previewing: {previewScenario}</span>
            <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 8 }}>This is a working scenario — not yet approved.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-gold" onClick={() => { approveScenario(previewScenario); setPreviewScenario(null); setView('dashboard'); }}>Approve This Budget</button>
            <button className="btn btn-sm btn-secondary" onClick={() => setPreviewScenario(null)}>Exit Preview</button>
          </div>
        </div>
      )}

      {view === 'dashboard' && <BudgetDashboard lineItems={lineItems} published={published} spending={spending} previewScenario={previewScenario} />}
      {view === 'builder' && <BudgetBuilder lineItems={lineItems} scenarios={scenarios} update={update} published={published} onPreview={(s) => { setPreviewScenario(s); setView('dashboard'); }} onApprove={approveScenario} />}
      {view === 'spending' && <SpendingLog lineItems={lineItems} spending={spending} update={update} published={published} />}
    </div>
  );
}

// ============================================================
// BUDGET DASHBOARD — shows APPROVED budget vs. spending
// ============================================================
function BudgetDashboard({ lineItems, published, spending, previewScenario }) {
  const isPreview = !!previewScenario;

  const stats = useMemo(() => {
    let totalBudget = 0, totalSpent = 0;
    const categories = [];

    // If previewing a scenario, read amounts from lineItems.scenarios[previewScenario]
    // If viewing approved, read from published.items
    const getAmount = (item) => {
      if (isPreview) return parseFloat(item.scenarios?.[previewScenario]) || 0;
      if (published) {
        const pub = published.items?.find(p => p.id === item.id);
        return pub ? (parseFloat(pub.amount) || 0) : 0;
      }
      return 0;
    };

    lineItems.forEach(item => {
      const budgeted = getAmount(item);
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

    const now = new Date();
    const month = now.getMonth();
    const fiscalMonth = month >= 7 ? month - 7 : month + 5;
    const pctYear = Math.round((fiscalMonth / 10) * 100);

    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, pctSpent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0, pctYear, categories };
  }, [lineItems, spending, published, previewScenario, isPreview]);

  const exportPDF = () => {
    const label = isPreview ? `Preview: ${previewScenario}` : published ? `Approved Budget — ${published.scenarioName}` : 'Budget';
    const w = window.open('', '_blank');
    const catRows = stats.categories.filter(c => c.budgeted > 0).map(c => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-weight:500;">${c.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#6B7280;">${OWNER_LABELS[c.owner] || c.owner}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">$${c.budgeted.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">$${c.spent.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;color:${c.remaining < 0 ? '#DC2626' : '#1B3A5C'};">$${c.remaining.toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:right;${c.overBudget ? 'color:#DC2626;font-weight:600;' : ''}">${c.pct}%</td>
      </tr>
    `).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>CAFM Budget</title>
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
      <h1>CAFM ${label}</h1>
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

  if (!published && !isPreview) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginBottom: 8 }}>No Approved Budget Yet</h3>
        <p style={{ color: '#6B7280', fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
          Build your budget scenarios in the Budget Builder tab, then use "Preview" to review and "Approve" to set it as the official budget. Spending will be tracked against the approved budget.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 2 }}>
            {isPreview ? `Preview: ${previewScenario}` : `Approved Budget — ${published.scenarioName}`}
          </h3>
          {!isPreview && published.publishedAt && (
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>Approved {new Date(published.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          )}
        </div>
        <button className="btn btn-sm btn-gold" onClick={exportPDF}>Export PDF</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-value">${stats.totalBudget.toLocaleString()}</div><div className="stat-label">Total Budget</div></div>
        <div className="stat-card"><div className="stat-value">${stats.totalSpent.toLocaleString()}</div><div className="stat-label">Total Spent</div></div>
        <div className={`stat-card ${stats.remaining < 0 ? 'alert' : ''}`}><div className="stat-value">${stats.remaining.toLocaleString()}</div><div className="stat-label">Remaining</div></div>
        <div className={`stat-card ${stats.pctSpent > stats.pctYear + 10 ? 'alert' : ''}`}>
          <div className="stat-value">{stats.pctSpent}%</div>
          <div className="stat-label">Used ({stats.pctYear}% through year)</div>
        </div>
      </div>

      {/* Burn rate bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
          <span>Budget used</span><span>Fiscal year progress</span>
        </div>
        <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(stats.pctSpent, 100)}%`, background: stats.pctSpent > stats.pctYear + 10 ? '#DC2626' : '#16A34A', borderRadius: 5 }} />
          <div style={{ position: 'absolute', left: `${stats.pctYear}%`, top: -2, bottom: -2, width: 2, background: '#1B3A5C' }} />
        </div>
      </div>

      {/* Category breakdown */}
      <div className="budget-category-list">
        {stats.categories.filter(c => c.budgeted > 0).map(c => (
          <div key={c.id} className={`budget-category-row ${c.overBudget ? 'over-budget' : ''}`}>
            <div className="budget-cat-info">
              <div className="budget-cat-name">{c.name}</div>
              <div className="budget-cat-owner">{OWNER_LABELS[c.owner] || c.owner}</div>
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
// BUDGET BUILDER — working scenarios with preview & approve
// ============================================================
function BudgetBuilder({ lineItems, scenarios, update, published, onPreview, onApprove }) {
  const [newItemName, setNewItemName] = useState('');
  const [newScenarioName, setNewScenarioName] = useState('');

  const addLineItem = () => {
    if (!newItemName.trim()) return;
    update(c => { c.lineItems.push({ id: genId(), name: newItemName.trim(), owner: 'HM', scenarios: {}, notes: '' }); });
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
    update(c => { const item = c.lineItems.find(i => i.id === id); if (item) item[field] = value; });
  };

  const updateScenarioAmount = (id, scenario, value) => {
    update(c => { const item = c.lineItems.find(i => i.id === id); if (item) { if (!item.scenarios) item.scenarios = {}; item.scenarios[scenario] = value; } });
  };

  const totals = {};
  scenarios.forEach(s => {
    totals[s] = lineItems.reduce((sum, item) => sum + (parseFloat(item.scenarios?.[s]) || 0), 0);
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="section-title">Budget Builder</h3>
      </div>

      {/* Approved badge */}
      {published && (
        <div style={{ padding: '8px 14px', background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
          <strong style={{ color: '#16A34A' }}>Current Approved Budget:</strong> {published.scenarioName}
          <span style={{ color: '#9CA3AF', marginLeft: 8 }}>
            (approved {new Date(published.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
        </div>
      )}

      {/* Scenario management */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>WORKING SCENARIOS</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {scenarios.map((s, idx) => {
            const isApproved = published?.scenarioName === s;
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: isApproved ? '#F0FFF4' : '#F9FAFB', border: `1px solid ${isApproved ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C' }}>{s}</span>
                {isApproved && <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 600 }}>APPROVED</span>}
                <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>${(totals[s] || 0).toLocaleString()}</span>
                <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px', marginLeft: 4 }} onClick={() => onPreview(s)}>Preview</button>
                <button className="btn btn-sm btn-gold" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => onApprove(s)}>Approve</button>
                {scenarios.length > 1 && <button className="remove-btn" style={{ fontSize: 10 }} onClick={() => removeScenario(idx)}>×</button>}
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="text" value={newScenarioName} placeholder="New scenario" onChange={e => setNewScenarioName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addScenario()} style={{ width: 140, fontSize: 12 }} />
            <button className="btn btn-sm btn-secondary" onClick={addScenario}>+ Add</button>
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Line Item</th>
              <th style={{ minWidth: 120 }}>Assigned To</th>
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
                    style={{ border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12, padding: '3px 6px', background: '#fff', color: '#374151', width: '100%', minWidth: 100 }}>
                    {OWNERS.map(o => <option key={o} value={o}>{OWNER_LABELS[o] || o}</option>)}
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
// SPENDING LOG — tracks against APPROVED budget
// ============================================================
function SpendingLog({ lineItems, spending, update, published }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ categoryId: '', date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  const [filterCat, setFilterCat] = useState('all');

  // Use approved budget items for category names and budgeted amounts
  const approvedItems = published?.items || [];
  const getApprovedAmount = (id) => {
    const item = approvedItems.find(i => i.id === id);
    return item ? (parseFloat(item.amount) || 0) : 0;
  };

  const addEntry = () => {
    if (!newEntry.categoryId || !newEntry.amount) return;
    update(c => {
      if (!c.spending) c.spending = [];
      c.spending.push({ id: genId(), ...newEntry, amount: parseFloat(newEntry.amount) || 0 });
    });
    setNewEntry({ categoryId: newEntry.categoryId, date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  };

  const removeEntry = (id) => { update(c => { c.spending = (c.spending || []).filter(s => s.id !== id); }); };

  const filtered = filterCat === 'all' ? spending : spending.filter(s => s.categoryId === filterCat);
  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const catTotals = {};
  spending.forEach(s => { if (!catTotals[s.categoryId]) catTotals[s.categoryId] = 0; catTotals[s.categoryId] += parseFloat(s.amount) || 0; });

  const getCatName = (id) => lineItems.find(i => i.id === id)?.name || 'Unknown';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-title">Spending Log</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Log Purchase'}</button>
      </div>

      {!published && (
        <div style={{ padding: '8px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#92400E' }}>
          No approved budget yet. Spending is being logged but won't show budget comparisons until a budget is approved in the Budget Builder.
        </div>
      )}

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="sched-inline-row">
            <select value={newEntry.categoryId} onChange={e => setNewEntry({ ...newEntry, categoryId: e.target.value })} style={{ width: 250 }}>
              <option value="">— Budget Category —</option>
              {lineItems.map(i => {
                const approved = getApprovedAmount(i.id);
                const spent = catTotals[i.id] || 0;
                return <option key={i.id} value={i.id}>{i.name}{approved > 0 ? ` (${Math.round((spent / approved) * 100)}% used)` : ''}</option>;
              })}
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

      <div style={{ marginBottom: 12 }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 300 }}>
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
                <td colSpan={3} style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>TOTAL ({sorted.length} entries)</td>
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
