import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useBudget } from '../hooks/useFirestore';
import VersionHistory, { createVersion, trimVersions } from './VersionHistory';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function getCurrentFiscalYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${(startYear + 1).toString().slice(2)}`;
}

function getFiscalYear(dateStr) {
  if (!dateStr) return getCurrentFiscalYear();
  const d = new Date(dateStr + 'T00:00:00');
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${startYear}-${(startYear + 1).toString().slice(2)}`;
}

function getFiscalYearOptions(approvedBudgets) {
  const current = getCurrentFiscalYear();
  const years = new Set([current]);
  // Add year before and after current
  const [startStr] = current.split('-');
  const start = parseInt(startStr);
  years.add(`${start - 1}-${start.toString().slice(2)}`);
  years.add(`${start + 1}-${(start + 2).toString().slice(2)}`);
  // Add any years that have approved budgets
  if (approvedBudgets) Object.keys(approvedBudgets).forEach(y => years.add(y));
  return [...years].sort();
}

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
  const [selectedYear, setSelectedYear] = useState(getCurrentFiscalYear());

  useEffect(() => {
    if (data && !local) {
      const d = JSON.parse(JSON.stringify(data));
      // Migrate: if publishedBudget exists but approvedBudgets doesn't, create it
      if (d.publishedBudget && !d.approvedBudgets) {
        const fy = d.publishedBudget.fiscalYear || getCurrentFiscalYear();
        d.approvedBudgets = { [fy]: { ...d.publishedBudget, fiscalYear: fy } };
        if (!d.publishedBudget.fiscalYear) d.publishedBudget.fiscalYear = fy;
      }
      // Initialize with defaults if empty
      if (!d.lineItems || d.lineItems.length === 0) {
        d.lineItems = DEFAULT_LINE_ITEMS.map(item => ({
          id: genId(), name: item.name, owner: item.owner, scenarios: {}, notes: '',
        }));
        d.scenarios = d.scenarios || ['Scenario A'];
        d.spending = d.spending || [];
        d.publishedBudget = d.publishedBudget || null;
      }
      setLocal(d);
    }
  }, [data, local]);

  // Listen for navigate-budget-spending event to auto-switch to spending view
  useEffect(() => {
    const handler = () => setView('spending');
    window.addEventListener('navigate-budget-spending', handler);
    return () => window.removeEventListener('navigate-budget-spending', handler);
  }, []);

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
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Budget saved' }));
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Budget save failed:', err);
      setSaveStatus('error');
    }
  };

  const scenarios = local?.scenarios || ['Scenario A'];
  const lineItems = local?.lineItems || [];
  const spending = local?.spending || [];
  const approvedBudgets = local?.approvedBudgets || {};
  const published = approvedBudgets[selectedYear] || null;

  // Filter spending to selected fiscal year
  // Uses explicit fiscalYear field if present, otherwise includes entries without a FY tag in the selected year
  const yearSpending = useMemo(() => {
    return spending.filter(s => {
      if (s.fiscalYear) return s.fiscalYear === selectedYear;
      // Legacy entries without fiscalYear field: include in selected year
      return true;
    });
  }, [spending, selectedYear]);

  const yearOptions = getFiscalYearOptions(approvedBudgets);

  if (loading || !local) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading budget...</div>;

  // Approve a scenario as the official budget for a fiscal year
  const approveScenario = (scenarioName) => {
    const targetYear = window.prompt(
      `Which fiscal year should "${scenarioName}" be approved for?\n\nEnter a fiscal year (e.g., 2025-26):`,
      selectedYear
    );
    if (!targetYear) return;
    // Validate format
    if (!/^\d{4}-\d{2}$/.test(targetYear)) {
      window.alert('Please use the format YYYY-YY (e.g., 2025-26)');
      return;
    }
    const existing = approvedBudgets[targetYear];
    if (existing && !window.confirm(`There is already an approved budget for ${targetYear} ("${existing.scenarioName}"). Replace it?`)) return;

    update(c => {
      if (!c.approvedBudgets) c.approvedBudgets = {};
      // Snapshot the previous approved budget before overwriting
      if (c.approvedBudgets[targetYear]) {
        if (!c.budgetVersions) c.budgetVersions = [];
        const prev = c.approvedBudgets[targetYear];
        const totalAmt = (prev.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        c.budgetVersions.push(createVersion(prev, `FY ${targetYear} — ${prev.scenarioName} ($${Math.round(totalAmt).toLocaleString()})`));
        c.budgetVersions = trimVersions(c.budgetVersions);
      }
      const budgetData = {
        scenarioName,
        fiscalYear: targetYear,
        publishedAt: new Date().toISOString(),
        items: (c.lineItems || []).map(item => ({
          id: item.id, name: item.name, owner: item.owner,
          amount: parseFloat(item.scenarios?.[scenarioName]) || 0,
          notes: item.notes || '',
        })),
      };
      c.approvedBudgets[targetYear] = budgetData;
      // Also keep publishedBudget pointing to the most recently approved for backward compat
      c.publishedBudget = budgetData;
    });
    setSelectedYear(targetYear);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="sub-nav" style={{ marginBottom: 0, borderBottom: 'none' }}>
            {[
              { id: 'dashboard', label: 'Approved Budget' },
              { id: 'builder', label: 'Budget Builder' },
              { id: 'spending', label: 'Spending Log' },
            ].map(t => (
              <button key={t.id} className={`sub-nav-btn ${view === t.id ? 'active' : ''}`}
                onClick={() => { setView(t.id); setPreviewScenario(null); }}>{t.label}</button>
            ))}
          </div>
          {/* Fiscal Year Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>FY</span>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, color: '#1B3A5C', cursor: 'pointer', padding: '2px 4px' }}>
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}{approvedBudgets[y] ? ' ✓' : ''}{y === getCurrentFiscalYear() ? ' (current)' : ''}</option>
              ))}
            </select>
          </div>
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

      {view === 'dashboard' && <BudgetDashboard lineItems={lineItems} published={published} spending={yearSpending} previewScenario={previewScenario} selectedYear={selectedYear} budgetVersions={local?.budgetVersions || []} update={update} />}
      {view === 'builder' && <BudgetBuilder lineItems={lineItems} scenarios={scenarios} update={update} published={published} onPreview={(s) => { setPreviewScenario(s); setView('dashboard'); }} onApprove={approveScenario} selectedYear={selectedYear} approvedBudgets={approvedBudgets} />}
      {view === 'spending' && <SpendingLog lineItems={lineItems} spending={yearSpending} update={update} published={published} selectedYear={selectedYear} allSpending={spending} />}
    </div>
  );
}

// ============================================================
// BUDGET DASHBOARD — shows APPROVED budget vs. spending
// ============================================================
function BudgetDashboard({ lineItems, published, spending, previewScenario, selectedYear, budgetVersions, update }) {
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
    const fiscalMonth = month >= 6 ? month - 6 : month + 6;
    const pctYear = Math.round((fiscalMonth / 12) * 100);

    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, pctSpent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0, pctYear, categories };
  }, [lineItems, spending, published, previewScenario, isPreview]);

  const exportPDF = () => {
    const label = isPreview ? `Preview: ${previewScenario}` : published ? `Approved Budget — ${published.scenarioName} (FY ${selectedYear})` : 'Budget';
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
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginBottom: 8 }}>No Approved Budget for FY {selectedYear}</h3>
        <p style={{ color: '#6B7280', fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
          Build your budget scenarios in the Budget Builder tab, then use "Preview" to review and "Approve" to set it as the official budget for this fiscal year. You can switch fiscal years using the FY picker above.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 2 }}>
            {isPreview ? `Preview: ${previewScenario}` : `Approved Budget — ${published.scenarioName} (FY ${selectedYear})`}
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

      {/* Budget version history */}
      {!isPreview && budgetVersions && budgetVersions.length > 0 && (
        <VersionHistory
          versions={budgetVersions}
          title="Approved Budget History"
          onRestore={(snapshot) => {
            if (!window.confirm(`Restore the approved budget from ${snapshot.scenarioName} (${snapshot.fiscalYear})? This will replace the current approved budget for that fiscal year.`)) return;
            update(c => {
              if (!c.approvedBudgets) c.approvedBudgets = {};
              c.approvedBudgets[snapshot.fiscalYear] = snapshot;
              if (snapshot.fiscalYear === selectedYear) c.publishedBudget = snapshot;
            });
          }}
          renderDiff={(snapshot) => {
            const total = (snapshot.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
            return (
              <div>
                <div><strong>{snapshot.scenarioName}</strong> — FY {snapshot.fiscalYear}</div>
                <div>Total budget: ${Math.round(total).toLocaleString()}</div>
                <div>{(snapshot.items || []).length} line items</div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// BUDGET BUILDER — working scenarios with preview & approve
// ============================================================
function BudgetBuilder({ lineItems, scenarios, update, published, onPreview, onApprove, selectedYear, approvedBudgets }) {
  const [newItemName, setNewItemName] = useState('');
  const [newScenarioName, setNewScenarioName] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);

  const handleBudgetCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV appears empty.'); return; }
      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const nameIdx = header.findIndex(h => h.includes('item') || h.includes('name') || h.includes('category') || h.includes('expense') || h.includes('description'));
      const ownerIdx = header.findIndex(h => h.includes('owner') || h.includes('assigned') || h.includes('responsible'));
      const amtIdx = header.findIndex(h => h.includes('amount') || h.includes('budget') || h.includes('projected') || h.includes('cost') || h.includes('total') || h.includes('expense'));
      // If amtIdx matched the same column as nameIdx, find the next match
      const amtIdxFinal = amtIdx === nameIdx ? header.findIndex((h, i) => i !== nameIdx && (h.includes('amount') || h.includes('budget') || h.includes('projected') || h.includes('cost') || h.includes('total'))) : amtIdx;
      const notesIdx = header.findIndex(h => h.includes('note'));
      if (nameIdx === -1) { alert('Could not find a column for line item names. Looking for headers containing: item, name, category, expense, or description.'); return; }
      if (amtIdxFinal === -1) { alert('Could not find a column for amounts. Looking for headers containing: amount, budget, projected, cost, or total.'); return; }
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        const name = cells[nameIdx] || '';
        if (!name) continue;
        let owner = ownerIdx >= 0 ? cells[ownerIdx] || 'HM' : 'HM';
        const ownerMatch = OWNERS.find(o => o.toLowerCase() === owner.toLowerCase());
        if (ownerMatch) owner = ownerMatch;
        else {
          const labelMatch = Object.entries(OWNER_LABELS).find(([, v]) => v.toLowerCase() === owner.toLowerCase());
          owner = labelMatch ? labelMatch[0] : 'HM';
        }
        const amount = parseFloat((cells[amtIdxFinal] || '0').replace(/[$,]/g, '')) || 0;
        const notes = notesIdx >= 0 ? cells[notesIdx] || '' : '';
        // Check if this matches an existing line item
        const existing = lineItems.find(li => li.name.toLowerCase() === name.toLowerCase());
        rows.push({ name, owner, amount, notes, existingId: existing?.id || null });
      }
      if (rows.length === 0) { alert('No valid rows found.'); return; }
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBudgetCsvImport = () => {
    const targetScenario = scenarios[0] || 'Scenario A';
    update(c => {
      for (const row of csvPreview) {
        if (row.existingId) {
          const item = c.lineItems.find(i => i.id === row.existingId);
          if (item) {
            item.owner = row.owner;
            if (row.notes) item.notes = row.notes;
            if (!item.scenarios) item.scenarios = {};
            item.scenarios[targetScenario] = row.amount.toString();
          }
        } else {
          c.lineItems.push({
            id: genId(), name: row.name, owner: row.owner,
            scenarios: { [targetScenario]: row.amount.toString() }, notes: row.notes || '',
          });
        }
      }
    });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Imported ${csvPreview.length} budget line items into "${scenarios[0] || 'Scenario A'}"` }));
    setCsvPreview([]);
  };

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

      {/* Approved budgets summary */}
      {Object.keys(approvedBudgets || {}).length > 0 && (
        <div style={{ padding: '8px 14px', background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
          <strong style={{ color: '#16A34A' }}>Approved Budgets:</strong>
          {Object.entries(approvedBudgets).sort((a, b) => a[0].localeCompare(b[0])).map(([fy, b]) => (
            <span key={fy} style={{ marginLeft: 12, padding: '2px 8px', background: fy === selectedYear ? '#DCFCE7' : '#F9FAFB', borderRadius: 4, border: fy === selectedYear ? '1px solid #86EFAC' : '1px solid #E5E7EB' }}>
              <strong>FY {fy}</strong>: {b.scenarioName}
              <span style={{ color: '#9CA3AF', marginLeft: 4 }}>
                ({new Date(b.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
              </span>
            </span>
          ))}
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
        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
          📥 Import CSV
          <input type="file" accept=".csv" onChange={handleBudgetCsv} style={{ display: 'none' }} />
        </label>
      </div>

      {/* CSV Import Preview */}
      {csvPreview.length > 0 && (
        <div className="card" style={{ marginTop: 12, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
            Import Preview — {csvPreview.length} line items → "{scenarios[0] || 'Scenario A'}"
          </div>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Name</th><th>Owner</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {csvPreview.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{OWNER_LABELS[r.owner] || r.owner}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${r.amount.toLocaleString()}</td>
                  <td style={{ fontSize: 11, color: r.existingId ? '#CA8A04' : '#16A34A' }}>{r.existingId ? 'Update existing' : 'New item'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setCsvPreview([])}>Cancel</button>
            <button className="btn btn-sm btn-gold" onClick={handleBudgetCsvImport}>Import {csvPreview.length} Items</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SPENDING LOG — tracks against APPROVED budget
// ============================================================
function SpendingLog({ lineItems, spending, update, published, selectedYear, allSpending }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ categoryId: '', date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  const [filterCat, setFilterCat] = useState('all');
  const [csvPreview, setCsvPreview] = useState([]);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  // Use approved budget items for category names and budgeted amounts
  const approvedItems = published?.items || [];
  const getApprovedAmount = (id) => {
    const item = approvedItems.find(i => i.id === id);
    return item ? (parseFloat(item.amount) || 0) : 0;
  };

  const addEntry = () => {
    if (!newEntry.categoryId || !newEntry.amount) return;
    const amt = parseFloat(newEntry.amount) || 0;
    update(c => {
      if (!c.spending) c.spending = [];
      c.spending.push({ id: genId(), ...newEntry, amount: amt, fiscalYear: selectedYear });
    });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Purchase logged: $${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` }));
    setNewEntry({ categoryId: newEntry.categoryId, date: new Date().toISOString().split('T')[0], description: '', amount: '' });
  };

  // CSV Import for spending
  const handleSpendingCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV appears empty.'); return; }
      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const dateIdx = header.findIndex(h => h.includes('date'));
      const catIdx = header.findIndex(h => h.includes('category') || h.includes('item') || h.includes('budget'));
      const descIdx = header.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('note') || h.includes('vendor') || h.includes('payee'));
      const amtIdx = header.findIndex(h => h.includes('amount') || h.includes('cost') || h.includes('total') || h.includes('price') || h.includes('expense'));
      if (amtIdx === -1) { alert('Could not find an amount column. Looking for headers containing: amount, cost, total, price, or expense.'); return; }
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        const amount = parseFloat((cells[amtIdx] || '0').replace(/[$,]/g, '')) || 0;
        if (amount === 0) continue;
        const date = dateIdx >= 0 ? cells[dateIdx] || '' : '';
        const catName = catIdx >= 0 ? cells[catIdx] || '' : '';
        const description = descIdx >= 0 ? cells[descIdx] || '' : '';
        // Match category to existing line item (fuzzy)
        let matchedItem = lineItems.find(li => li.name.toLowerCase() === catName.toLowerCase());
        if (!matchedItem && catName) matchedItem = lineItems.find(li => li.name.toLowerCase().includes(catName.toLowerCase()) || catName.toLowerCase().includes(li.name.toLowerCase()));
        rows.push({ date, categoryName: catName, categoryId: matchedItem?.id || '', matchedName: matchedItem?.name || '', description, amount, unmatched: !matchedItem && !!catName });
      }
      if (rows.length === 0) { alert('No valid rows found.'); return; }
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSpendingCsvImport = () => {
    update(c => {
      if (!c.spending) c.spending = [];
      for (const row of csvPreview) {
        c.spending.push({ id: genId(), categoryId: row.categoryId, date: row.date, description: row.description, amount: row.amount, fiscalYear: selectedYear });
      }
    });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Imported ${csvPreview.length} spending entries` }));
    setCsvPreview([]);
  };

  const removeEntry = (id) => { update(c => { c.spending = (c.spending || []).filter(s => s.id !== id); }); };

  const catTotals = {};
  spending.forEach(s => { if (!catTotals[s.categoryId]) catTotals[s.categoryId] = 0; catTotals[s.categoryId] += parseFloat(s.amount) || 0; });

  const getCatName = (id) => lineItems.find(i => i.id === id)?.name || 'Unknown';

  // Sort logic
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'amount' ? 'desc' : 'asc'); }
  };
  const sortArrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const filtered = filterCat === 'all' ? spending : spending.filter(s => s.categoryId === filterCat);
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (sortCol === 'date') { va = a.date || ''; vb = b.date || ''; }
    else if (sortCol === 'category') { va = getCatName(a.categoryId).toLowerCase(); vb = getCatName(b.categoryId).toLowerCase(); }
    else if (sortCol === 'description') { va = (a.description || '').toLowerCase(); vb = (b.description || '').toLowerCase(); }
    else if (sortCol === 'amount') { va = parseFloat(a.amount) || 0; vb = parseFloat(b.amount) || 0; }
    else { va = ''; vb = ''; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Edit helpers
  const startEdit = (entry) => { setEditingId(entry.id); setEditDraft({ categoryId: entry.categoryId, date: entry.date, description: entry.description, amount: entry.amount }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const saveEdit = () => {
    const amt = parseFloat(editDraft.amount) || 0;
    update(c => { const entry = (c.spending || []).find(s => s.id === editingId); if (entry) { entry.categoryId = editDraft.categoryId; entry.date = editDraft.date; entry.description = editDraft.description; entry.amount = amt; } });
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Entry updated' }));
    cancelEdit();
  };

  // Export CSV
  const escCsv = (val) => { const s = String(val); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const exportCsv = () => {
    const header = ['#', 'Date', 'Category', 'Description', 'Amount'];
    const rows = sorted.map((s, i) => [
      i + 1,
      s.date || '',
      escCsv(getCatName(s.categoryId)),
      escCsv(s.description || ''),
      (parseFloat(s.amount) || 0).toFixed(2),
    ]);
    const total = sorted.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    rows.push(['', '', '', 'TOTAL', total.toFixed(2)]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `cafm-spending-FY${selectedYear}.csv`; a.click();
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Spending log exported' }));
  };

  // Export PDF
  const exportPdf = () => {
    const total = sorted.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const catRows = sorted.map((s, i) => `
      <tr>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;color:#9CA3AF;font-size:10px;text-align:center;">${i + 1}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${s.date || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${getCatName(s.categoryId)}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${s.description || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;">$${(parseFloat(s.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>CAFM Spending Log</title>
      <style>body{font-family:'Segoe UI',sans-serif;color:#1F2937;max-width:850px;margin:0 auto;padding:32px;}
      h1{font-family:Georgia,serif;color:#1B3A5C;font-size:20px;margin-bottom:2px;}
      .sub{font-size:12px;color:#6B7280;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;padding:6px;background:#F9FAFB;border-bottom:2px solid #E5E7EB;font-size:10px;text-transform:uppercase;color:#6B7280;}
      @media print{body{padding:16px;}}</style></head><body>
      <h1>CAFM Spending Log — FY ${selectedYear}</h1>
      <div class="sub">Chesterton Academy of the Florida Martyrs &middot; Generated ${new Date().toLocaleDateString()} &middot; ${sorted.length} entries${filterCat !== 'all' ? ' (filtered: ' + getCatName(filterCat) + ')' : ''}</div>
      <table><thead><tr><th style="text-align:center;width:30px;">#</th><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${catRows}
        <tr style="font-weight:700;border-top:2px solid #1B3A5C;">
          <td colspan="4" style="padding:8px;font-family:Georgia,serif;color:#1B3A5C;">TOTAL (${sorted.length} entries)</td>
          <td style="padding:8px;text-align:right;font-family:Georgia,serif;color:#1B3A5C;">$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr></tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 2 }}>Spending Log — FY {selectedYear}</h3>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
            Showing {spending.length} of {(allSpending || spending).length} total entries (filtered by fiscal year)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {spending.length > 0 && (
            <button className="btn btn-sm btn-secondary" style={{ color: '#DC2626' }} onClick={() => {
              if (!window.confirm(`Delete all ${spending.length} spending entries for FY ${selectedYear}? This cannot be undone.`)) return;
              update(c => { c.spending = (c.spending || []).filter(s => s.fiscalYear && s.fiscalYear !== selectedYear); });
              window.dispatchEvent(new CustomEvent('toast', { detail: 'Spending cleared' }));
            }}>Clear All</button>
          )}
          {sorted.length > 0 && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={exportCsv}>Export CSV</button>
              <button className="btn btn-sm btn-secondary" onClick={exportPdf}>Export PDF</button>
            </>
          )}
          <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
            Import CSV
            <input type="file" accept=".csv" onChange={handleSpendingCsv} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Log Purchase'}</button>
        </div>
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

      {/* CSV Import Preview */}
      {csvPreview.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
            Import Preview — {csvPreview.length} spending entries
          </div>
          {csvPreview.some(r => r.unmatched) && (
            <div style={{ padding: '6px 10px', background: '#FEF2F2', borderRadius: 6, marginBottom: 8, fontSize: 11, color: '#DC2626' }}>
              Some categories couldn't be matched to budget line items. They'll be imported without a category link.
            </div>
          )}
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>Match</th></tr></thead>
              <tbody>
                {csvPreview.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.categoryName}</td>
                    <td>{r.description}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontSize: 11, color: r.matchedName ? '#16A34A' : r.unmatched ? '#DC2626' : '#9CA3AF' }}>
                      {r.matchedName || (r.unmatched ? 'No match' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvPreview.length > 30 && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>...and {csvPreview.length - 30} more</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>
              Total: ${csvPreview.reduce((s, r) => s + r.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => setCsvPreview([])}>Cancel</button>
            <button className="btn btn-sm btn-gold" onClick={handleSpendingCsvImport}>Import {csvPreview.length} Entries</button>
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
            <thead><tr>
              <th style={{ width: 36, textAlign: 'center', color: '#9CA3AF' }}>#</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('date')}>Date{sortArrow('date')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('category')}>Category{sortArrow('category')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('description')}>Description{sortArrow('description')}</th>
              <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('amount')}>Amount{sortArrow('amount')}</th>
              <th style={{ width: 60 }}></th>
            </tr></thead>
            <tbody>
              {sorted.map((s, idx) => editingId === s.id ? (
                <tr key={s.id} style={{ background: '#FFFBEB' }}>
                  <td style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11 }}>{idx + 1}</td>
                  <td><input type="date" value={editDraft.date || ''} onChange={e => setEditDraft({ ...editDraft, date: e.target.value })} style={{ width: 130, fontSize: 12 }} /></td>
                  <td>
                    <select value={editDraft.categoryId || ''} onChange={e => setEditDraft({ ...editDraft, categoryId: e.target.value })} style={{ fontSize: 12, width: '100%' }}>
                      <option value="">—</option>
                      {lineItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={editDraft.description || ''} onChange={e => setEditDraft({ ...editDraft, description: e.target.value })} style={{ width: '100%', fontSize: 12 }} /></td>
                  <td><input type="number" step="0.01" value={editDraft.amount || ''} onChange={e => setEditDraft({ ...editDraft, amount: e.target.value })} style={{ width: 100, textAlign: 'right', fontSize: 12 }} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-gold" style={{ fontSize: 10, padding: '2px 6px', marginRight: 2 }} onClick={saveEdit}>Save</button>
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px' }} onClick={cancelEdit}>X</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11 }}>{idx + 1}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={{ fontSize: 12 }}>{getCatName(s.categoryId)}</td>
                  <td style={{ fontSize: 13 }}>{s.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${(parseFloat(s.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="remove-btn" style={{ marginRight: 4 }} title="Edit" onClick={() => startEdit(s)}>&#9998;</button>
                    <button className="remove-btn" title="Delete" onClick={() => removeEntry(s.id)}>×</button>
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
                <td></td>
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
