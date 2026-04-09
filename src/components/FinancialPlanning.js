import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useFinancialPlanning } from '../hooks/useFirestore';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return n != null && !isNaN(n) ? '$' + Math.round(n).toLocaleString() : '—'; }
function fmtPct(n) { return n != null && !isNaN(n) ? (n * 100).toFixed(1) + '%' : '—'; }

const YEARS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];

const DEFAULT_PROJECTION_ITEMS = [
  { name: 'Admin Salary', owner: 'Treasurer', values: { '2025-26': 90500, '2026-27': 115000 } },
  { name: 'Admin Assistant', owner: 'Treasurer', values: { '2026-27': 20000 } },
  { name: 'Teacher Salaries', owner: 'Treasurer', values: { '2025-26': 133000, '2026-27': 188000 } },
  { name: 'Contract Expenses', owner: 'Treasurer', values: { '2025-26': 0, '2026-27': 5000 } },
  { name: 'Employment Taxes', owner: 'Treasurer', values: { '2025-26': 19499, '2026-27': 25146 } },
  { name: 'Books', owner: 'HM', values: { '2025-26': 10500, '2026-27': 11000 } },
  { name: 'Teacher Development/Training', owner: 'HM', values: { '2025-26': 1500, '2026-27': 1350 } },
  { name: 'Vehicle Rental', owner: 'HM', values: { '2025-26': 500 } },
  { name: 'Teacher/Class Supplies', owner: 'HM', values: { '2025-26': 3000, '2026-27': 3300 } },
  { name: 'Technology', owner: 'HM', values: { '2025-26': 2000, '2026-27': 500 } },
  { name: 'Office Supplies', owner: 'HM', values: { '2025-26': 2500, '2026-27': 2000 } },
  { name: 'House Activities / Student Life', owner: 'HM', values: { '2025-26': 2500, '2026-27': 1980 } },
  { name: 'CLT Exams', owner: 'HM', values: { '2025-26': 1100, '2026-27': 1320 } },
  { name: 'Student Retreat', owner: 'HM', values: { '2025-26': 700, '2026-27': 700 } },
  { name: 'Christmas Bonus', owner: 'HM', values: { '2025-26': 0, '2026-27': 1500 } },
  { name: 'Drama', owner: 'HM', values: { '2025-26': 1500, '2026-27': 2500 } },
  { name: 'Music', owner: 'HM', values: { '2026-27': 400 } },
  { name: 'HM Discretionary', owner: 'HM', values: { '2025-26': 750, '2026-27': 500 } },
  { name: 'Graduation', owner: 'HM', values: { '2026-27': 600 } },
  { name: 'Uniform Compliance', owner: 'HM', values: { '2026-27': 400 } },
  { name: 'Facilities Rental', owner: 'Treasurer', values: { '2025-26': 22000, '2026-27': 25000 } },
  { name: 'Security Infrastructure', owner: 'ED', values: { '2025-26': 1000, '2026-27': 500 } },
  { name: 'Storage Unit', owner: 'ED', values: { '2025-26': 0 } },
  { name: 'Insurance', owner: 'Secretary', values: { '2025-26': 13000, '2026-27': 8500 } },
  { name: 'CSN Annual Fee', owner: 'Treasurer', values: { '2025-26': 8100, '2026-27': 8100 } },
  { name: 'CSN Annual Conference', owner: 'ED', values: { '2025-26': 4000, '2026-27': 5775 } },
  { name: 'Marketing (Recruiting)', owner: 'HM', values: { '2025-26': 825, '2026-27': 1250 } },
  { name: 'Marketing (Fundraising)', owner: 'ED', values: { '2025-26': 825, '2026-27': 1250 } },
  { name: 'Software', owner: 'Treasurer', values: { '2025-26': 5064, '2026-27': 5982 } },
  { name: 'Furniture', owner: 'HM', values: { '2025-26': 0, '2026-27': 2500 } },
  { name: 'Fundraising Expenses', owner: 'ED', values: { '2025-26': 13000, '2026-27': 40000 } },
  { name: 'Bank Fees', owner: 'Treasurer', values: { '2025-26': 600, '2026-27': 300 } },
  { name: 'Legal/Accounting/Filing', owner: 'Treasurer', values: { '2025-26': 2200, '2026-27': 2200 } },
  { name: 'Regulatory Compliance', owner: 'ED', values: { '2025-26': 1589, '2026-27': 6654 } },
  { name: 'PO Box', owner: 'ED', values: { '2025-26': 275, '2026-27': 275 } },
  { name: 'FLVS Tuition', owner: 'HM', values: { '2025-26': 3000, '2026-27': 1500 } },
];

const DEFAULT_REVENUE = {
  enrollment: { '2025-26': 22, '2026-27': 33, '2027-28': 40, '2028-29': 48, '2029-30': 56, '2030-31': 60 },
  tuitionPerStudent: { '2025-26': 8907, '2026-27': 10500, '2027-28': 10700, '2028-29': 10900, '2029-30': 11100, '2030-31': 11300 },
  previousYearSurplus: { '2025-26': 28400 },
  galaEarnings: { '2025-26': 124987 },
  otherRevenue: { '2025-26': 12000 },
  financialAid: { '2026-27': 16500 },
};

const DEFAULT_TUITION = {
  tuition: { 2025: 8973, 2026: 9600, 2027: 9763, 2028: 9929, 2029: 10098, 2030: 10270 },
  fees: { 2025: 450, 2026: 900, 2027: 515, 2028: 530, 2029: 545, 2030: 560 },
  sufsFTC: { 2025: 7546, 2026: 7606, 2027: 7667, 2028: 7729, 2029: 7790, 2030: 7853 },
  sufsUA: { 2025: 9660, 2026: 9757, 2027: 9854, 2028: 9953, 2029: 10052, 2030: 10153 },
  tuitionGrowth: 0.017, sufsGrowth: 0.008, uaGrowth: 0.01,
};

const DEFAULT_SALARY = { raisePercent: 0.0225, baseYear1: { degree: 45000, masters: 49000, doctorate: 55000 } };

const DEFAULT_AID = {
  year: 2026, totalTF: 10500, aidBudget: 13500,
  families: [
    { id: 'f1', familyId: 'Family A', efc: 0, numFTC: 1, numUA: 0, awardAmount: 2891 },
    { id: 'f2', familyId: 'Family B', efc: 2000, numFTC: 1, numUA: 1, awardAmount: 0 },
    { id: 'f3', familyId: 'Family C', efc: 500, numFTC: 2, numUA: 0, awardAmount: 4782 },
  ],
};

// Shared editable input style
const editInput = { border: '1px solid #E5E7EB', borderRadius: 4, padding: '4px 6px', fontSize: 12, background: '#fff' };
const editInputRight = { ...editInput, textAlign: 'right' };
const editInputCenter = { ...editInput, textAlign: 'center' };

// Save status component
function SaveBar({ dirty, onSave, saveStatus }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {saveStatus === 'saved' && <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Saved!</span>}
      {saveStatus === 'error' && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Save failed — try again</span>}
      {dirty && !saveStatus && <span style={{ fontSize: 12, color: '#CA8A04', fontWeight: 600 }}>Unsaved changes</span>}
      <button className="btn btn-primary btn-sm" onClick={onSave} disabled={!dirty && saveStatus !== 'error'}
        style={{ minWidth: 70 }}>{dirty ? 'Save' : 'Saved'}</button>
    </div>
  );
}

export default function FinancialPlanning() {
  const { data, loading, saveData } = useFinancialPlanning();
  const [local, setLocal] = useState(null);
  const [view, setView] = useState('projections');
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saved' | 'error'

  useEffect(() => {
    if (data && !local) {
      if (data.initialized) setLocal(JSON.parse(JSON.stringify(data)));
      else {
        const seeded = { initialized: true, projections: DEFAULT_PROJECTION_ITEMS.map(d => ({ id: genId(), ...d })), revenue: DEFAULT_REVENUE, tuition: DEFAULT_TUITION, salary: DEFAULT_SALARY, aid: DEFAULT_AID };
        setLocal(seeded); setDirty(true);
      }
    }
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
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Financial plan saved' }));
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    }
  };

  if (loading || !local) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading financial data...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'projections', label: '6-Year Projections' }, { id: 'tuition', label: 'Tuition Model' }, { id: 'salary', label: 'Salary Schedule' }, { id: 'aid', label: 'Financial Aid' }].map(t => (
            <button key={t.id} className={`btn btn-sm ${view === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(t.id)}>{t.label}</button>
          ))}
        </div>
        <SaveBar dirty={dirty} onSave={handleSave} saveStatus={saveStatus} />
      </div>
      {view === 'projections' && <SixYearProjections data={local} update={update} />}
      {view === 'tuition' && <TuitionModel data={local} update={update} />}
      {view === 'salary' && <SalaryScheduleView data={local} update={update} />}
      {view === 'aid' && <FinancialAidView data={local} update={update} />}
    </div>
  );
}

function SixYearProjections({ data, update }) {
  const items = data.projections || [];
  const revenue = data.revenue || {};
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState('');

  const totals = useMemo(() => {
    const t = {};
    YEARS.forEach(yr => { t[yr] = items.reduce((sum, item) => sum + (parseFloat(item.values?.[yr]) || 0), 0); });
    return t;
  }, [items]);

  const revTotals = useMemo(() => {
    const r = {};
    YEARS.forEach(yr => {
      const enrollment = parseFloat(revenue.enrollment?.[yr]) || 0;
      const perStudent = parseFloat(revenue.tuitionPerStudent?.[yr]) || 0;
      const tuition = enrollment * perStudent;
      const surplus = parseFloat(revenue.previousYearSurplus?.[yr]) || 0;
      const gala = parseFloat(revenue.galaEarnings?.[yr]) || 0;
      const other = parseFloat(revenue.otherRevenue?.[yr]) || 0;
      const aid = parseFloat(revenue.financialAid?.[yr]) || 0;
      r[yr] = { tuition, surplus, gala, other, aid, total: tuition + surplus + gala + other - aid };
    });
    return r;
  }, [revenue]);

  const updateItemValue = (id, yr, val) => { update(c => { const item = c.projections.find(i => i.id === id); if (item) { if (!item.values) item.values = {}; item.values[yr] = val === '' ? null : parseFloat(val) || 0; } }); };
  const updateRevenue = (field, yr, val) => { update(c => { if (!c.revenue[field]) c.revenue[field] = {}; c.revenue[field][yr] = val === '' ? null : parseFloat(val) || 0; }); };
  const addItem = () => { if (!newItem.trim()) return; update(c => { c.projections.push({ id: genId(), name: newItem.trim(), owner: 'HM', values: {} }); }); setNewItem(''); setShowAdd(false); };
  const removeItem = (id) => { if (window.confirm('Remove this line item?')) update(c => { c.projections = c.projections.filter(i => i.id !== id); }); };
  const stickyTd = (bg = '#fff') => ({ position: 'sticky', left: 0, background: bg, zIndex: 1 });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-title">6-Year Financial Projections</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Add Line'}</button>
      </div>
      {showAdd && (<div className="sched-inline-row" style={{ marginBottom: 12 }}><input type="text" value={newItem} placeholder="New line item" onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} style={{ width: 250 }} /><button className="btn btn-sm btn-gold" onClick={addItem}>Add</button></div>)}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ minWidth: 200, ...stickyTd('#F9FAFB') }}>Expense Line Item</th>{YEARS.map(yr => <th key={yr} style={{ textAlign: 'right', minWidth: 100 }}>{yr}</th>)}<th style={{ width: 30 }}></th></tr></thead>
          <tbody>
            {items.map(item => (<tr key={item.id}><td style={{ ...stickyTd(), fontWeight: 500, fontSize: 12 }}>{item.name}<span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 6 }}>{item.owner}</span></td>{YEARS.map(yr => (<td key={yr} style={{ textAlign: 'right', padding: '2px 4px' }}><input type="number" value={item.values?.[yr] ?? ''} placeholder="—" onChange={e => updateItemValue(item.id, yr, e.target.value)} style={{ ...editInputRight, width: 90 }} /></td>))}<td><button className="remove-btn" onClick={() => removeItem(item.id)}>×</button></td></tr>))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C', background: '#F0F4F8' }}><td style={{ ...stickyTd('#F0F4F8'), fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>TOTAL EXPENSES</td>{YEARS.map(yr => (<td key={yr} style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#1B3A5C', fontSize: 13 }}>{totals[yr] > 0 ? fmt(totals[yr]) : '—'}</td>))}<td></td></tr>
          </tbody>
        </table>
      </div>
      <h4 style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C', marginTop: 24, marginBottom: 8, fontSize: 15 }}>Revenue Assumptions</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ minWidth: 200, ...stickyTd('#F9FAFB') }}>Revenue Line</th>{YEARS.map(yr => <th key={yr} style={{ textAlign: 'right', minWidth: 100 }}>{yr}</th>)}</tr></thead>
          <tbody>
            {[{ key: 'enrollment', label: 'Enrollment (# students)' }, { key: 'tuitionPerStudent', label: 'Tuition & Fees per Student' }, { key: 'previousYearSurplus', label: 'Previous Year Surplus' }, { key: 'galaEarnings', label: 'Gala / Major Fundraising' }, { key: 'otherRevenue', label: 'Other Revenue' }, { key: 'financialAid', label: 'Financial Aid (deduction)' }].map(row => (
              <tr key={row.key}><td style={{ ...stickyTd(), fontWeight: 500, fontSize: 12 }}>{row.label}</td>{YEARS.map(yr => (<td key={yr} style={{ textAlign: 'right', padding: '2px 4px' }}><input type="number" value={revenue[row.key]?.[yr] ?? ''} placeholder="—" onChange={e => updateRevenue(row.key, yr, e.target.value)} style={{ ...editInputRight, width: 90 }} /></td>))}</tr>
            ))}
            <tr style={{ background: '#F0FFF4', fontWeight: 600 }}><td style={stickyTd('#F0FFF4')}>Tuition Revenue</td>{YEARS.map(yr => <td key={yr} style={{ textAlign: 'right', color: '#16A34A' }}>{revTotals[yr]?.tuition > 0 ? fmt(revTotals[yr].tuition) : '—'}</td>)}</tr>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #16A34A', background: '#F0FFF4' }}><td style={{ ...stickyTd('#F0FFF4'), fontFamily: 'var(--font-display)', color: '#16A34A' }}>TOTAL REVENUE</td>{YEARS.map(yr => <td key={yr} style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#16A34A', fontSize: 13 }}>{revTotals[yr]?.total > 0 ? fmt(revTotals[yr].total) : '—'}</td>)}</tr>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C', background: '#FFFBEB' }}><td style={{ ...stickyTd('#FFFBEB'), fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>FUNDRAISING GAP</td>{YEARS.map(yr => { const gap = (revTotals[yr]?.total || 0) - (totals[yr] || 0); const hasData = totals[yr] > 0 || (revTotals[yr]?.total || 0) > 0; return <td key={yr} style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: gap < 0 ? '#DC2626' : '#16A34A', fontSize: 13 }}>{hasData ? (gap < 0 ? '-' : '+') + fmt(Math.abs(gap)).slice(1) : '—'}</td>; })}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TuitionModel({ data, update }) {
  const t = data.tuition || DEFAULT_TUITION;
  const tuitionYears = [2025, 2026, 2027, 2028, 2029, 2030];
  const updateField = (field, year, val) => { update(c => { if (!c.tuition) c.tuition = { ...DEFAULT_TUITION }; if (!c.tuition[field]) c.tuition[field] = {}; c.tuition[field][year] = val === '' ? null : parseFloat(val) || 0; }); };
  const updateRate = (field, val) => { update(c => { if (!c.tuition) c.tuition = { ...DEFAULT_TUITION }; c.tuition[field] = val === '' ? 0 : parseFloat(val) || 0; }); };

  const rows = useMemo(() => tuitionYears.map(yr => {
    const tuition = parseFloat(t.tuition?.[yr]) || 0;
    const fees = parseFloat(t.fees?.[yr]) || 0;
    const total = tuition + fees;
    const ftc = parseFloat(t.sufsFTC?.[yr]) || 0;
    const oopFTC = total - ftc;
    const ua = parseFloat(t.sufsUA?.[yr]) || 0;
    const oopUA = total - ua;
    return { yr, tuition, fees, total, ftc, ftc50: ftc / 2, oopFTC, monthlyFTC: oopFTC > 0 ? oopFTC / 10 : 0, ua, oopUA, monthlyUA: oopUA > 0 ? oopUA / 10 : 0 };
  }), [t]);

  const stickyTd = (bg = '#fff') => ({ position: 'sticky', left: 0, background: bg, zIndex: 1 });

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 8 }}>Tuition & Scholarship Model</h3>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Projects tuition, fees, and scholarship awards (FTC and UA) across 6 years to estimate family out-of-pocket costs.</p>
      <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1B3A5C', marginBottom: 8 }}>Growth Assumptions</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[{ key: 'tuitionGrowth', label: 'Tuition Growth' }, { key: 'sufsGrowth', label: 'SUFS FTC Growth' }, { key: 'uaGrowth', label: 'UA Growth' }].map(r => (
            <div key={r.key} className="sched-field"><label>{r.label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="number" step="0.001" value={t[r.key] || ''} onChange={e => updateRate(r.key, e.target.value)} style={{ width: 80 }} /><span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtPct(t[r.key])}/yr</span></div></div>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ minWidth: 200, ...stickyTd('#F9FAFB') }}></th>{tuitionYears.map(yr => <th key={yr} style={{ textAlign: 'right', minWidth: 95 }}>{yr}-{String(yr + 1).slice(2)}</th>)}</tr></thead>
          <tbody>
            {[{ key: 'tuition', label: 'Tuition' }, { key: 'fees', label: 'Fees' }].map(f => (
              <tr key={f.key}><td style={{ ...stickyTd(), fontWeight: 600 }}>{f.label}</td>{tuitionYears.map(yr => (<td key={yr} style={{ textAlign: 'right', padding: '2px 4px' }}><input type="number" value={t[f.key]?.[yr] ?? ''} onChange={e => updateField(f.key, yr, e.target.value)} style={{ ...editInputRight, width: 80 }} /></td>))}</tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C', background: '#F0F4F8' }}><td style={{ ...stickyTd('#F0F4F8'), color: '#1B3A5C' }}>Tuition + Fees Total</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', color: '#1B3A5C' }}>{fmt(r.total)}</td>)}</tr>
            <tr><td colSpan={tuitionYears.length + 1} style={{ padding: 6 }}></td></tr>
            <tr style={{ background: '#EFF6FF' }}><td style={{ ...stickyTd('#EFF6FF'), fontWeight: 600, color: '#1D4ED8' }}>SUFS FTC Award</td>{tuitionYears.map(yr => (<td key={yr} style={{ textAlign: 'right', padding: '2px 4px' }}><input type="number" value={t.sufsFTC?.[yr] ?? ''} onChange={e => updateField('sufsFTC', yr, e.target.value)} style={{ ...editInputRight, width: 80, color: '#1D4ED8' }} /></td>))}</tr>
            <tr style={{ background: '#EFF6FF' }}><td style={{ ...stickyTd('#EFF6FF'), fontSize: 11, color: '#6B7280' }}>50% Late Deadline</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', fontSize: 11, color: '#6B7280' }}>{fmt(r.ftc50)}</td>)}</tr>
            <tr style={{ background: '#EFF6FF', fontWeight: 600 }}><td style={stickyTd('#EFF6FF')}>OOP (Full FTC)</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', color: r.oopFTC < 0 ? '#16A34A' : '#1B3A5C' }}>{fmt(r.oopFTC)}</td>)}</tr>
            <tr style={{ background: '#EFF6FF' }}><td style={{ ...stickyTd('#EFF6FF'), fontSize: 11 }}>Monthly (10 mo)</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', fontSize: 11 }}>{r.monthlyFTC > 0 ? fmt(r.monthlyFTC) : '—'}</td>)}</tr>
            <tr><td colSpan={tuitionYears.length + 1} style={{ padding: 4 }}></td></tr>
            <tr style={{ background: '#FFF7ED' }}><td style={{ ...stickyTd('#FFF7ED'), fontWeight: 600, color: '#C2410C' }}>UA Award</td>{tuitionYears.map(yr => (<td key={yr} style={{ textAlign: 'right', padding: '2px 4px' }}><input type="number" value={t.sufsUA?.[yr] ?? ''} onChange={e => updateField('sufsUA', yr, e.target.value)} style={{ ...editInputRight, width: 80, color: '#C2410C' }} /></td>))}</tr>
            <tr style={{ background: '#FFF7ED', fontWeight: 600 }}><td style={stickyTd('#FFF7ED')}>OOP (UA)</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', color: r.oopUA < 0 ? '#16A34A' : '#1B3A5C' }}>{fmt(r.oopUA)}</td>)}</tr>
            <tr style={{ background: '#FFF7ED' }}><td style={{ ...stickyTd('#FFF7ED'), fontSize: 11 }}>Monthly (10 mo)</td>{rows.map(r => <td key={r.yr} style={{ textAlign: 'right', fontSize: 11 }}>{r.monthlyUA > 0 ? fmt(r.monthlyUA) : '—'}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryScheduleView({ data, update }) {
  const s = data.salary || DEFAULT_SALARY;
  const [viewMode, setViewMode] = useState('full');
  const [maxYears, setMaxYears] = useState(15);
  const updateBase = (field, val) => { update(c => { if (!c.salary) c.salary = { ...DEFAULT_SALARY }; if (!c.salary.baseYear1) c.salary.baseYear1 = { ...DEFAULT_SALARY.baseYear1 }; c.salary.baseYear1[field] = val === '' ? 0 : parseFloat(val) || 0; }); };
  const updateRaise = (val) => { update(c => { if (!c.salary) c.salary = { ...DEFAULT_SALARY }; c.salary.raisePercent = val === '' ? 0 : parseFloat(val) || 0; }); };
  const multiplier = viewMode === 'quarter' ? 0.25 : viewMode === 'half' ? 0.5 : viewMode === 'three-quarter' ? 0.75 : 1;
  const modeLabel = viewMode === 'quarter' ? '1/4 Time' : viewMode === 'half' ? '1/2 Time' : viewMode === 'three-quarter' ? '3/4 Time' : 'Full Time';

  const schedule = useMemo(() => {
    const rows = [];
    const raise = s.raisePercent || 0.0225;
    for (let yr = 1; yr <= maxYears; yr++) {
      const factor = Math.pow(1 + raise, yr - 1);
      rows.push({ year: yr, degree: Math.round((s.baseYear1?.degree || 45000) * factor * multiplier), masters: Math.round((s.baseYear1?.masters || 49000) * factor * multiplier), doctorate: Math.round((s.baseYear1?.doctorate || 55000) * factor * multiplier) });
    }
    return rows;
  }, [s, multiplier, maxYears]);

  return (
    <div>
      <h3 className="section-title" style={{ marginBottom: 8 }}>Salary Schedule</h3>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Step-and-column salary table with configurable base pay and annual raise percentage.</p>
      <div className="card" style={{ marginBottom: 16, background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1B3A5C', marginBottom: 8 }}>Configuration</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="sched-field"><label>Annual Raise %</label><input type="number" step="0.0001" value={s.raisePercent ?? ''} onChange={e => updateRaise(e.target.value)} style={{ width: 80 }} /></div>
          <div className="sched-field"><label>Year 1 Bachelor's</label><input type="number" value={s.baseYear1?.degree ?? ''} onChange={e => updateBase('degree', e.target.value)} style={{ width: 100 }} /></div>
          <div className="sched-field"><label>Year 1 Master's</label><input type="number" value={s.baseYear1?.masters ?? ''} onChange={e => updateBase('masters', e.target.value)} style={{ width: 100 }} /></div>
          <div className="sched-field"><label>Year 1 Doctorate</label><input type="number" value={s.baseYear1?.doctorate ?? ''} onChange={e => updateBase('doctorate', e.target.value)} style={{ width: 100 }} /></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'full', label: 'Full' }, { id: 'three-quarter', label: '3/4' }, { id: 'half', label: '1/2' }, { id: 'quarter', label: '1/4' }].map(m => (
          <button key={m.id} className={`btn btn-sm ${viewMode === m.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode(m.id)}>{m.label} Time</button>
        ))}
        <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>Show</span>
        <select value={maxYears} onChange={e => setMaxYears(parseInt(e.target.value))} style={{ fontSize: 12, padding: '3px 6px' }}>{[10, 15, 25].map(n => <option key={n} value={n}>{n} years</option>)}</select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: 12, maxWidth: 500 }}>
          <thead><tr><th>Years Exp</th><th style={{ textAlign: 'right' }}>Bachelor's</th><th style={{ textAlign: 'right' }}>Master's</th><th style={{ textAlign: 'right' }}>Doctorate</th></tr></thead>
          <tbody>{schedule.map(row => (<tr key={row.year} style={row.year <= 3 ? { background: '#FFFBEB' } : {}}><td style={{ fontWeight: 600 }}>{row.year}</td><td style={{ textAlign: 'right' }}>{fmt(row.degree)}</td><td style={{ textAlign: 'right' }}>{fmt(row.masters)}</td><td style={{ textAlign: 'right' }}>{fmt(row.doctorate)}</td></tr>))}</tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#6B7280' }}>
        <strong>{modeLabel}</strong> — {fmtPct(s.raisePercent)} annual raises. Per-class rate at Year 5 Master's: ~{fmt((schedule.find(r => r.year === 5)?.masters || 0) / 24)} (based on 24 class periods).
      </div>
    </div>
  );
}

function FinancialAidView({ data, update }) {
  const aid = data.aid || DEFAULT_AID;
  const families = aid.families || [];
  const totalTF = parseFloat(aid.totalTF) || 10500;
  const aidBudget = parseFloat(aid.aidBudget) || 0;

  const computed = useMemo(() => {
    let totalNeed = 0;
    const rows = families.map(f => {
      const efc = parseFloat(f.efc) || 0; const numFTC = parseInt(f.numFTC) || 0; const numUA = parseInt(f.numUA) || 0;
      const totalEFC = efc * (numFTC + numUA);
      const estNeed = Math.max(0, totalTF * (numFTC + numUA) - totalEFC);
      totalNeed += estNeed;
      return { ...f, totalEFC, estNeed };
    });
    return rows.map(r => {
      const aidPct = totalNeed > 0 ? r.estNeed / totalNeed : 0;
      const availableAid = aidBudget * aidPct;
      const awardAmount = parseFloat(r.awardAmount) || Math.min(availableAid, r.estNeed);
      const familyOOP = totalTF * ((parseInt(r.numFTC) || 0) + (parseInt(r.numUA) || 0)) - awardAmount;
      return { ...r, aidPct, availableAid, awardAmount, familyOOP };
    });
  }, [families, totalTF, aidBudget]);

  const updateAidField = (field, val) => { update(c => { if (!c.aid) c.aid = { ...DEFAULT_AID }; c.aid[field] = val === '' ? 0 : parseFloat(val) || 0; }); };
  const updateFamily = (id, field, val) => { update(c => { const fam = (c.aid?.families || []).find(f => f.id === id); if (fam) fam[field] = val; }); };
  const addFamily = () => { update(c => { if (!c.aid) c.aid = { ...DEFAULT_AID }; if (!c.aid.families) c.aid.families = []; c.aid.families.push({ id: genId(), familyId: '', efc: 0, numFTC: 1, numUA: 0, awardAmount: 0 }); }); };
  const removeFamily = (id) => { if (window.confirm('Remove this family?')) update(c => { c.aid.families = c.aid.families.filter(f => f.id !== id); }); };
  const totalAwarded = computed.reduce((sum, r) => sum + (parseFloat(r.awardAmount) || 0), 0);
  const totalApplicants = families.filter(f => (parseInt(f.numFTC) || 0) > 0 || (parseInt(f.numUA) || 0) > 0).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-title">Financial Aid Calculator</h3>
        <button className="btn btn-sm btn-primary" onClick={addFamily}>+ Add Family</button>
      </div>

      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Enter the EFC from Step Up for each family. The calculator distributes the aid budget proportionally based on demonstrated need.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 200px', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Tuition & Fees Total</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6B7280' }}>$</span>
            <input type="number" value={aid.totalTF ?? ''} onChange={e => updateAidField('totalTF', e.target.value)}
              style={{ ...editInput, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#1B3A5C', width: 120 }} />
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 200px', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Financial Aid Budget</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6B7280' }}>$</span>
            <input type="number" value={aid.aidBudget ?? ''} onChange={e => updateAidField('aidBudget', e.target.value)}
              style={{ ...editInput, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#1B3A5C', width: 120 }} />
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 120px', padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Applicants</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#1B3A5C' }}>{totalApplicants}</div>
        </div>
        <div className="card" style={{ flex: '1 1 120px', padding: 16, textAlign: 'center', background: totalAwarded > aidBudget && aidBudget > 0 ? '#FEF2F2' : undefined }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Total Awarded</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: totalAwarded > aidBudget && aidBudget > 0 ? '#DC2626' : '#1B3A5C' }}>{fmt(totalAwarded)}</div>
        </div>
      </div>

      {families.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No families added yet. Click "+ Add Family" to start.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th>Family</th>
                <th style={{ textAlign: 'right' }}>EFC<br/><span style={{ fontWeight: 400, fontSize: 10, color: '#9CA3AF' }}>from Step Up</span></th>
                <th style={{ textAlign: 'center' }}># FTC</th>
                <th style={{ textAlign: 'center' }}># UA</th>
                <th style={{ textAlign: 'right', color: '#6B7280' }}>Total EFC</th>
                <th style={{ textAlign: 'right', color: '#6B7280' }}>Est. Need</th>
                <th style={{ textAlign: 'right', color: '#6B7280' }}>Aid %</th>
                <th style={{ textAlign: 'right' }}>Award<br/><span style={{ fontWeight: 400, fontSize: 10, color: '#9CA3AF' }}>editable</span></th>
                <th style={{ textAlign: 'right', color: '#6B7280' }}>Family OOP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {computed.map(f => (
                <tr key={f.id}>
                  <td><input type="text" value={f.familyId || ''} onChange={e => updateFamily(f.id, 'familyId', e.target.value)} placeholder="Family ID" style={{ ...editInput, fontWeight: 500, width: 130 }} /></td>
                  <td style={{ textAlign: 'right' }}><input type="number" value={f.efc ?? ''} onChange={e => updateFamily(f.id, 'efc', e.target.value)} placeholder="0" style={{ ...editInputRight, width: 80 }} /></td>
                  <td style={{ textAlign: 'center' }}><input type="number" min="0" max="5" value={f.numFTC ?? ''} onChange={e => updateFamily(f.id, 'numFTC', e.target.value)} style={{ ...editInputCenter, width: 50 }} /></td>
                  <td style={{ textAlign: 'center' }}><input type="number" min="0" max="5" value={f.numUA ?? ''} onChange={e => updateFamily(f.id, 'numUA', e.target.value)} style={{ ...editInputCenter, width: 50 }} /></td>
                  <td style={{ textAlign: 'right', color: '#6B7280', padding: '6px 8px' }}>{fmt(f.totalEFC)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: f.estNeed > 0 ? '#DC2626' : '#6B7280', padding: '6px 8px' }}>{fmt(f.estNeed)}</td>
                  <td style={{ textAlign: 'right', color: '#6B7280', padding: '6px 8px' }}>{fmtPct(f.aidPct)}</td>
                  <td style={{ textAlign: 'right' }}><input type="number" value={f.awardAmount ?? ''} onChange={e => updateFamily(f.id, 'awardAmount', e.target.value)} style={{ ...editInputRight, width: 80, fontWeight: 600, color: '#16A34A' }} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#1B3A5C', padding: '6px 8px' }}>{fmt(f.familyOOP)}</td>
                  <td><button className="remove-btn" onClick={() => removeFamily(f.id)}>×</button></td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
                <td colSpan={5} style={{ fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>TOTALS</td>
                <td style={{ textAlign: 'right', color: '#DC2626' }}>{fmt(computed.reduce((s, r) => s + r.estNeed, 0))}</td>
                <td></td>
                <td style={{ textAlign: 'right', color: '#16A34A' }}>{fmt(totalAwarded)}</td>
                <td style={{ textAlign: 'right', color: '#1B3A5C' }}>{fmt(computed.reduce((s, r) => s + r.familyOOP, 0))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {aidBudget > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: totalAwarded > aidBudget ? '#FEF2F2' : '#F0FFF4', borderRadius: 8, border: `1px solid ${totalAwarded > aidBudget ? '#FECACA' : '#BBF7D0'}`, fontSize: 12 }}>
          <strong>Budget Status:</strong> {fmt(totalAwarded)} of {fmt(aidBudget)} awarded ({fmt(Math.abs(aidBudget - totalAwarded))} {totalAwarded > aidBudget ? 'over budget' : 'remaining'})
        </div>
      )}
    </div>
  );
}
