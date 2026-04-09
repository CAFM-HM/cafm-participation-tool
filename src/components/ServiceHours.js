import React, { useState, useMemo } from 'react';

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

// Florida Bright Futures Scholarship service hour requirements
const BRIGHT_FUTURES = {
  FAS: { label: 'Florida Academic Scholars (FAS)', hours: 100, color: '#C9A227' },
  FMS: { label: 'Florida Medallion Scholars (FMS)', hours: 75, color: '#2563EB' },
  GSV: { label: 'Gold Seal CAPE Scholars (GSV)', hours: 30, color: '#7C3AED' },
};

const VERIFICATION_STATUSES = ['Pending', 'Verified', 'Rejected'];

export default function ServiceHours({ entries, onAdd, onUpdate, onDelete, masterStudents }) {
  const [view, setView] = useState('summary'); // summary | log | student | import
  const [activeStudent, setActiveStudent] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ student: '', date: new Date().toISOString().split('T')[0], hours: '', organization: '', description: '', supervisor: '', supervisorContact: '' });
  const [filterGrade, setFilterGrade] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);

  const allEntries = entries || [];
  const students = masterStudents || [];

  // Build per-student summary
  const studentSummary = useMemo(() => {
    const map = {};
    // Initialize from master roster
    students.forEach(s => {
      const key = s.name.toLowerCase();
      if (!map[key]) map[key] = { name: s.name, house: s.house || '', grade: s.grade || '', target: 'FAS', totalHours: 0, verifiedHours: 0, entries: [] };
    });
    // Add hours from entries
    allEntries.forEach(e => {
      const key = (e.student || '').toLowerCase();
      if (!map[key]) map[key] = { name: e.student, house: '', grade: '', target: 'FAS', totalHours: 0, verifiedHours: 0, entries: [] };
      const hrs = parseFloat(e.hours) || 0;
      map[key].totalHours += hrs;
      if (e.verification === 'Verified') map[key].verifiedHours += hrs;
      map[key].entries.push(e);
      if (e.scholarshipTarget) map[key].target = e.scholarshipTarget;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [allEntries, students]);

  const filteredStudents = useMemo(() => {
    let list = studentSummary;
    if (filterGrade !== 'all') list = list.filter(s => s.grade === filterGrade);
    if (searchTerm) list = list.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return list;
  }, [studentSummary, filterGrade, searchTerm]);

  const schoolStats = useMemo(() => {
    const withHours = studentSummary.filter(s => s.totalHours > 0);
    const totalHours = studentSummary.reduce((sum, s) => sum + s.totalHours, 0);
    const meetingFAS = studentSummary.filter(s => s.totalHours >= BRIGHT_FUTURES.FAS.hours).length;
    const meetingFMS = studentSummary.filter(s => s.totalHours >= BRIGHT_FUTURES.FMS.hours && s.totalHours < BRIGHT_FUTURES.FAS.hours).length;
    const below = studentSummary.filter(s => s.totalHours < BRIGHT_FUTURES.GSV.hours && s.totalHours > 0).length;
    return { totalStudents: studentSummary.length, withHours: withHours.length, totalHours, meetingFAS, meetingFMS, below };
  }, [studentSummary]);

  const addEntry = () => {
    if (!newEntry.student || !newEntry.hours) return;
    onAdd({
      id: genId(),
      student: newEntry.student,
      date: newEntry.date,
      hours: parseFloat(newEntry.hours) || 0,
      organization: newEntry.organization,
      description: newEntry.description,
      supervisor: newEntry.supervisor,
      supervisorContact: newEntry.supervisorContact,
      verification: 'Pending',
      createdAt: new Date().toISOString(),
    });
    window.dispatchEvent(new CustomEvent('toast', { detail: `${newEntry.hours} hours logged for ${newEntry.student}` }));
    setNewEntry({ ...newEntry, hours: '', organization: '', description: '', supervisor: '', supervisorContact: '' });
  };

  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV appears empty.'); return; }
      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const studentIdx = header.findIndex(h => h.includes('student') || h.includes('name'));
      const dateIdx = header.findIndex(h => h.includes('date'));
      const hoursIdx = header.findIndex(h => h.includes('hour'));
      const orgIdx = header.findIndex(h => h.includes('org') || h.includes('location') || h.includes('site'));
      const descIdx = header.findIndex(h => h.includes('desc') || h.includes('activity') || h.includes('service'));
      const supervisorIdx = header.findIndex(h => h.includes('supervisor') || h.includes('contact'));
      if (studentIdx === -1) { alert('Could not find a student/name column.'); return; }
      if (hoursIdx === -1) { alert('Could not find an hours column.'); return; }
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        const student = cells[studentIdx] || '';
        const hours = parseFloat((cells[hoursIdx] || '0').replace(/[^0-9.]/g, '')) || 0;
        if (!student || hours === 0) continue;
        rows.push({
          student,
          date: dateIdx >= 0 ? cells[dateIdx] || '' : '',
          hours,
          organization: orgIdx >= 0 ? cells[orgIdx] || '' : '',
          description: descIdx >= 0 ? cells[descIdx] || '' : '',
          supervisor: supervisorIdx >= 0 ? cells[supervisorIdx] || '' : '',
        });
      }
      if (rows.length === 0) { alert('No valid rows found.'); return; }
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCsvImport = () => {
    csvPreview.forEach(row => {
      onAdd({
        id: genId(),
        student: row.student,
        date: row.date,
        hours: row.hours,
        organization: row.organization,
        description: row.description,
        supervisor: row.supervisor,
        supervisorContact: '',
        verification: 'Pending',
        createdAt: new Date().toISOString(),
      });
    });
    window.dispatchEvent(new CustomEvent('toast', { detail: `Imported ${csvPreview.length} service hour entries` }));
    setCsvPreview([]);
  };

  const exportCsv = (studentName) => {
    const data = studentName ? allEntries.filter(e => e.student.toLowerCase() === studentName.toLowerCase()) : allEntries;
    const header = ['Student', 'Date', 'Hours', 'Organization', 'Description', 'Supervisor', 'Contact', 'Status'];
    const esc = (v) => { const s = String(v || ''); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = data.map(e => [esc(e.student), e.date || '', (parseFloat(e.hours) || 0).toFixed(1), esc(e.organization), esc(e.description), esc(e.supervisor), esc(e.supervisorContact), e.verification || 'Pending']);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = studentName ? `service-hours-${studentName.replace(/\s/g, '-')}.csv` : 'cafm-service-hours.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportStudentPdf = (stu) => {
    const studentEntries = allEntries.filter(e => e.student.toLowerCase() === stu.name.toLowerCase()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const target = BRIGHT_FUTURES[stu.target] || BRIGHT_FUTURES.FAS;
    const w = window.open('', '_blank');
    const rows = studentEntries.map((e, i) => `
      <tr>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;text-align:center;color:#9CA3AF;font-size:10px;">${i + 1}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${e.date || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;">${(parseFloat(e.hours) || 0).toFixed(1)}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${e.organization || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${e.description || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;">${e.supervisor || ''}</td>
        <td style="padding:5px 6px;border-bottom:1px solid #E5E7EB;text-align:center;color:${e.verification === 'Verified' ? '#16A34A' : '#CA8A04'}">${e.verification || 'Pending'}</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Service Hours — ${stu.name}</title>
      <style>body{font-family:'Segoe UI',sans-serif;color:#1F2937;max-width:850px;margin:0 auto;padding:32px;}
      table{width:100%;border-collapse:collapse;font-size:11px;}
      th{text-align:left;padding:6px;background:#F9FAFB;border-bottom:2px solid #E5E7EB;font-size:10px;text-transform:uppercase;color:#6B7280;}
      @media print{body{padding:16px;}}</style></head><body>
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="font-family:Georgia,serif;color:#1B3A5C;font-size:20px;margin-bottom:2px;">Community Service Hours Record</h1>
        <h2 style="font-family:Georgia,serif;color:#6B7280;font-size:16px;font-weight:400;margin-top:4px;">Chesterton Academy of the Florida Martyrs</h2>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;padding:12px;background:#F9FAFB;border-radius:8px;">
        <div><strong>Student:</strong> ${stu.name}</div>
        <div><strong>Total Hours:</strong> ${stu.totalHours.toFixed(1)} / ${target.hours} (${target.label})</div>
        <div><strong>Verified Hours:</strong> ${stu.verifiedHours.toFixed(1)}</div>
      </div>
      <div style="margin-bottom:16px;padding:8px 12px;background:${stu.totalHours >= target.hours ? '#F0FDF4' : '#FFFBEB'};border:1px solid ${stu.totalHours >= target.hours ? '#BBF7D0' : '#FDE68A'};border-radius:6px;font-size:12px;">
        ${stu.totalHours >= target.hours ? '&#10003; Meets ' + target.label + ' requirement (' + target.hours + ' hours)' : 'Needs ' + (target.hours - stu.totalHours).toFixed(1) + ' more hours for ' + target.label}
      </div>
      <table><thead><tr><th style="width:30px;text-align:center">#</th><th>Date</th><th style="text-align:right">Hours</th><th>Organization</th><th>Description</th><th>Supervisor</th><th style="text-align:center">Status</th></tr></thead>
      <tbody>${rows}
        <tr style="font-weight:700;border-top:2px solid #1B3A5C;"><td></td><td>TOTAL</td><td style="text-align:right">${stu.totalHours.toFixed(1)}</td><td colspan="4"></td></tr>
      </tbody></table>
      <div style="margin-top:32px;font-size:11px;color:#6B7280;">
        <p><strong>Florida Bright Futures Requirements:</strong></p>
        <ul>
          <li>Florida Academic Scholars (FAS): 100 community service hours</li>
          <li>Florida Medallion Scholars (FMS): 75 community service hours</li>
          <li>Gold Seal CAPE Scholars (GSV): 30 community service hours</li>
        </ul>
        <p>Hours must be completed during grades 9-12 and verified by the school before graduation.</p>
        <p style="margin-top:16px;">Service must be voluntary, unpaid, and benefit a nonprofit, government, or community organization.</p>
      </div>
      <div style="margin-top:24px;border-top:1px solid #E5E7EB;padding-top:12px;font-size:10px;color:#9CA3AF;text-align:center;">
        Generated ${new Date().toLocaleDateString()} &middot; Chesterton Academy of the Florida Martyrs
      </div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ---- STUDENT DETAIL VIEW ----
  if (view === 'student' && activeStudent) {
    const stu = studentSummary.find(s => s.name.toLowerCase() === activeStudent.toLowerCase());
    if (!stu) { setView('summary'); return null; }
    const target = BRIGHT_FUTURES[stu.target] || BRIGHT_FUTURES.FAS;
    const pct = Math.min(Math.round((stu.totalHours / target.hours) * 100), 100);
    const studentEntries = stu.entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => { setView('summary'); setActiveStudent(null); }}>&larr; Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={stu.target} onChange={e => { /* Update target for all entries */ }} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB' }}>
              {Object.entries(BRIGHT_FUTURES).map(([key, bf]) => <option key={key} value={key}>{bf.label} ({bf.hours} hrs)</option>)}
            </select>
            <button className="btn btn-sm btn-secondary" onClick={() => exportCsv(stu.name)}>Export CSV</button>
            <button className="btn btn-sm btn-gold" onClick={() => exportStudentPdf(stu)}>Export PDF</button>
          </div>
        </div>

        <h3 className="section-title" style={{ marginBottom: 4 }}>{stu.name}</h3>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>{stu.house && `House: ${stu.house}`}{stu.grade && ` · Grade: ${stu.grade}`}</div>

        {/* Progress toward target */}
        <div style={{ padding: 16, background: stu.totalHours >= target.hours ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${stu.totalHours >= target.hours ? '#BBF7D0' : '#FDE68A'}`, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C' }}>{stu.totalHours.toFixed(1)} / {target.hours} hours</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: stu.totalHours >= target.hours ? '#16A34A' : '#CA8A04' }}>
              {stu.totalHours >= target.hours ? '✓ Requirement Met' : `${(target.hours - stu.totalHours).toFixed(1)} hours remaining`}
            </span>
          </div>
          <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: target.color, borderRadius: 5, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#6B7280' }}>
            <span>Verified: {stu.verifiedHours.toFixed(1)} hrs</span>
            <span>{target.label}</span>
          </div>
        </div>

        {/* Entries */}
        {studentEntries.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No service hours logged yet.</div>
        ) : (
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 30 }}>#</th><th>Date</th><th style={{ textAlign: 'right' }}>Hours</th><th>Organization</th><th>Description</th><th>Supervisor</th><th style={{ textAlign: 'center' }}>Status</th><th></th></tr></thead>
            <tbody>
              {studentEntries.map((e, i) => (
                <tr key={e.id}>
                  <td style={{ color: '#9CA3AF', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{(parseFloat(e.hours) || 0).toFixed(1)}</td>
                  <td>{e.organization}</td>
                  <td>{e.description}</td>
                  <td style={{ fontSize: 11 }}>{e.supervisor}{e.supervisorContact && <span style={{ color: '#9CA3AF' }}> ({e.supervisorContact})</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <select value={e.verification || 'Pending'} onChange={ev => onUpdate(e.id, { verification: ev.target.value })}
                      style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #E5E7EB', borderRadius: 4, color: e.verification === 'Verified' ? '#16A34A' : e.verification === 'Rejected' ? '#DC2626' : '#CA8A04', fontWeight: 600, background: 'transparent' }}>
                      {VERIFICATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><button className="remove-btn" onClick={() => { if (window.confirm('Delete this entry?')) onDelete(e.id); }}>x</button></td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1B3A5C' }}>
                <td></td>
                <td>TOTAL</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', color: '#1B3A5C' }}>{stu.totalHours.toFixed(1)}</td>
                <td colSpan={5}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ---- LOG VIEW (all entries) ----
  if (view === 'log') {
    const sortedEntries = [...allEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div className="sub-nav" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button className={`sub-nav-btn ${view === 'summary' ? 'active' : ''}`} onClick={() => setView('summary')}>Student Summary</button>
            <button className={`sub-nav-btn ${view === 'log' ? 'active' : ''}`} onClick={() => setView('log')}>All Entries</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => exportCsv()}>Export CSV</button>
            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              Import CSV
              <input type="file" accept=".csv" onChange={handleCsvFile} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Log Hours'}</button>
          </div>
        </div>

        {showAdd && renderAddForm()}

        {csvPreview.length > 0 && renderCsvPreview()}

        {sortedEntries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No entries yet.</div>
        ) : (
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th>#</th><th>Date</th><th>Student</th><th style={{ textAlign: 'right' }}>Hours</th><th>Organization</th><th>Description</th><th style={{ textAlign: 'center' }}>Status</th><th></th></tr></thead>
            <tbody>
              {sortedEntries.map((e, i) => (
                <tr key={e.id}>
                  <td style={{ color: '#9CA3AF', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ fontWeight: 500 }}>{e.student}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{(parseFloat(e.hours) || 0).toFixed(1)}</td>
                  <td>{e.organization}</td>
                  <td>{e.description}</td>
                  <td style={{ textAlign: 'center' }}>
                    <select value={e.verification || 'Pending'} onChange={ev => onUpdate(e.id, { verification: ev.target.value })}
                      style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #E5E7EB', borderRadius: 4, color: e.verification === 'Verified' ? '#16A34A' : '#CA8A04', fontWeight: 600, background: 'transparent' }}>
                      {VERIFICATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><button className="remove-btn" onClick={() => { if (window.confirm('Delete?')) onDelete(e.id); }}>x</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ---- SUMMARY VIEW (default) ----
  function renderAddForm() {
    return (
      <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>Log Service Hours</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Student *</label>
            <select value={newEntry.student} onChange={e => setNewEntry({ ...newEntry, student: e.target.value })} style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}>
              <option value="">— Select student —</option>
              {students.sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Date</label>
            <input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} style={{ fontSize: 12, padding: '6px 8px' }} />
          </div>
          <div style={{ width: 80 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Hours *</label>
            <input type="number" step="0.5" value={newEntry.hours} onChange={e => setNewEntry({ ...newEntry, hours: e.target.value })} placeholder="0" style={{ width: '100%', fontSize: 12, padding: '6px 8px', textAlign: 'right' }} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Organization</label>
            <input type="text" value={newEntry.organization} onChange={e => setNewEntry({ ...newEntry, organization: e.target.value })} placeholder="e.g., Habitat for Humanity" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Description</label>
            <input type="text" value={newEntry.description} onChange={e => setNewEntry({ ...newEntry, description: e.target.value })} placeholder="What did the student do?" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
          </div>
          <div style={{ width: 150 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Supervisor Name</label>
            <input type="text" value={newEntry.supervisor} onChange={e => setNewEntry({ ...newEntry, supervisor: e.target.value })} style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
          </div>
          <div style={{ width: 150 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>Supervisor Contact</label>
            <input type="text" value={newEntry.supervisorContact} onChange={e => setNewEntry({ ...newEntry, supervisorContact: e.target.value })} placeholder="Phone or email" style={{ width: '100%', fontSize: 12, padding: '6px 8px' }} />
          </div>
          <button className="btn btn-sm btn-gold" onClick={addEntry} disabled={!newEntry.student || !newEntry.hours}>Log Hours</button>
        </div>
      </div>
    );
  }

  function renderCsvPreview() {
    return (
      <div className="card" style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
          Import Preview — {csvPreview.length} entries, {csvPreview.reduce((s, r) => s + r.hours, 0).toFixed(1)} total hours
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 250 }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Student</th><th>Date</th><th style={{ textAlign: 'right' }}>Hours</th><th>Organization</th><th>Description</th></tr></thead>
            <tbody>
              {csvPreview.slice(0, 20).map((r, i) => (
                <tr key={i}><td>{r.student}</td><td>{r.date}</td><td style={{ textAlign: 'right' }}>{r.hours.toFixed(1)}</td><td>{r.organization}</td><td>{r.description}</td></tr>
              ))}
            </tbody>
          </table>
          {csvPreview.length > 20 && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>...and {csvPreview.length - 20} more</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setCsvPreview([])}>Cancel</button>
          <button className="btn btn-sm btn-gold" onClick={handleCsvImport}>Import {csvPreview.length} Entries</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="sub-nav" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={`sub-nav-btn ${view === 'summary' ? 'active' : ''}`} onClick={() => setView('summary')}>Student Summary</button>
          <button className={`sub-nav-btn ${view === 'log' ? 'active' : ''}`} onClick={() => setView('log')}>All Entries</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => exportCsv()}>Export CSV</button>
          <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
            Import CSV
            <input type="file" accept=".csv" onChange={handleCsvFile} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Log Hours'}</button>
        </div>
      </div>

      {showAdd && renderAddForm()}
      {csvPreview.length > 0 && renderCsvPreview()}

      {/* Bright Futures info banner */}
      <div style={{ padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, marginBottom: 12, fontSize: 11, color: '#1D4ED8', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><strong>FL Bright Futures Requirements:</strong></span>
        {Object.entries(BRIGHT_FUTURES).map(([key, bf]) => (
          <span key={key} style={{ color: bf.color, fontWeight: 600 }}>{key}: {bf.hours} hrs</span>
        ))}
        <span style={{ color: '#6B7280' }}>Hours must be completed grades 9-12, verified before graduation</span>
      </div>

      {/* School-wide stats */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-value">{schoolStats.totalStudents}</div><div className="stat-label">Total Students</div></div>
        <div className="stat-card"><div className="stat-value">{schoolStats.totalHours.toFixed(0)}</div><div className="stat-label">Total Hours Logged</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#16A34A' }}>{schoolStats.meetingFAS}</div><div className="stat-label">Meeting FAS (100 hrs)</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: schoolStats.below > 0 ? '#DC2626' : '#16A34A' }}>{studentSummary.filter(s => s.totalHours < BRIGHT_FUTURES.GSV.hours).length}</div><div className="stat-label">Below 30 hrs</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search students..." style={{ fontSize: 12, padding: '6px 10px', width: 200, borderRadius: 6, border: '1px solid #E5E7EB' }} />
      </div>

      {/* Student table */}
      {filteredStudents.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No students found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>House</th>
              <th style={{ textAlign: 'right' }}>Total Hours</th>
              <th style={{ textAlign: 'right' }}>Verified</th>
              <th>FAS Progress</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map(s => {
              const target = BRIGHT_FUTURES[s.target] || BRIGHT_FUTURES.FAS;
              const pct = Math.min(Math.round((s.totalHours / target.hours) * 100), 100);
              const meetsFAS = s.totalHours >= BRIGHT_FUTURES.FAS.hours;
              const meetsFMS = s.totalHours >= BRIGHT_FUTURES.FMS.hours;
              const meetsGSV = s.totalHours >= BRIGHT_FUTURES.GSV.hours;
              return (
                <tr key={s.name} style={{ cursor: 'pointer' }} onClick={() => { setActiveStudent(s.name); setView('student'); }}>
                  <td style={{ fontWeight: 600, color: '#1B3A5C' }}>{s.name}</td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{s.house}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.totalHours > 0 ? s.totalHours.toFixed(1) : '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: '#16A34A' }}>{s.verifiedHours > 0 ? s.verifiedHours.toFixed(1) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: meetsFAS ? '#16A34A' : meetsFMS ? '#2563EB' : meetsGSV ? '#7C3AED' : '#CA8A04', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#6B7280', minWidth: 30 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {meetsFAS ? <span style={{ fontSize: 10, fontWeight: 700, color: '#C9A227', padding: '2px 6px', background: '#FFFBEB', borderRadius: 4 }}>FAS</span>
                    : meetsFMS ? <span style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', padding: '2px 6px', background: '#EFF6FF', borderRadius: 4 }}>FMS</span>
                    : meetsGSV ? <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', padding: '2px 6px', background: '#F5F3FF', borderRadius: 4 }}>GSV</span>
                    : <span style={{ fontSize: 10, color: '#9CA3AF' }}>—</span>}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px' }} onClick={e => { e.stopPropagation(); exportStudentPdf(s); }}>PDF</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
