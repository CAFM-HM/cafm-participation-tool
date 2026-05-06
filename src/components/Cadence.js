import React, { useState, useMemo } from 'react';
import { useCadenceTasks, useSchedule } from '../hooks/useFirestore';
import { MONTHS, MONTH_TO_DATE, ROLE_OPTIONS, CATEGORY_LABEL, buildSeedTasks } from '../data/cadenceSeed';

const STATUS = {
  pending:  { label: 'Pending',   bg: '#F3F4F6', fg: '#4B5563', border: '#D1D5DB' },
  complete: { label: 'Complete',  bg: '#DCFCE7', fg: '#065F46', border: '#86EFAC' },
  delayed:  { label: 'Delayed',   bg: '#FEF3C7', fg: '#92400E', border: '#FCD34D' },
  na:       { label: 'N/A',       bg: '#F1F5F9', fg: '#64748B', border: '#CBD5E1' },
};
const STATUS_KEYS = ['pending', 'complete', 'delayed', 'na'];

const ROLE_TINT = {
  'HM':         '#1E40AF',
  'DOS':        '#9D174D',
  'DOS-AT':     '#5B21B6',
  'HM-DOS':     '#0369A1',
  'Admin':      '#92400E',
  'Laura':      '#065F46',
  'Yearbook':   '#9A3412',
  'Unassigned': '#6B7280',
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function Cadence({ uid, displayName }) {
  const { tasks, loading, updateTask, addCustomTask, deleteTask, seedDefaults } = useCadenceTasks();
  const { config } = useSchedule();

  // Build assignee options: roles + teacher names from schedule, de-duped
  const assigneeOptions = useMemo(() => {
    const teachers = (config?.teachers || []).map(t => t.name).filter(Boolean);
    const set = new Set([...ROLE_OPTIONS, ...teachers]);
    return Array.from(set);
  }, [config]);

  // Filter state
  const [monthFilter, setMonthFilter] = useState('');     // '' = all
  const [statusFilter, setStatusFilter] = useState('open');// 'open' (pending+delayed) / 'all' / specific
  const [assigneeFilter, setAssigneeFilter] = useState(''); // '' = all
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = all
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Quick stats per month
  const monthStats = useMemo(() => {
    const stats = {};
    MONTHS.forEach(m => {
      stats[m.key] = { total: 0, complete: 0, delayed: 0, na: 0, pending: 0 };
    });
    tasks.forEach(t => {
      const s = stats[t.month];
      if (!s) return;
      s.total++;
      s[t.status] = (s[t.status] || 0) + 1;
    });
    return stats;
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (monthFilter && t.month !== monthFilter) return false;
      if (statusFilter === 'open') {
        if (t.status !== 'pending' && t.status !== 'delayed') return false;
      } else if (statusFilter !== 'all') {
        if (t.status !== statusFilter) return false;
      }
      if (assigneeFilter && t.assignedTo !== assigneeFilter) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, monthFilter, statusFilter, assigneeFilter, categoryFilter, searchQuery]);

  const grouped = useMemo(() => {
    const map = {};
    MONTHS.forEach(m => { map[m.key] = []; });
    filtered.forEach(t => {
      if (!map[t.month]) map[t.month] = [];
      map[t.month].push(t);
    });
    // Sort each month: pending/delayed first, then by category, then title
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      const sOrder = { pending: 0, delayed: 1, complete: 2, na: 3 };
      if (sOrder[a.status] !== sOrder[b.status]) return sOrder[a.status] - sOrder[b.status];
      if ((a.category || '') !== (b.category || '')) return (a.category || '').localeCompare(b.category || '');
      return (a.title || '').localeCompare(b.title || '');
    }));
    return map;
  }, [filtered]);

  const handleStatus = async (task, newStatus, opts = {}) => {
    // Confirm before marking complete (unless explicitly skipped, e.g. via Undo flow)
    if (newStatus === 'complete' && !opts.skipConfirm) {
      if (!window.confirm(`Mark "${task.title}" as complete?`)) return;
    }
    const patch = {
      status: newStatus,
      completedAt: newStatus === 'complete' ? new Date().toISOString() : null,
      completedBy: newStatus === 'complete' ? (uid || null) : null,
    };
    await updateTask(task.id, patch);
    if (newStatus === 'complete') {
      window.dispatchEvent(new CustomEvent('toast', { detail: `Marked complete: ${task.title}` }));
    }
  };

  const handleUndo = async (task) => {
    await updateTask(task.id, { status: 'pending', completedAt: null, completedBy: null });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Undone: ${task.title}` }));
  };

  const handleAssignee = async (task, value) => updateTask(task.id, { assignedTo: value });
  const handleNote     = async (task, value) => updateTask(task.id, { note: value });
  const handleDueDate  = async (task, value) => updateTask(task.id, { dueDate: value });

  const handleSeed = async () => {
    if (!window.confirm('Load the 2026-27 default cadence? This adds any tasks not already present (safe to click twice).')) return;
    setSeeding(true);
    try {
      const added = await seedDefaults(buildSeedTasks());
      window.dispatchEvent(new CustomEvent('toast', { detail: `Loaded ${added} tasks` }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Seed failed: ' + err.message }));
    }
    setSeeding(false);
  };

  // Custom task form
  const [showCustom, setShowCustom] = useState(false);
  const [newTask, setNewTask] = useState({ month: 'jul', title: '', description: '', defaultRole: 'HM', category: 'operational', dueDate: '' });
  const submitCustom = async () => {
    if (!newTask.title.trim()) return;
    await addCustomTask({
      ...newTask,
      assignedTo: newTask.defaultRole,
      recurring: false,
      status: 'pending',
      note: '',
      completedAt: null,
      completedBy: null,
    });
    setNewTask({ month: 'jul', title: '', description: '', defaultRole: 'HM', category: 'operational', dueDate: '' });
    setShowCustom(false);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Task added' }));
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading cadence…</div>;
  }

  // ── EMPTY STATE: prompt to seed ──
  if (tasks.length === 0) {
    return (
      <div>
        <h2 className="section-title">Operational Cadence</h2>
        <div className="home-card" style={{ padding: 32, textAlign: 'center' }}>
          <h3 style={{ marginTop: 0, color: '#1B3A5C' }}>No tasks yet</h3>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>
            Get started by loading the 2026-27 operational cadence — about 200 tasks pre-tagged with the role you wrote in brackets ([HM], [DOS-AT], [Laura], [Yearbook], [Admin]) and slotted into the right month. After that, you can reassign / edit / mark off as the year goes.
          </p>
          <button className="btn btn-gold" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Loading…' : '⚡ Load 2026-27 defaults'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Operational Cadence</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowCustom(v => !v)}>
            {showCustom ? 'Cancel' : '+ Add task'}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={handleSeed} disabled={seeding} title="Adds any default tasks not already loaded">
            {seeding ? 'Loading…' : 'Reload defaults'}
          </button>
        </div>
      </div>

      {/* ── MONTH STRIP VISUALIZATION ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 16 }}>
        {MONTHS.map(m => {
          const s = monthStats[m.key];
          const completePct = s.total > 0 ? s.complete / s.total : 0;
          const delayedPct  = s.total > 0 ? s.delayed  / s.total : 0;
          const naPct       = s.total > 0 ? s.na       / s.total : 0;
          const pendingPct  = s.total > 0 ? s.pending  / s.total : 0;
          const isActive = monthFilter === m.key;
          return (
            <button key={m.key}
              onClick={() => setMonthFilter(isActive ? '' : m.key)}
              title={`${m.label}: ${s.complete} complete, ${s.pending} pending, ${s.delayed} delayed, ${s.na} N/A`}
              style={{
                padding: '8px 4px', border: `2px solid ${isActive ? '#1B3A5C' : '#E5E7EB'}`,
                borderRadius: 6, background: isActive ? '#EFF6FF' : '#FFFFFF',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                transition: 'border-color 120ms',
              }}>
              <div style={{ fontWeight: 700, color: '#1B3A5C', fontSize: 11, textTransform: 'uppercase' }}>
                {m.label.split(' ')[0]}
              </div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>
                {s.complete}/{s.total}
              </div>
              {s.total > 0 ? (
                <div style={{ height: 6, display: 'flex', borderRadius: 3, overflow: 'hidden', background: '#F3F4F6' }}>
                  <div style={{ width: `${completePct * 100}%`, background: '#16A34A' }} />
                  <div style={{ width: `${delayedPct  * 100}%`, background: '#EAB308' }} />
                  <div style={{ width: `${naPct       * 100}%`, background: '#94A3B8' }} />
                  <div style={{ width: `${pendingPct  * 100}%`, background: '#E5E7EB' }} />
                </div>
              ) : (
                <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── ADD CUSTOM TASK ── */}
      {showCustom && (
        <div className="home-card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="home-card-header"><h3>Add a custom task</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <input className="form-input" placeholder="Title" value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })} style={{ gridColumn: '1 / -1' }} />
            <select className="form-input" value={newTask.month} onChange={e => setNewTask({ ...newTask, month: e.target.value })}>
              {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select className="form-input" value={newTask.defaultRole} onChange={e => setNewTask({ ...newTask, defaultRole: e.target.value })}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="form-input" value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" className="form-input" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} />
            <textarea className="form-input" rows={2} placeholder="Description (optional)"
              value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} style={{ gridColumn: '1 / -1' }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={submitCustom}>Add task</button>
          </div>
        </div>
      )}

      {/* ── FILTER BAR ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" placeholder="Search tasks…" value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} style={{ width: 200, fontSize: 13 }} />
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 160, fontSize: 13 }}>
          <option value="open">Open (pending + delayed)</option>
          <option value="all">All statuses</option>
          <option value="pending">Pending only</option>
          <option value="complete">Complete only</option>
          <option value="delayed">Delayed only</option>
          <option value="na">N/A only</option>
        </select>
        <select className="form-input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ width: 160, fontSize: 13 }}>
          <option value="">All assignees</option>
          {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 160, fontSize: 13 }}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {monthFilter && (
          <button className="btn btn-sm" style={{ background: '#FEF3C7', color: '#92400E' }} onClick={() => setMonthFilter('')}>
            Showing {MONTHS.find(m => m.key === monthFilter)?.label} only — clear ×
          </button>
        )}
        <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto' }}>
          {filtered.length} of {tasks.length} tasks
        </span>
      </div>

      {/* ── GROUPED TASK LIST ── */}
      {MONTHS.map(m => {
        const monthTasks = grouped[m.key] || [];
        if (monthTasks.length === 0) return null;
        return (
          <div key={m.key} style={{ marginBottom: 24 }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 14, color: '#FFFFFF',
              background: '#1B3A5C', padding: '6px 12px', borderRadius: 6, marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{m.label}</span>
              <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                {monthStats[m.key].complete}/{monthStats[m.key].total} complete
              </span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {monthTasks.map(t => <TaskRow key={t.id} task={t} assigneeOptions={assigneeOptions}
                onStatus={handleStatus} onAssignee={handleAssignee} onNote={handleNote} onDueDate={handleDueDate}
                onUndo={handleUndo}
                onDelete={() => window.confirm(`Delete "${t.title}"?`) && deleteTask(t.id)} />)}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-text">No tasks match the current filters.</div>
        </div>
      )}

      {/* ── PAST COMPLETED PANEL ── */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
        <button className="btn btn-secondary" onClick={() => setShowHistory(v => !v)}>
          {showHistory ? 'Hide' : 'Show'} completed history ({tasks.filter(t => t.status === 'complete').length})
        </button>
        {showHistory && (
          <div style={{ marginTop: 12 }}>
            {MONTHS.map(m => {
              const completed = tasks.filter(t => t.month === m.key && t.status === 'complete')
                .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
              if (completed.length === 0) return null;
              return (
                <div key={m.key} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{m.label}</div>
                  {completed.map(t => (
                    <div key={t.id} style={{ padding: '6px 10px', background: '#F0FDF4', borderRadius: 4, marginBottom: 3, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#16A34A' }}>✓</span>
                      <span style={{ flex: 1 }}>{t.title}</span>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>{t.assignedTo || '—'}</span>
                      <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                        {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, assigneeOptions, onStatus, onAssignee, onNote, onDueDate, onUndo, onDelete }) {
  const [noteValue, setNoteValue] = useState(task.note || '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const status = STATUS[task.status] || STATUS.pending;
  const isOverdue = task.dueDate && task.status === 'pending' && task.dueDate < todayIso();
  const roleColor = ROLE_TINT[task.defaultRole] || '#6B7280';

  const saveNote = async () => {
    if (noteValue === (task.note || '')) { setNoteOpen(false); return; }
    setSavingNote(true);
    await onNote(task, noteValue);
    setSavingNote(false);
    setNoteOpen(false);
  };

  return (
    <div style={{
      padding: '10px 12px',
      background: status.bg,
      border: `1px solid ${status.border}`,
      borderLeft: `4px solid ${roleColor}`,
      borderRadius: 6,
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto auto auto auto',
      gap: 8,
      alignItems: 'center',
    }}>
      {/* Quick complete checkbox — confirms via the onStatus handler */}
      <input type="checkbox" checked={task.status === 'complete'}
        onChange={e => {
          if (e.target.checked) onStatus(task, 'complete');
          else onUndo(task);
        }}
        title={task.status === 'complete' ? 'Click to undo complete' : 'Click to mark complete (asks for confirmation)'}
        style={{ cursor: 'pointer', width: 16, height: 16 }} />

      {/* Title + description + chips */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13,
            textDecoration: task.status === 'complete' ? 'line-through' : 'none',
            opacity: task.status === 'complete' || task.status === 'na' ? 0.7 : 1 }}>
            {task.title}
          </span>
          {task.defaultRole && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: roleColor + '22', color: roleColor, fontWeight: 700 }}>
              {task.defaultRole}
            </span>
          )}
          {task.category && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#F3F4F6', color: '#6B7280' }}>
              {CATEGORY_LABEL[task.category] || task.category}
            </span>
          )}
          {isOverdue && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
              OVERDUE
            </span>
          )}
        </div>
        {task.description && (
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{task.description}</div>
        )}
        {(task.note || noteOpen) && (
          <div style={{ marginTop: 4 }}>
            {noteOpen ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="form-input" value={noteValue} onChange={e => setNoteValue(e.target.value)}
                  placeholder="Note (e.g. delayed because…)" style={{ fontSize: 12, flex: 1 }} autoFocus />
                <button className="btn btn-sm btn-primary" onClick={saveNote} disabled={savingNote}>Save</button>
                <button className="btn btn-sm btn-secondary" onClick={() => { setNoteValue(task.note || ''); setNoteOpen(false); }}>×</button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#92400E', fontStyle: 'italic', cursor: 'pointer' }}
                onClick={() => setNoteOpen(true)}>
                "{task.note}" <span style={{ color: '#9CA3AF', textDecoration: 'underline' }}>edit</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assignee */}
      <select value={task.assignedTo || ''} onChange={e => onAssignee(task, e.target.value)}
        style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4, background: '#FFFFFF' }}>
        <option value="">— Assign —</option>
        {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* Due date */}
      <input type="date" value={task.dueDate || ''} onChange={e => onDueDate(task, e.target.value)}
        style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #D1D5DB', borderRadius: 4, width: 130, background: '#FFFFFF' }} />

      {/* Status */}
      <select value={task.status} onChange={e => onStatus(task, e.target.value)}
        style={{ fontSize: 11, padding: '2px 4px', border: `1px solid ${status.border}`,
          borderRadius: 4, background: status.bg, color: status.fg, fontWeight: 600 }}>
        {STATUS_KEYS.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
      </select>

      {/* More actions */}
      <div style={{ display: 'flex', gap: 2 }}>
        {task.status === 'complete' && (
          <button className="btn btn-sm" style={{ padding: '2px 8px', background: '#FEF3C7', color: '#92400E', fontWeight: 600, border: '1px solid #FCD34D' }}
            onClick={() => onUndo(task)} title="Revert this task to pending">↶ Undo</button>
        )}
        {!task.note && !noteOpen && (
          <button className="btn btn-sm" style={{ padding: '2px 6px', background: 'none', color: '#6B7280' }}
            onClick={() => setNoteOpen(true)} title="Add note">+ note</button>
        )}
        <button className="btn btn-sm" style={{ padding: '2px 6px', background: 'none', color: '#9CA3AF' }}
          onClick={onDelete} title="Delete task">×</button>
      </div>
    </div>
  );
}
