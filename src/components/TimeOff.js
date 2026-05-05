import React, { useState, useMemo } from 'react';
import { useSchedule, usePTOAllotments, usePTORequests } from '../hooks/useFirestore';
import { findMyTeacher } from './ScheduleBuilder';

const TYPES = [
  { key: 'sick',        label: 'Sick',        icon: '\u{1F912}' },     // 🤒
  { key: 'vacation',    label: 'Vacation',    icon: '\u{1F3D6}' },     // 🏖
  { key: 'bereavement', label: 'Bereavement', icon: '\u{1F54A}' },     // 🕊
];
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.key, t.label]));
const STATUS_BADGE = {
  pending:  { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' },
  approved: { bg: '#DCFCE7', fg: '#065F46', label: 'Approved' },
  denied:   { bg: '#FEE2E2', fg: '#991B1B', label: 'Denied' },
};

// Count weekdays (Mon-Fri) inclusive between two YYYY-MM-DD dates.
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

// Compute PTO balances {sick, vacation, bereavement} for a teacher,
// given their allotment record and the list of approved requests.
// If the allotment has startDate/endDate set, only approved requests whose
// startDate falls within that window count against the balance — letting
// the bank reset at the end of each contract year.
export function computeBalances(allotment, requests, teacherId) {
  const total = {
    sick:        allotment?.sick ?? 0,
    vacation:    allotment?.vacation ?? 0,
    bereavement: allotment?.bereavement ?? 0,
  };
  const used = { sick: 0, vacation: 0, bereavement: 0 };
  const periodStart = allotment?.startDate || null;
  const periodEnd = allotment?.endDate || null;
  (requests || []).forEach(r => {
    if (r.teacherId !== teacherId) return;
    if (r.status !== 'approved') return;
    if (used[r.type] === undefined) return;
    const reqStart = r.startDate || '';
    if (periodStart && reqStart < periodStart) return;
    if (periodEnd && reqStart > periodEnd) return;
    used[r.type] += Number(r.days || 0);
  });
  return {
    total, used,
    period: { start: periodStart, end: periodEnd },
    remaining: {
      sick:        total.sick        - used.sick,
      vacation:    total.vacation    - used.vacation,
      bereavement: total.bereavement - used.bereavement,
    },
  };
}

// Default contract period: Aug 1 of "current school year" through Jul 31 next year.
// "Current school year" = if today is before Aug 1, use prev year; otherwise this year.
export function defaultContractPeriod(contractType) {
  const today = new Date();
  const yr = today.getFullYear();
  const startYear = today.getMonth() >= 7 ? yr : yr - 1;  // month is 0-indexed (7 = Aug)
  const start = `${startYear}-08-01`;
  const end = (() => {
    if (contractType === '10-month') return `${startYear + 1}-05-31`;
    if (contractType === '11-month') return `${startYear + 1}-06-30`;
    return `${startYear + 1}-07-31`;  // 12-month or unspecified
  })();
  return { startDate: start, endDate: end };
}

export function fmtPeriod(start, end) {
  if (!start || !end) return '';
  const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function TimeOff({ uid, displayName }) {
  const { published } = useSchedule();
  const { allotments, loading: allotsLoading } = usePTOAllotments();
  const { requests, loading: reqsLoading, submitRequest, deleteRequest } = usePTORequests();

  const teachers = published?.teachers || [];
  const myTeacher = useMemo(() => findMyTeacher(displayName, teachers), [displayName, teachers]);
  const myAllotment = useMemo(
    () => myTeacher ? allotments.find(a => a.id === myTeacher.id) : null,
    [allotments, myTeacher]
  );
  const myRequests = useMemo(
    () => myTeacher ? requests.filter(r => r.teacherId === myTeacher.id) : [],
    [requests, myTeacher]
  );

  const balances = useMemo(
    () => computeBalances(myAllotment, requests, myTeacher?.id),
    [myAllotment, requests, myTeacher]
  );

  // Form state
  const [type, setType] = useState('sick');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState(0);
  const [daysOverride, setDaysOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-compute days when dates change (unless user typed an override)
  React.useEffect(() => {
    if (!daysOverride) {
      setDays(countWeekdays(startDate, endDate));
    }
  }, [startDate, endDate, daysOverride]);

  const loading = allotsLoading || reqsLoading;

  const reset = () => {
    setType('sick'); setStartDate(''); setEndDate(''); setDays(0);
    setDaysOverride(false); setReason('');
  };

  const handleSubmit = async () => {
    if (!myTeacher) return;
    if (!startDate || !endDate) {
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Pick a start and end date' }));
      return;
    }
    if (Number(days) <= 0) {
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Days must be greater than 0' }));
      return;
    }
    setSubmitting(true);
    try {
      await submitRequest({
        teacherId: myTeacher.id,
        displayName: myTeacher.name,
        type,
        startDate, endDate,
        days: Number(days),
        reason: reason.trim(),
        requestedBy: uid,
        submittedByAdmin: false,
      });
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Request submitted' }));
      reset();
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Submit failed: ' + err.message }));
    }
    setSubmitting(false);
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Withdraw this request?')) return;
    await deleteRequest(id);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Request withdrawn' }));
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading time off…</div>;
  }

  if (!published) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="empty-state-text">
          The schedule hasn't been published yet, so we can't match you to a teacher record. Ask your admin to publish the schedule.
        </div>
      </div>
    );
  }

  if (!myTeacher) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="empty-state-text">
          We couldn't match your account ({displayName}) to a teacher in the published schedule.
          Ask your admin to add or rename a teacher in <strong>Schedule Builder → Teachers</strong> so the name matches your Google account.
        </div>
      </div>
    );
  }

  if (!myAllotment) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="empty-state-text">
          You don't have a PTO allotment set yet. Ask your admin to allot your time on the <strong>PTO Admin</strong> page.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Time Off</h2>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Hello {myTeacher.name}. Submit a request below; your admin will review it. Approved time deducts from your balance.
      </p>

      {(myAllotment.startDate || myAllotment.endDate) && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#1E40AF' }}>
          <strong>Current contract year:</strong> {fmtPeriod(myAllotment.startDate, myAllotment.endDate)}
          {myAllotment.contractType && <span style={{ marginLeft: 8, color: '#6B7280' }}>({myAllotment.contractType})</span>}
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontStyle: 'italic' }}>
            Balances reset at the end of the contract year. Unused days do not carry over.
          </div>
        </div>
      )}

      {/* ── Balances ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {TYPES.map(t => {
          const remaining = balances.remaining[t.key];
          const total = balances.total[t.key];
          const used = balances.used[t.key];
          const lowBalance = total > 0 && remaining <= 1;
          const overdrawn = remaining < 0;
          return (
            <div key={t.key} className="home-card" style={{ padding: 16, background: overdrawn ? '#FEF2F2' : lowBalance ? '#FFFBEB' : '#FFFFFF' }}>
              <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>
                <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: overdrawn ? '#DC2626' : '#1B3A5C', fontFamily: 'var(--font-display)' }}>
                {remaining}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                days remaining ({used} used / {total} allotted)
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Submit Request Form ── */}
      <div className="home-card" style={{ marginBottom: 24 }}>
        <div className="home-card-header"><h3>Submit a request</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Type</label>
            <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Start date</label>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>End date</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
              Days <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(weekdays auto-counted)</span>
            </label>
            <input type="number" min="0" step="0.5" className="form-input" value={days}
              onChange={e => { setDaysOverride(true); setDays(e.target.value); }} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Reason (optional)</label>
          <textarea className="form-input" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief context for your admin (optional)…" />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={reset}>Reset</button>
          {Number(days) > 0 && balances.remaining[type] - Number(days) < 0 && (
            <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
              ⚠ This would put you {Math.abs(balances.remaining[type] - Number(days))} day(s) over your {TYPE_LABEL[type]} balance.
            </span>
          )}
        </div>
      </div>

      {/* ── My Requests ── */}
      <div className="home-card">
        <div className="home-card-header"><h3>My requests</h3></div>
        {myRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{'\u{1F4C5}'}</div>
            <div className="empty-state-text">No requests yet — submit your first above.</div>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Type</th><th>Dates</th><th style={{ textAlign: 'right' }}>Days</th>
                <th>Reason</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map(r => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                return (
                  <tr key={r.id}>
                    <td>{TYPES.find(t => t.key === r.type)?.icon} {TYPE_LABEL[r.type] || r.type}</td>
                    <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.days}</td>
                    <td style={{ color: '#6B7280', fontSize: 12 }}>{r.reason || '—'}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.fg }}>
                        {badge.label}
                      </span>
                      {r.decisionNote && <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>"{r.decisionNote}"</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.status === 'pending' && (
                        <button className="btn btn-sm" style={{ color: '#DC2626', background: 'none' }} onClick={() => handleCancel(r.id)}>
                          Withdraw
                        </button>
                      )}
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
