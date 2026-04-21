import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// ── CATEGORIES ──
const CATEGORIES = [
  { key: 'health_safety', label: 'Health & Safety', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'scholarship',   label: 'SUFS / Scholarship', color: '#0369A1', bg: '#E0F2FE' },
  { key: 'corporate',     label: 'Corporate / Legal', color: '#6D28D9', bg: '#EDE9FE' },
  { key: 'insurance',     label: 'Insurance', color: '#B45309', bg: '#FEF3C7' },
  { key: 'hr',            label: 'HR / Staff', color: '#15803D', bg: '#DCFCE7' },
  { key: 'facility',      label: 'Facility', color: '#475569', bg: '#F1F5F9' },
];

const FREQUENCIES = [
  { key: 'monthly',   label: 'Monthly',    months: 1 },
  { key: 'quarterly', label: 'Quarterly',  months: 3 },
  { key: 'annual',    label: 'Annual',     months: 12 },
  { key: '2year',     label: 'Every 2 yrs',months: 24 },
  { key: '5year',     label: 'Every 5 yrs',months: 60 },
  { key: 'onetime',   label: 'One-time',   months: 0 },
];

// ── DEFAULT SEED ITEMS (FL private school, no food service) ──
// Includes optional `instructions` and `externalLink` for known items.
const DEFAULT_ITEMS = [
  // Health & Safety
  { title: 'Annual Fire Marshal Inspection',          category: 'health_safety', frequency: 'annual',
    instructions: 'Contact the local Fire Marshal\u2019s office to schedule. Keep the signed inspection report on file and link it here. Address any deficiencies within the timeframe noted on the report.' },
  { title: 'Monthly Fire Drill',                       category: 'health_safety', frequency: 'monthly',
    instructions: 'FL requires monthly fire drills during the school year. Log date, time, and evacuation duration. Vary the time and exit used.' },
  { title: 'Severe Weather / Tornado Drill',           category: 'health_safety', frequency: 'annual' },
  { title: 'Lockdown / Active Threat Drill',           category: 'health_safety', frequency: 'annual' },
  { title: 'AED Battery & Pad Expiration Check',       category: 'health_safety', frequency: 'annual',
    instructions: 'Check expiration date on AED pads (typically 2\u20133 yrs) and battery (typically 4\u20135 yrs). Replace before expiration.' },
  { title: 'First Aid Kit Audit & Restock',            category: 'health_safety', frequency: 'annual' },
  { title: 'Playground / Facility Safety Walk-through',category: 'health_safety', frequency: 'annual' },

  // SUFS / Scholarship
  { title: 'FL DOE Private School Annual Registration', category: 'scholarship', frequency: 'annual', externalLink: 'https://www.fldoe.org/schools/school-choice/private-schools/',
    instructions: 'Submit the Annual Private School Survey at fldoe.org each year (typically opens in spring). Required to remain on the FL Private School Directory and continue accepting scholarship students.' },
  { title: 'Step Up For Students Annual Compliance Survey', category: 'scholarship', frequency: 'annual', externalLink: 'https://www.stepupforstudents.org/schools/',
    instructions: 'Submit via the SUFS Schools Portal. Includes attendance records, assessment results, and financial information.' },
  { title: 'SUFS Fee Schedule Submission',              category: 'scholarship', frequency: 'annual' },
  { title: 'Quarterly SUFS Invoice Submission',         category: 'scholarship', frequency: 'quarterly' },
  { title: 'CPA Financial Review / Audit (if required by scholarship $)', category: 'scholarship', frequency: 'annual',
    instructions: 'Required at scholarship-funding thresholds: financial review at $250K+, full audit at $1M+. Engage CPA early; reports typically due within 180 days of fiscal year end.' },
  { title: 'Norm-Referenced Assessment Administered & Results Uploaded', category: 'scholarship', frequency: 'annual' },
  { title: 'Notice of Enrollment Submission',           category: 'scholarship', frequency: 'annual' },

  // Corporate / Legal
  { title: 'Sunbiz Annual Report (Nonprofit Corp)',     category: 'corporate', frequency: 'annual', externalLink: 'https://dos.fl.gov/sunbiz/',
    instructions: 'File at sunbiz.org with your nonprofit Document Number. Due May 1 each year. Fee approx $61.25 for nonprofit corp. Late fee of $400 after May 1 \u2014 do not miss this date.' },
  { title: 'IRS Form 990 Filing',                       category: 'corporate', frequency: 'annual', externalLink: 'https://www.irs.gov/charities-non-profits',
    instructions: 'Due 5 months + 15 days after fiscal year end (Nov 15 for June 30 FY). 990-N (postcard) if gross receipts under $50K; 990-EZ if under $200K; full 990 above. E-file required.' },
  { title: 'FL Sales Tax Exemption Renewal (DR-5)',     category: 'corporate', frequency: '5year',
    instructions: 'Florida Consumer Certificate of Exemption renews every 5 years. FL DOR mails renewal notice ~60 days before expiration. Submit form DR-5 if not auto-renewed.' },
  { title: 'Charitable Solicitation Registration (FDACS)', category: 'corporate', frequency: 'annual', externalLink: 'https://csapp.fdacs.gov/',
    instructions: 'Required if soliciting donations in FL. Renew annually via FDACS Check-A-Charity portal. Fee scales with contributions received.' },
  { title: 'Registered Agent Verification',             category: 'corporate', frequency: 'annual' },

  // Insurance
  { title: 'General Liability Insurance Renewal',       category: 'insurance', frequency: 'annual' },
  { title: 'Property Insurance Renewal',                category: 'insurance', frequency: 'annual' },
  { title: "Workers' Compensation Renewal",             category: 'insurance', frequency: 'annual' },
  { title: 'Directors & Officers (D&O) Insurance Renewal', category: 'insurance', frequency: 'annual' },
  { title: 'Student Accident Coverage',                 category: 'insurance', frequency: 'annual' },

  // HR / Staff (per-staff tracking coming in a future update)
  { title: 'Level 2 Background Screening (All Staff)',  category: 'hr', frequency: '5year',
    instructions: 'Required for all school staff with student contact. 5-year renewal cycle. Track per-employee in a separate roster (per-staff HR tracker coming soon).' },
  { title: 'Mandatory Reporter Training (All Staff)',   category: 'hr', frequency: 'annual' },
  { title: 'CPR / First Aid Certification',             category: 'hr', frequency: 'annual' },
  { title: 'Title IX / Abuse Prevention Training',      category: 'hr', frequency: 'annual' },
  { title: 'I-9 / E-Verify Documentation',              category: 'hr', frequency: 'annual' },
  { title: 'Teacher Credentials on File',               category: 'hr', frequency: 'annual' },

  // Facility
  { title: 'Building Occupancy Certificate',            category: 'facility', frequency: 'annual' },
  { title: 'Pest Control Service',                      category: 'facility', frequency: 'quarterly' },
  { title: 'HVAC Inspection / Service',                 category: 'facility', frequency: 'annual' },
];

// ── STATUS LOGIC ──
// Returns one of: 'overdue', 'red', 'orange', 'yellow', 'current', 'none'
export function complianceStatus(nextDue) {
  if (!nextDue) return 'none';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(nextDue + 'T00:00:00');
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'overdue';
  if (days <= 30) return 'red';
  if (days <= 60) return 'orange';
  if (days <= 90) return 'yellow';
  return 'current';
}

const STATUS_META = {
  overdue:  { label: 'Overdue',        bg: '#7F1D1D', color: '#FFFFFF', dot: '⛔' },
  red:      { label: '≤ 30 days',      bg: '#DC2626', color: '#FFFFFF', dot: '🔴' },
  orange:   { label: '≤ 60 days',      bg: '#EA580C', color: '#FFFFFF', dot: '🟠' },
  yellow:   { label: '≤ 90 days',      bg: '#CA8A04', color: '#FFFFFF', dot: '🟡' },
  current:  { label: 'Current',        bg: '#15803D', color: '#FFFFFF', dot: '🟢' },
  none:     { label: 'No date set',    bg: '#6B7280', color: '#FFFFFF', dot: '⚪' },
};

// ── HELPERS ──
function addMonths(dateStr, months) {
  if (!dateStr || !months) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtUSD(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}

// Backwards-compat: turn legacy `driveLink` (single string) into the new `driveLinks` array.
function getDriveLinks(item) {
  if (Array.isArray(item.driveLinks) && item.driveLinks.length > 0) return item.driveLinks;
  if (item.driveLink) return [{ url: item.driveLink, label: 'Current report', addedAt: item.lastCompleted || '' }];
  return [];
}

// ── MAIN COMPONENT ──
export default function Compliance({ uid }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Save status: 'idle' | 'saving' | 'saved' | 'error' | 'offline'
  const [saveStatus, setSaveStatus] = useState('idle');
  const inflightRef = useRef(0);
  const savedTimer = useRef(null);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Track online/offline
  useEffect(() => {
    const goOn = () => { setOnline(true); setSaveStatus(s => s === 'offline' ? 'idle' : s); };
    const goOff = () => { setOnline(false); setSaveStatus('offline'); };
    window.addEventListener('online', goOn);
    window.addEventListener('offline', goOff);
    return () => {
      window.removeEventListener('online', goOn);
      window.removeEventListener('offline', goOff);
    };
  }, []);

  // Wraps a Firestore op with save-status tracking.
  const withSaveStatus = useCallback(async (fn) => {
    inflightRef.current += 1;
    setSaveStatus(online ? 'saving' : 'offline');
    try {
      const result = await fn();
      inflightRef.current -= 1;
      if (inflightRef.current === 0) {
        setSaveStatus('saved');
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }
      return result;
    } catch (err) {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      setSaveStatus('error');
      throw err;
    }
  }, [online]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'complianceItems'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Auto-seed if empty
      if (data.length === 0) {
        const batch = writeBatch(db);
        DEFAULT_ITEMS.forEach(item => {
          const ref = doc(collection(db, 'complianceItems'));
          batch.set(ref, { ...item, createdAt: new Date().toISOString(), history: [] });
        });
        await batch.commit();
        const snap2 = await getDocs(collection(db, 'complianceItems'));
        setItems(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setItems(data);
      }
    } catch (err) {
      console.error('Compliance load failed:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateItem = async (id, patch) => {
    try {
      await withSaveStatus(() => updateDoc(doc(db, 'complianceItems', id), patch));
      setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    }
  };

  const deleteItem = async (id, title) => {
    const confirmText = `Permanently DELETE this compliance item?\n\n"${title}"\n\nThis cannot be undone. If you only want to hide it, use "Archive" instead.`;
    if (!window.confirm(confirmText)) return;
    try {
      await withSaveStatus(() => deleteDoc(doc(db, 'complianceItems', id)));
      setItems(prev => prev.filter(it => it.id !== id));
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Item deleted' }));
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  const addItem = async (data) => {
    try {
      const ref = await withSaveStatus(() => addDoc(collection(db, 'complianceItems'), {
        ...data,
        createdAt: new Date().toISOString(),
        history: [],
      }));
      setItems(prev => [...prev, { id: ref.id, ...data, history: [] }]);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Item added' }));
    } catch (err) { alert('Add failed: ' + err.message); }
  };

  const markComplete = async (item) => {
    const today = new Date().toISOString().slice(0, 10);
    const freq = FREQUENCIES.find(f => f.key === item.frequency);
    const nextDue = freq && freq.months > 0 ? addMonths(today, freq.months) : '';
    const entry = { date: today, by: uid || 'unknown', action: 'completed' };
    const newHistory = [entry, ...(item.history || [])].slice(0, 50);
    await updateItem(item.id, { lastCompleted: today, nextDue, history: newHistory });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Marked complete. Next due: ${nextDue || '—'}` }));
  };

  const snoozeItem = async (item) => {
    const daysStr = window.prompt('Push this due date out by how many days?', '14');
    if (!daysStr) return;
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days <= 0) { alert('Please enter a positive number of days.'); return; }
    const reason = window.prompt('Optional: reason for the delay (e.g., "Vendor reschedule", "Waiting on signed report")', '');
    if (reason === null) return; // user cancelled
    const newDue = addDays(item.nextDue || new Date().toISOString().slice(0, 10), days);
    const entry = { date: new Date().toISOString().slice(0, 10), by: uid || 'unknown', action: 'snoozed', days, reason: reason.trim() || null, oldDue: item.nextDue || null };
    const newHistory = [entry, ...(item.history || [])].slice(0, 50);
    await updateItem(item.id, { nextDue: newDue, history: newHistory });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Snoozed ${days} days → ${newDue}` }));
  };

  // ── FILTERED ITEMS & SUMMARY ──
  const visible = useMemo(() => {
    return items
      .filter(it => showArchived ? true : !it.archived)
      .filter(it => categoryFilter === 'all' || it.category === categoryFilter)
      .filter(it => {
        if (statusFilter === 'all') return true;
        return complianceStatus(it.nextDue) === statusFilter;
      })
      .sort((a, b) => {
        if (!a.nextDue && !b.nextDue) return a.title.localeCompare(b.title);
        if (!a.nextDue) return 1;
        if (!b.nextDue) return -1;
        return a.nextDue.localeCompare(b.nextDue);
      });
  }, [items, categoryFilter, statusFilter, showArchived]);

  const summary = useMemo(() => {
    const active = items.filter(it => !it.archived);
    const counts = { overdue: 0, red: 0, orange: 0, yellow: 0, current: 0, none: 0 };
    let totalCost = 0;
    active.forEach(it => {
      counts[complianceStatus(it.nextDue)]++;
      const c = Number(it.cost);
      if (!isNaN(c) && c > 0) totalCost += c;
    });
    return { counts, total: active.length, totalCost };
  }, [items]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading compliance items…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Compliance
          <SaveStatusPill status={saveStatus} />
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => printComplianceReport(items)}>🖨️ Print Report</button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(v => !v)}>
            {showAddForm ? 'Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 8 }}>
        {['overdue', 'red', 'orange', 'yellow', 'current', 'none'].map(key => {
          const meta = STATUS_META[key];
          const count = summary.counts[key];
          const active = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(active ? 'all' : key)}
              style={{
                padding: '10px 12px', border: `2px solid ${active ? meta.bg : '#E5E7EB'}`,
                borderRadius: 8, background: active ? meta.bg : '#FFFFFF', color: active ? '#FFF' : '#111827',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{meta.dot} {meta.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{count}</div>
            </button>
          );
        })}
      </div>

      {summary.totalCost > 0 && (
        <div style={{ marginBottom: 16, fontSize: 12, color: '#6B7280' }}>
          Estimated annual compliance cost (sum of all items with cost entered): <strong style={{ color: '#1B3A5C' }}>{fmtUSD(summary.totalCost)}</strong>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, marginRight: 4 }}>Category:</span>
        <button
          onClick={() => setCategoryFilter('all')}
          className={`sub-nav-btn ${categoryFilter === 'all' ? 'active' : ''}`}
          style={{ fontSize: 12 }}
        >All</button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategoryFilter(c.key)}
            className={`sub-nav-btn ${categoryFilter === c.key ? 'active' : ''}`}
            style={{ fontSize: 12 }}
          >{c.label}</button>
        ))}
        <label style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddItemForm
          onAdd={async (data) => { await addItem(data); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Item list */}
      {visible.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 8 }}>
          No items match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(item => (
            <ComplianceRow
              key={item.id}
              item={item}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onDelete={() => deleteItem(item.id, item.title)}
              onComplete={() => markComplete(item)}
              onSnooze={() => snoozeItem(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── SAVE STATUS PILL ──
function SaveStatusPill({ status }) {
  const meta = {
    idle:    { text: 'All changes saved',   bg: '#F3F4F6', color: '#4B5563', icon: '✓' },
    saving:  { text: 'Saving…',             bg: '#FEF3C7', color: '#92400E', icon: '⟳' },
    saved:   { text: 'Saved',               bg: '#DCFCE7', color: '#166534', icon: '✓' },
    error:   { text: 'Save failed',         bg: '#FEE2E2', color: '#991B1B', icon: '⚠' },
    offline: { text: 'Offline — will sync', bg: '#FEE2E2', color: '#991B1B', icon: '⚠' },
  }[status] || { text: '', bg: '#F3F4F6', color: '#4B5563', icon: '' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
      background: meta.bg, color: meta.color, display: 'inline-flex', alignItems: 'center', gap: 4,
    }} title="The Compliance tab auto-saves every change to the cloud database. No manual save needed.">
      <span>{meta.icon}</span>{meta.text}
    </span>
  );
}

// ── ADD ITEM FORM ──
function AddItemForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('health_safety');
  const [frequency, setFrequency] = useState('annual');
  const [responsible, setResponsible] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [instructions, setInstructions] = useState('');
  const [cost, setCost] = useState('');

  const submit = () => {
    if (!title.trim()) { alert('Title required'); return; }
    onAdd({
      title: title.trim(), category, frequency,
      responsible: responsible.trim(), nextDue,
      externalLink: externalLink.trim(),
      instructions: instructions.trim(),
      cost: cost === '' ? null : Number(cost),
    });
  };

  return (
    <div style={{ padding: 16, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Title *</label>
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Annual Roof Inspection" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Category</label>
          <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Frequency</label>
          <select className="form-input" value={frequency} onChange={e => setFrequency(e.target.value)}>
            {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Responsible person</label>
          <input className="form-input" value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="e.g., Headmaster" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Next due date</label>
          <input type="date" className="form-input" value={nextDue} onChange={e => setNextDue(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Annual cost ($, optional)</label>
          <input type="number" min="0" className="form-input" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g., 61" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>External portal (optional)</label>
          <input className="form-input" value={externalLink} onChange={e => setExternalLink(e.target.value)} placeholder="https://..." />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Instructions / How-to (optional)</label>
          <textarea className="form-input" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Notes on how to complete this — login info, due date specifics, etc." />
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={submit}>Add</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── SINGLE ROW / CARD ──
function ComplianceRow({ item, onUpdate, onDelete, onComplete, onSnooze }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.notes || '');
  const [instructions, setInstructions] = useState(item.instructions || '');
  const cat = CATEGORIES.find(c => c.key === item.category) || CATEGORIES[0];
  const freq = FREQUENCIES.find(f => f.key === item.frequency) || FREQUENCIES[2];
  const status = complianceStatus(item.nextDue);
  const meta = STATUS_META[status];
  const driveLinks = getDriveLinks(item);

  const addDriveLink = () => {
    const url = window.prompt('Paste the Google Drive share link for this report / evidence:');
    if (!url || !url.trim()) return;
    const label = window.prompt('Optional: short label (e.g., "2026 Inspection", "FY24 990")', `${new Date().getFullYear()} report`);
    const newLink = { url: url.trim(), label: (label || '').trim() || 'Report', addedAt: new Date().toISOString().slice(0, 10) };
    const newLinks = [newLink, ...driveLinks];
    onUpdate({ driveLinks: newLinks, driveLink: newLink.url }); // keep driveLink for backwards compat
  };

  const removeDriveLink = (idx) => {
    if (!window.confirm('Remove this Drive link from the archive?')) return;
    const newLinks = driveLinks.filter((_, i) => i !== idx);
    onUpdate({ driveLinks: newLinks, driveLink: newLinks[0]?.url || '' });
  };

  const saveNotes = () => {
    if (notes !== (item.notes || '')) onUpdate({ notes });
  };

  const saveInstructions = () => {
    if (instructions !== (item.instructions || '')) onUpdate({ instructions });
  };

  return (
    <div style={{
      border: `1px solid #E5E7EB`, borderLeft: `4px solid ${meta.bg}`,
      borderRadius: 8, background: '#FFFFFF', padding: '10px 14px',
      opacity: item.archived ? 0.6 : 1,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1B3A5C' }}>{item.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.label}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#4B5563', fontWeight: 600 }}>{freq.label}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.dot} {meta.label}</span>
            {driveLinks.length > 0 && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#EEF2FF', color: '#3730A3', fontWeight: 600 }}>📁 {driveLinks.length} report{driveLinks.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'right' }}>
          <div>Next due: <strong style={{ color: '#111827' }}>{fmtDate(item.nextDue)}</strong></div>
          <div>Last done: {fmtDate(item.lastCompleted)}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Hide' : 'Details'}
          </button>
          <button
            onClick={onDelete}
            title="Delete this compliance item permanently"
            style={{
              padding: '4px 10px', fontSize: 16, lineHeight: 1, fontWeight: 700,
              background: '#FFFFFF', color: '#DC2626',
              border: '1px solid #FCA5A5', borderRadius: 6, cursor: 'pointer',
            }}
            aria-label="Delete item"
          >×</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Next due</label>
            <input type="date" className="form-input" value={item.nextDue || ''} onChange={e => onUpdate({ nextDue: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Last completed</label>
            <input type="date" className="form-input" value={item.lastCompleted || ''} onChange={e => onUpdate({ lastCompleted: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Responsible person</label>
            <input className="form-input" value={item.responsible || ''} onChange={e => onUpdate({ responsible: e.target.value })} placeholder="Name / role" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Frequency</label>
            <select className="form-input" value={item.frequency || 'annual'} onChange={e => onUpdate({ frequency: e.target.value })}>
              {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Annual cost ($)</label>
            <input type="number" min="0" className="form-input" value={item.cost ?? ''} onChange={e => onUpdate({ cost: e.target.value === '' ? null : Number(e.target.value) })} placeholder="optional" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>External portal</label>
            <input className="form-input" value={item.externalLink || ''} onChange={e => onUpdate({ externalLink: e.target.value })} placeholder="https://..." />
          </div>

          {/* Instructions */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Instructions / How-to</label>
            <textarea
              className="form-input" rows={3}
              value={instructions} onChange={e => setInstructions(e.target.value)} onBlur={saveInstructions}
              placeholder="Notes on how to complete this — login info, due date specifics, contact info, etc."
            />
          </div>

          {/* Notes */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Notes (current status)</label>
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Add any current-status notes…" />
          </div>

          {/* Drive links — multi-year archive */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>📁 Reports / Evidence (Google Drive)</label>
            {driveLinks.length === 0 && (
              <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4, marginBottom: 6 }}>No reports linked yet.</div>
            )}
            {driveLinks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, marginBottom: 6 }}>
                {driveLinks.map((link, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#F9FAFB', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D4ED8', flex: 1, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📁 {link.label || 'Report'}
                    </a>
                    {link.addedAt && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{link.addedAt}</span>}
                    <button onClick={() => removeDriveLink(idx)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-sm btn-secondary" onClick={addDriveLink}>+ Link Drive document</button>
            {item.externalLink && (
              <a href={item.externalLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ textDecoration: 'none', marginLeft: 8 }}>
                🔗 Open external portal
              </a>
            )}
          </div>

          {/* History */}
          {item.history && item.history.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>Activity history</div>
              <div style={{ fontSize: 12, color: '#4B5563' }}>
                {item.history.slice(0, 10).map((h, i) => (
                  <div key={i} style={{ marginBottom: 2 }}>
                    • {fmtDate(h.date)} — {h.action === 'snoozed' ? `Snoozed ${h.days} days${h.reason ? ` (${h.reason})` : ''}` : 'Marked complete'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={onComplete}>✓ Mark Complete (today)</button>
            <button className="btn btn-sm btn-secondary" onClick={onSnooze}>⏰ Snooze…</button>
            <button className="btn btn-sm btn-secondary" onClick={() => onUpdate({ archived: !item.archived })}>
              {item.archived ? 'Restore from archive' : 'Archive (not applicable)'}
            </button>
            <button
              onClick={onDelete}
              style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 6, cursor: 'pointer' }}
            >🗑 Delete permanently</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PRINT REPORT ──
// Opens a clean, print-friendly summary in a new window.
function printComplianceReport(items) {
  const active = items.filter(it => !it.archived);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Group by category
  const byCategory = {};
  CATEGORIES.forEach(c => { byCategory[c.key] = []; });
  active.forEach(it => {
    if (byCategory[it.category]) byCategory[it.category].push(it);
    else { byCategory[it.category] = [it]; }
  });

  const counts = { overdue: 0, red: 0, orange: 0, yellow: 0, current: 0, none: 0 };
  let totalCost = 0;
  active.forEach(it => {
    counts[complianceStatus(it.nextDue)]++;
    const c = Number(it.cost);
    if (!isNaN(c) && c > 0) totalCost += c;
  });

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));

  const rowsHtml = (list) => list
    .sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'))
    .map(it => {
      const st = complianceStatus(it.nextDue);
      const meta = STATUS_META[st];
      return `<tr>
        <td>${escapeHtml(it.title)}</td>
        <td><span class="pill" style="background:${meta.bg};color:${meta.color}">${meta.label}</span></td>
        <td>${fmtDate(it.nextDue)}</td>
        <td>${fmtDate(it.lastCompleted)}</td>
        <td>${escapeHtml(it.responsible || '—')}</td>
        <td>${it.cost ? fmtUSD(it.cost) : '—'}</td>
      </tr>`;
    }).join('');

  const sectionsHtml = CATEGORIES.map(c => {
    const list = byCategory[c.key] || [];
    if (list.length === 0) return '';
    return `<h2 style="border-bottom:2px solid ${c.color};color:${c.color};padding-bottom:4px;margin-top:24px">${c.label} (${list.length})</h2>
    <table>
      <thead><tr><th>Item</th><th>Status</th><th>Next Due</th><th>Last Done</th><th>Responsible</th><th>Cost</th></tr></thead>
      <tbody>${rowsHtml(list)}</tbody>
    </table>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Compliance Status Report — ${today}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111827; }
  h1 { color: #1B3A5C; margin: 0 0 4px; }
  .subtitle { color: #6B7280; margin-bottom: 20px; font-size: 13px; }
  .summary { display:flex; flex-wrap:wrap; gap:8px; margin: 12px 0 24px; }
  .summary-box { padding: 8px 12px; border-radius: 6px; border:1px solid #E5E7EB; font-size: 12px; }
  .summary-box strong { display:block; font-size:18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
  th { background: #F9FAFB; font-weight: 600; color: #374151; }
  .pill { display:inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style></head>
<body>
  <button class="no-print" onclick="window.print()" style="float:right;padding:6px 14px;background:#1B3A5C;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">🖨️ Print</button>
  <h1>Compliance Status Report</h1>
  <div class="subtitle">Chesterton Academy of Pensacola — Generated ${today}</div>
  <div class="summary">
    <div class="summary-box" style="background:#FEE2E2"><strong>${counts.overdue}</strong>Overdue</div>
    <div class="summary-box" style="background:#FEE2E2"><strong>${counts.red}</strong>≤30 days</div>
    <div class="summary-box" style="background:#FFEDD5"><strong>${counts.orange}</strong>≤60 days</div>
    <div class="summary-box" style="background:#FEF3C7"><strong>${counts.yellow}</strong>≤90 days</div>
    <div class="summary-box" style="background:#DCFCE7"><strong>${counts.current}</strong>Current</div>
    <div class="summary-box"><strong>${counts.none}</strong>No date</div>
    <div class="summary-box"><strong>${active.length}</strong>Total tracked</div>
    ${totalCost > 0 ? `<div class="summary-box"><strong>${fmtUSD(totalCost)}</strong>Annual cost</div>` : ''}
  </div>
  ${sectionsHtml}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Popup blocked — please allow popups to print the report.'); return; }
  w.document.write(html);
  w.document.close();
}
