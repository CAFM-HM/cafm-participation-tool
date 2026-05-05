import React, { useState, useMemo } from 'react';
import { useSchedule, usePTOAllotments, usePTORequests } from '../hooks/useFirestore';
import { computeBalances } from './TimeOff';

const TYPES = [
  { key: 'sick',        label: 'Sick',        icon: '\u{1F912}' },
  { key: 'vacation',    label: 'Vacation',    icon: '\u{1F3D6}' },
  { key: 'bereavement', label: 'Bereavement', icon: '\u{1F54A}' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.key, t.label]));
const STATUS_BADGE = {
  pending:  { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' },
  approved: { bg: '#DCFCE7', fg: '#065F46', label: 'Approved' },
  denied:   { bg: '#FEE2E2', fg: '#991B1B', label: 'Denied' },
};

// Default allotment templates by contract type — admin can override per row.
const TEMPLATES = {
  '10-month': { sick: 5,  vacation: 0,  bereavement: 3 },
  '11-month': { sick: 6,  vacation: 5,  bereavement: 3 },
  '12-month': { sick: 8,  vacation: 10, bereavement: 3 },
};

function countWeekdays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PTOAdmin({ uid }) {
  const { published, config } = useSchedule();
  const { allotments, loading: aLoading, setAllotment } = usePTOAllotments();
  const { requests, loading: rLoading, submitRequest, decideRequest, deleteRequest } = usePTORequests();

  // Use the published teachers list if available, else fall back to draft.
  const teachers = (published?.teachers || config?.teachers || []);

  const allotmentByTeacher = useMemo(() => {
    const map = {};
    allotments.forEach(a => { map[a.id] = a; });
    return map;
  }, [allotments]);

  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const decidedRequests = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);

  // ── Allotment editing state (per teacher row, transient before save) ──
  const [edits, setEdits] = useState({}); // teacherId → { sick, vacation, bereavement, contractType }

  const beginEdit = (teacherId) => {
    if (edits[teacherId]) return;
    const a = allotmentByTeacher[teacherId];
    setEdits(prev => ({
      ...prev,
      [teacherId]: {
        sick:        a?.sick ?? 0,
        vacation:    a?.vacation ?? 0,
        bereavement: a?.bereavement ?? 0,
        contractType: a?.contractType || '',
      }
    }));
  };

  const updateEdit = (teacherId, field, value) => {
    setEdits(prev => ({ ...prev, [teacherId]: { ...prev[teacherId], [field]: value } }));
  };

  const applyTemplate = (teacherId, templateKey) => {
    const t = TEMPLATES[templateKey];
    if (!t) return;
    setEdits(prev => ({
      ...prev,
      [teacherId]: { ...prev[teacherId], ...t, contractType: templateKey },
    }));
  };

  const saveAllotment = async (teacher) => {
    const e = edits[teacher.id];
    if (!e) return;
    await setAllotment(teacher.id, {
      teacherId: teacher.id,
      displayName: teacher.name,
      contractType: e.contractType || '',
      sick:        Number(e.sick) || 0,
      vacation:    Number(e.vacation) || 0,
      bereavement: Number(e.bereavement) || 0,
    });
    setEdits(prev => { const { [teacher.id]: _, ...rest } = prev; return rest; });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Allotment saved for ${teacher.name}` }));
  };

  const cancelEdit = (teacherId) => {
    setEdits(prev => { const { [teacherId]: _, ...rest } = prev; return rest; });
  };

  // ── Decide a request ──
  const handleApprove = async (req) => {
    let note = '';
    await decideRequest(req.id, 'approved', uid, note || null);
    window.dispatchEvent(new CustomEvent('toast', { detail: `Approved ${req.displayName} – ${TYPE_LABEL[req.type]} ${req.days}d` }));
  };

  const handleDeny = async (req) => {
    const note = window.prompt(`Deny ${req.displayName}'s request for ${req.days} day(s) of ${TYPE_LABEL[req.type]}. Reason (optional):`, '');
    if (note === null) return; // cancelled
    await decideRequest(req.id, 'denied', uid, note || null);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Request denied' }));
  };

  const handleDelete = async (req) => {
    if (!window.confirm(`Permanently delete this ${req.status} request? This cannot be undone.`)) return;
    await deleteRequest(req.id);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Request deleted' }));
  };

  // ── Record on behalf form ──
  const [obTeacher, setObTeacher] = useState('');
  const [obType, setObType] = useState('sick');
  const [obStart, setObStart] = useState('');
  const [obEnd, setObEnd] = useState('');
  const [obDays, setObDays] = useState(0);
  const [obDaysOverride, setObDaysOverride] = useState(false);
  const [obReason, setObReason] = useState('');
  const [obSubmitting, setObSubmitting] = useState(false);

  React.useEffect(() => {
    if (!obDaysOverride) setObDays(countWeekdays(obStart, obEnd));
  }, [obStart, obEnd, obDaysOverride]);

  const recordOnBehalf = async (autoApprove) => {
    if (!obTeacher || !obStart || !obEnd) {
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Pick employee, start, and end dates' }));
      return;
    }
    if (Number(obDays) <= 0) {
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Days must be greater than 0' }));
      return;
    }
    const teacher = teachers.find(t => t.id === obTeacher);
    if (!teacher) return;

    setObSubmitting(true);
    try {
      const payload = {
        teacherId: teacher.id,
        displayName: teacher.name,
        type: obType,
        startDate: obStart,
        endDate: obEnd,
        days: Number(obDays),
        reason: obReason.trim(),
        requestedBy: uid,
        submittedByAdmin: true,
        status: autoApprove ? 'approved' : 'pending',
      };
      const id = await submitRequest(payload);
      if (autoApprove) {
        // submitRequest already wrote 'approved' status; make sure decidedAt/decidedBy fields are set too.
        await decideRequest(id, 'approved', uid, 'Recorded by admin on behalf of employee');
      }
      window.dispatchEvent(new CustomEvent('toast', { detail: autoApprove ? `Recorded & approved for ${teacher.name}` : `Logged as pending for ${teacher.name}` }));
      setObTeacher(''); setObType('sick'); setObStart(''); setObEnd(''); setObDays(0); setObDaysOverride(false); setObReason('');
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Failed: ' + err.message }));
    }
    setObSubmitting(false);
  };

  if (aLoading || rLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading PTO…</div>;
  }

  if (teachers.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="empty-state-text">
          No teachers found. Add teachers in <strong>Schedule Builder → Teachers</strong> first, then come back here to set their PTO allotments.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">PTO Administration</h2>

      {/* ── PENDING REQUESTS ── */}
      <div className="home-card" style={{ marginBottom: 24 }}>
        <div className="home-card-header">
          <h3>Pending requests {pendingRequests.length > 0 && <span style={{ marginLeft: 6, fontSize: 12, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', borderRadius: 10 }}>{pendingRequests.length}</span>}</h3>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">No pending requests.</div>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Employee</th><th>Type</th><th>Dates</th><th style={{ textAlign: 'right' }}>Days</th>
                <th>Reason</th><th>Submitted</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map(r => {
                const teacher = teachers.find(t => t.id === r.teacherId);
                const allotment = allotmentByTeacher[r.teacherId];
                const balances = computeBalances(allotment, requests, r.teacherId);
                const wouldOverdraw = balances.remaining[r.type] - r.days < 0;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.displayName || teacher?.name}</td>
                    <td>{TYPES.find(t => t.key === r.type)?.icon} {TYPE_LABEL[r.type] || r.type}</td>
                    <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {r.days}
                      {wouldOverdraw && <div style={{ fontSize: 10, color: '#DC2626' }}>over balance</div>}
                    </td>
                    <td style={{ color: '#6B7280', fontSize: 12, maxWidth: 240 }}>{r.reason || '—'}</td>
                    <td style={{ fontSize: 11, color: '#9CA3AF' }}>{r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : ''}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" style={{ background: '#16A34A', color: '#FFFFFF', marginRight: 4 }} onClick={() => handleApprove(r)}>Approve</button>
                      <button className="btn btn-sm" style={{ background: '#DC2626', color: '#FFFFFF', marginRight: 4 }} onClick={() => handleDeny(r)}>Deny</button>
                      <button className="btn btn-sm" style={{ color: '#6B7280', background: 'none' }} onClick={() => handleDelete(r)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── ALLOTMENTS ── */}
      <div className="home-card" style={{ marginBottom: 24 }}>
        <div className="home-card-header">
          <h3>Set allotments by employee</h3>
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 0 }}>
          Pick a contract template to auto-fill, or set the three numbers directly.
          Allotments persist year over year — adjust at the start of each contract year.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Contract</th>
                <th style={{ textAlign: 'right' }}>Sick</th>
                <th style={{ textAlign: 'right' }}>Vacation</th>
                <th style={{ textAlign: 'right' }}>Bereavement</th>
                <th style={{ textAlign: 'right' }}>Used (S / V / B)</th>
                <th style={{ textAlign: 'right' }}>Remaining (S / V / B)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => {
                const a = allotmentByTeacher[t.id];
                const editing = !!edits[t.id];
                const e = edits[t.id];
                const balances = computeBalances(a, requests, t.id);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td>
                      {editing ? (
                        <select className="form-input" value={e.contractType || ''}
                          onChange={ev => { updateEdit(t.id, 'contractType', ev.target.value); if (ev.target.value) applyTemplate(t.id, ev.target.value); }}
                          style={{ fontSize: 12, padding: '2px 6px' }}>
                          <option value="">—</option>
                          <option value="10-month">10-month</option>
                          <option value="11-month">11-month</option>
                          <option value="12-month">12-month</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{a?.contractType || '—'}</span>
                      )}
                    </td>
                    {['sick', 'vacation', 'bereavement'].map(field => (
                      <td key={field} style={{ textAlign: 'right' }}>
                        {editing ? (
                          <input type="number" min="0" step="0.5" className="form-input"
                            value={e[field]}
                            onChange={ev => updateEdit(t.id, field, ev.target.value)}
                            style={{ width: 70, fontSize: 12, padding: '2px 6px', textAlign: 'right' }} />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{a?.[field] ?? '—'}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
                      {balances.used.sick} / {balances.used.vacation} / {balances.used.bereavement}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                      {balances.remaining.sick} / {balances.remaining.vacation} / {balances.remaining.bereavement}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => saveAllotment(t)} style={{ marginRight: 4 }}>Save</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => cancelEdit(t.id)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => beginEdit(t.id)}>{a ? 'Edit' : 'Allot'}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── RECORD ON BEHALF ── */}
      <div className="home-card" style={{ marginBottom: 24 }}>
        <div className="home-card-header"><h3>Record time off on behalf of an employee</h3></div>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 0 }}>
          Use this to log time off for an employee who can't submit themselves (e.g., a same-day call-in).
          You can record it as already approved (deducts from their balance) or save as pending.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Employee</label>
            <select className="form-input" value={obTeacher} onChange={ev => setObTeacher(ev.target.value)}>
              <option value="">— Pick employee —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Type</label>
            <select className="form-input" value={obType} onChange={ev => setObType(ev.target.value)}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Start</label>
            <input type="date" className="form-input" value={obStart} onChange={ev => setObStart(ev.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>End</label>
            <input type="date" className="form-input" value={obEnd} onChange={ev => setObEnd(ev.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Days</label>
            <input type="number" min="0" step="0.5" className="form-input" value={obDays}
              onChange={ev => { setObDaysOverride(true); setObDays(ev.target.value); }} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Reason / note</label>
          <textarea className="form-input" rows={2} value={obReason} onChange={ev => setObReason(ev.target.value)} placeholder="e.g., Called in sick this morning…" />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => recordOnBehalf(true)} disabled={obSubmitting}>
            {obSubmitting ? 'Saving…' : 'Record & approve'}
          </button>
          <button className="btn btn-secondary" onClick={() => recordOnBehalf(false)} disabled={obSubmitting}>
            Save as pending
          </button>
        </div>
      </div>

      {/* ── HISTORY ── */}
      <div className="home-card">
        <div className="home-card-header"><h3>All decided requests</h3></div>
        {decidedRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">No approved or denied requests yet.</div>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Employee</th><th>Type</th><th>Dates</th><th style={{ textAlign: 'right' }}>Days</th>
                <th>Reason</th><th>Status</th><th>Decided</th><th></th>
              </tr>
            </thead>
            <tbody>
              {decidedRequests.map(r => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                    <td>{TYPES.find(t => t.key === r.type)?.icon} {TYPE_LABEL[r.type] || r.type}</td>
                    <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.days}</td>
                    <td style={{ color: '#6B7280', fontSize: 12, maxWidth: 240 }}>
                      {r.reason || '—'}
                      {r.submittedByAdmin && <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>(recorded by admin)</div>}
                    </td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.fg }}>
                        {badge.label}
                      </span>
                      {r.decisionNote && <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>"{r.decisionNote}"</div>}
                    </td>
                    <td style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {r.decidedAt ? new Date(r.decidedAt).toLocaleDateString() : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm" style={{ color: '#6B7280', background: 'none' }} onClick={() => handleDelete(r)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
