import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
const DEFAULT_ITEMS = [
  // Health & Safety
  { title: 'Annual Fire Marshal Inspection',          category: 'health_safety', frequency: 'annual' },
  { title: 'Monthly Fire Drill',                       category: 'health_safety', frequency: 'monthly' },
  { title: 'Severe Weather / Tornado Drill',           category: 'health_safety', frequency: 'annual' },
  { title: 'Lockdown / Active Threat Drill',           category: 'health_safety', frequency: 'annual' },
  { title: 'AED Battery & Pad Expiration Check',       category: 'health_safety', frequency: 'annual' },
  { title: 'First Aid Kit Audit & Restock',            category: 'health_safety', frequency: 'annual' },
  { title: 'Playground / Facility Safety Walk-through',category: 'health_safety', frequency: 'annual' },

  // SUFS / Scholarship
  { title: 'FL DOE Private School Annual Registration', category: 'scholarship', frequency: 'annual', externalLink: 'https://www.fldoe.org/schools/school-choice/private-schools/' },
  { title: 'Step Up For Students Annual Compliance Survey', category: 'scholarship', frequency: 'annual', externalLink: 'https://www.stepupforstudents.org/schools/' },
  { title: 'SUFS Fee Schedule Submission',              category: 'scholarship', frequency: 'annual' },
  { title: 'Quarterly SUFS Invoice Submission',         category: 'scholarship', frequency: 'quarterly' },
  { title: 'CPA Financial Review / Audit (if required by scholarship $)', category: 'scholarship', frequency: 'annual' },
  { title: 'Norm-Referenced Assessment Administered & Results Uploaded', category: 'scholarship', frequency: 'annual' },
  { title: 'Notice of Enrollment Submission',           category: 'scholarship', frequency: 'annual' },

  // Corporate / Legal
  { title: 'Sunbiz Annual Report (Nonprofit Corp)',     category: 'corporate', frequency: 'annual', externalLink: 'https://dos.fl.gov/sunbiz/' },
  { title: 'IRS Form 990 Filing',                       category: 'corporate', frequency: 'annual', externalLink: 'https://www.irs.gov/charities-non-profits' },
  { title: 'FL Sales Tax Exemption Renewal (DR-5)',     category: 'corporate', frequency: '5year' },
  { title: 'Charitable Solicitation Registration (FDACS)', category: 'corporate', frequency: 'annual', externalLink: 'https://csapp.fdacs.gov/' },
  { title: 'Registered Agent Verification',             category: 'corporate', frequency: 'annual' },

  // Insurance
  { title: 'General Liability Insurance Renewal',       category: 'insurance', frequency: 'annual' },
  { title: 'Property Insurance Renewal',                category: 'insurance', frequency: 'annual' },
  { title: "Workers' Compensation Renewal",             category: 'insurance', frequency: 'annual' },
  { title: 'Directors & Officers (D&O) Insurance Renewal', category: 'insurance', frequency: 'annual' },
  { title: 'Student Accident Coverage',                 category: 'insurance', frequency: 'annual' },

  // HR / Staff
  { title: 'Level 2 Background Screening (All Staff)',  category: 'hr', frequency: '5year' },
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

// Add months to a YYYY-MM-DD string. Returns YYYY-MM-DD.
function addMonths(dateStr, months) {
  if (!dateStr || !months) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── MAIN COMPONENT ──
export default function Compliance({ uid }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

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
      await updateDoc(doc(db, 'complianceItems', id), patch);
      setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this compliance item? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'complianceItems', id));
      setItems(prev => prev.filter(it => it.id !== id));
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Item deleted' }));
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  const addItem = async (data) => {
    try {
      const ref = await addDoc(collection(db, 'complianceItems'), {
        ...data,
        createdAt: new Date().toISOString(),
        history: [],
      });
      setItems(prev => [...prev, { id: ref.id, ...data, history: [] }]);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Item added' }));
    } catch (err) { alert('Add failed: ' + err.message); }
  };

  const markComplete = async (item) => {
    const today = new Date().toISOString().slice(0, 10);
    const freq = FREQUENCIES.find(f => f.key === item.frequency);
    const nextDue = freq && freq.months > 0 ? addMonths(today, freq.months) : '';
    const entry = { date: today, by: uid || 'unknown' };
    const newHistory = [entry, ...(item.history || [])].slice(0, 20);
    await updateItem(item.id, { lastCompleted: today, nextDue, history: newHistory });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Marked complete. Next due: ${nextDue || '—'}` }));
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
        // Sort by nextDue ascending (items without date go last)
        if (!a.nextDue && !b.nextDue) return a.title.localeCompare(b.title);
        if (!a.nextDue) return 1;
        if (!b.nextDue) return -1;
        return a.nextDue.localeCompare(b.nextDue);
      });
  }, [items, categoryFilter, statusFilter, showArchived]);

  const summary = useMemo(() => {
    const active = items.filter(it => !it.archived);
    const counts = { overdue: 0, red: 0, orange: 0, yellow: 0, current: 0, none: 0 };
    active.forEach(it => { counts[complianceStatus(it.nextDue)]++; });
    return { counts, total: active.length };
  }, [items]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading compliance items…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Compliance</h2>
        <button className="btn btn-primary" onClick={() => setShowAddForm(v => !v)}>
          {showAddForm ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
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
              onDelete={() => deleteItem(item.id)}
              onComplete={() => markComplete(item)}
            />
          ))}
        </div>
      )}
    </div>
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

  const submit = () => {
    if (!title.trim()) { alert('Title required'); return; }
    onAdd({
      title: title.trim(), category, frequency,
      responsible: responsible.trim(), nextDue, externalLink: externalLink.trim(),
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
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>External portal (optional)</label>
          <input className="form-input" value={externalLink} onChange={e => setExternalLink(e.target.value)} placeholder="https://..." />
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
function ComplianceRow({ item, onUpdate, onDelete, onComplete }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.notes || '');
  const cat = CATEGORIES.find(c => c.key === item.category) || CATEGORIES[0];
  const freq = FREQUENCIES.find(f => f.key === item.frequency) || FREQUENCIES[2];
  const status = complianceStatus(item.nextDue);
  const meta = STATUS_META[status];

  const promptLink = () => {
    const url = window.prompt(item.driveLink ? 'Update Google Drive link:' : 'Paste the Google Drive share link for the report / evidence:', item.driveLink || '');
    if (url === null) return;
    onUpdate({ driveLink: url.trim() });
  };

  const saveNotes = () => {
    if (notes !== (item.notes || '')) onUpdate({ notes });
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
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'right' }}>
          <div>Next due: <strong style={{ color: '#111827' }}>{fmtDate(item.nextDue)}</strong></div>
          <div>Last done: {fmtDate(item.lastCompleted)}</div>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Hide' : 'Details'}
        </button>
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
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Notes</label>
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Add any notes…" />
          </div>

          {/* Links row */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {item.driveLink ? (
              <>
                <a href={item.driveLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>
                  📁 Open Report / Evidence
                </a>
                <button className="btn btn-sm btn-secondary" onClick={promptLink}>Update link</button>
                <button className="btn btn-sm btn-secondary" onClick={() => onUpdate({ driveLink: '' })}>Remove link</button>
              </>
            ) : (
              <button className="btn btn-sm btn-secondary" onClick={promptLink}>📁 Link Google Drive document</button>
            )}
            {item.externalLink && (
              <a href={item.externalLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>
                🔗 External portal
              </a>
            )}
          </div>

          {/* History */}
          {item.history && item.history.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>Completion history</div>
              <div style={{ fontSize: 12, color: '#4B5563' }}>
                {item.history.slice(0, 5).map((h, i) => (
                  <div key={i}>• {fmtDate(h.date)}</div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={onComplete}>✓ Mark Complete (today)</button>
            <button className="btn btn-sm btn-secondary" onClick={() => onUpdate({ archived: !item.archived })}>
              {item.archived ? 'Restore' : 'Archive (not applicable)'}
            </button>
            <button className="btn btn-sm" style={{ color: '#DC2626', marginLeft: 'auto' }} onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
