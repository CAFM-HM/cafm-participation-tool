import React, { useState } from 'react';
import { useMasterRoster, useHousePoints, useConductEntries, useAnnouncements, useQuickLinks, useSchedule, useDocuments, useCommandCenter, useBudget, useFinancialPlanning, useServiceHours } from '../hooks/useFirestore';

function downloadFile(content, filename, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate() {
  return new Date().toISOString().split('T')[0];
}

function escCsv(val) {
  const s = String(val == null ? '' : val);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Individual export helpers
function exportStudentsCsv(students) {
  const header = ['Name', 'House', 'Gender', 'Grade', 'Parent Email', 'Student Email'];
  const rows = students.map(s => [escCsv(s.name), escCsv(s.house), escCsv(s.gender), escCsv(s.grade), escCsv(s.parentEmail), escCsv(s.studentEmail)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-students-${formatDate()}.csv`, 'text/csv');
}

function exportHousePointsCsv(entries) {
  const header = ['Date', 'Student', 'House', 'Points', 'Category', 'Reason', 'Type'];
  const rows = entries.map(e => [escCsv(e.date || (e.createdAt ? new Date(e.createdAt).toISOString().split('T')[0] : '')), escCsv(e.student), escCsv(e.house), e.points || 0, escCsv(e.category), escCsv(e.reason), escCsv(e.type)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-house-points-${formatDate()}.csv`, 'text/csv');
}

function exportConductCsv(entries) {
  const header = ['Date', 'Student', 'Entry', 'Type', 'Created'];
  const rows = entries.map(e => [escCsv(e.date), escCsv(e.student), escCsv(e.entry), escCsv(e.type), escCsv(e.createdAt)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-conduct-${formatDate()}.csv`, 'text/csv');
}

function exportServiceHoursCsv(entries) {
  const header = ['Student', 'Date', 'Hours', 'Organization', 'Description', 'Supervisor', 'Contact', 'Verification'];
  const rows = entries.map(e => [escCsv(e.student), escCsv(e.date), (parseFloat(e.hours) || 0).toFixed(1), escCsv(e.organization), escCsv(e.description), escCsv(e.supervisor), escCsv(e.supervisorContact), escCsv(e.verification)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-service-hours-${formatDate()}.csv`, 'text/csv');
}

function exportGrantsCsv(grants) {
  const header = ['Name', 'Source', 'Status', 'Requested', 'Approved', 'Spent', 'Date Submitted', 'Date Approved', 'Start', 'End', 'Reporting Deadline', 'Contact', 'Notes'];
  const rows = (grants || []).map(g => [escCsv(g.name), escCsv(g.source), escCsv(g.status), (parseFloat(g.requested) || 0).toFixed(2), (parseFloat(g.approved) || 0).toFixed(2), (parseFloat(g.spent) || 0).toFixed(2), escCsv(g.dateSubmitted), escCsv(g.dateApproved), escCsv(g.startDate), escCsv(g.endDate), escCsv(g.reportingDeadline), escCsv(g.contact), escCsv(g.notes)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-grants-${formatDate()}.csv`, 'text/csv');
}

function exportBudgetCsv(budgetData) {
  if (!budgetData) return;
  // Export line items
  const scenarios = budgetData.scenarios || [];
  const header = ['Line Item', 'Owner', ...scenarios.map(s => `Scenario: ${s}`), 'Notes'];
  const rows = (budgetData.lineItems || []).map(item => [escCsv(item.name), escCsv(item.owner), ...scenarios.map(s => (parseFloat(item.scenarios?.[s]) || 0).toFixed(2)), escCsv(item.notes)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-budget-line-items-${formatDate()}.csv`, 'text/csv');
}

function exportSpendingCsv(budgetData) {
  if (!budgetData) return;
  const lineItems = budgetData.lineItems || [];
  const getCat = (id) => lineItems.find(i => i.id === id)?.name || 'Unknown';
  const header = ['#', 'Date', 'Category', 'Description', 'Amount', 'Fiscal Year'];
  const spending = [...(budgetData.spending || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = spending.map((s, i) => [i + 1, escCsv(s.date), escCsv(getCat(s.categoryId)), escCsv(s.description), (parseFloat(s.amount) || 0).toFixed(2), escCsv(s.fiscalYear)]);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-all-spending-${formatDate()}.csv`, 'text/csv');
}

function exportAnnouncementsCsv(announcements) {
  const header = ['Title', 'Body', 'Posted By', 'Date', 'Pinned'];
  const rows = announcements.map(a => [escCsv(a.title), escCsv(a.body), escCsv(a.postedByName || a.postedBy), escCsv(a.postedAt), a.pinned ? 'Yes' : 'No']);
  downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-announcements-${formatDate()}.csv`, 'text/csv');
}

function exportMinutesPdf(meetings) {
  if (!meetings || meetings.length === 0) return;
  const w = window.open('', '_blank');
  const meetingsHtml = meetings.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(m => {
    const sections = (m.sections || []).map(s => `
      <div style="margin-bottom:10px;">
        <h4 style="color:#1B3A5C;font-size:13px;margin-bottom:2px;">${s.name}</h4>
        <div style="font-size:12px;white-space:pre-wrap;color:#374151;">${s.content || '<em style="color:#9CA3AF">No notes</em>'}</div>
      </div>`).join('');
    const actions = (m.actionItems || []).length > 0 ? `<div style="margin-top:8px;"><strong style="font-size:11px;color:#6B7280;">Action Items:</strong><ul style="font-size:12px;margin:4px 0;">${m.actionItems.map(a => `<li>${a.task}${a.assignee ? ' — ' + a.assignee : ''}${a.complete ? ' ✓' : ''}</li>`).join('')}</ul></div>` : '';
    return `
      <div style="margin-bottom:32px;page-break-inside:avoid;border-bottom:2px solid #E5E7EB;padding-bottom:20px;">
        <h3 style="font-family:Georgia,serif;color:#1B3A5C;font-size:16px;margin-bottom:2px;">${m.title}</h3>
        <div style="font-size:11px;color:#6B7280;margin-bottom:8px;">${m.date} &middot; ${m.status === 'approved' ? 'APPROVED' : 'DRAFT'}${m.attendees?.length ? ' &middot; Attendees: ' + m.attendees.join(', ') : ''}</div>
        ${sections}
        ${actions}
      </div>`;
  }).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>CAFM Board Minutes Archive</title>
    <style>body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:32px;}@media print{body{padding:16px;}}</style></head><body>
    <h1 style="font-family:Georgia,serif;color:#1B3A5C;font-size:20px;text-align:center;">Board Minutes Archive</h1>
    <div style="font-size:12px;color:#6B7280;text-align:center;margin-bottom:24px;">Chesterton Academy of the Florida Martyrs &middot; ${meetings.length} meetings &middot; Generated ${new Date().toLocaleDateString()}</div>
    ${meetingsHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function DataBackup() {
  const { students, loading: studentsLoading } = useMasterRoster();
  const { entries: housePoints, loading: hpLoading } = useHousePoints();
  const { entries: conductEntries, loading: conductLoading } = useConductEntries();
  const { entries: serviceEntries, loading: serviceLoading } = useServiceHours();
  const { announcements, loading: annLoading } = useAnnouncements();
  const { links: quickLinks, loading: qlLoading } = useQuickLinks();
  const { config: scheduleConfig, published: schedulePublished, loading: schedLoading } = useSchedule();
  const { documents, loading: docsLoading } = useDocuments();
  const { data: ccData, loading: ccLoading } = useCommandCenter();
  const { data: budgetData, loading: budgetLoading } = useBudget();
  const { data: fpData, loading: fpLoading } = useFinancialPlanning();

  const [exporting, setExporting] = useState(false);

  const allLoading = studentsLoading || hpLoading || conductLoading || serviceLoading || annLoading || qlLoading || schedLoading || docsLoading || ccLoading || budgetLoading || fpLoading;

  const collections = [
    { key: 'students', label: 'Student Roster', icon: '\u{1F4CB}', count: students?.length || 0, format: 'CSV', onExport: () => exportStudentsCsv(students) },
    { key: 'housePoints', label: 'House Points', icon: '\u{1F3C6}', count: housePoints?.length || 0, format: 'CSV', onExport: () => exportHousePointsCsv(housePoints) },
    { key: 'conduct', label: 'Conduct Entries', icon: '\u{1F4DD}', count: conductEntries?.length || 0, format: 'CSV', onExport: () => exportConductCsv(conductEntries) },
    { key: 'serviceHours', label: 'Service Hours', icon: '\u{1F91D}', count: serviceEntries?.length || 0, format: 'CSV', onExport: () => exportServiceHoursCsv(serviceEntries) },
    { key: 'announcements', label: 'Announcements', icon: '\u{1F4E2}', count: announcements?.length || 0, format: 'CSV', onExport: () => exportAnnouncementsCsv(announcements) },
    { key: 'budgetItems', label: 'Budget Line Items', icon: '\u{1F4B0}', count: budgetData?.lineItems?.length || 0, format: 'CSV', onExport: () => exportBudgetCsv(budgetData) },
    { key: 'spending', label: 'All Spending', icon: '\u{1F4B3}', count: budgetData?.spending?.length || 0, format: 'CSV', onExport: () => exportSpendingCsv(budgetData) },
    { key: 'grants', label: 'Grants', icon: '\u{1F4B6}', count: ccData?.grants?.length || 0, format: 'CSV', onExport: () => exportGrantsCsv(ccData?.grants) },
    { key: 'minutes', label: 'Board Minutes', icon: '\u{1F4C4}', count: ccData?.boardMeetings?.length || 0, format: 'PDF', onExport: () => exportMinutesPdf(ccData?.boardMeetings) },
  ];

  const exportFullBackup = () => {
    setExporting(true);
    try {
      const backup = {
        _meta: {
          exportDate: new Date().toISOString(),
          school: 'Chesterton Academy of the Florida Martyrs',
          version: '1.0',
          collections: {},
        },
        students: students || [],
        housePoints: housePoints || [],
        conductEntries: conductEntries || [],
        serviceHours: serviceEntries || [],
        announcements: announcements || [],
        quickLinks: quickLinks || [],
        schedule: { config: scheduleConfig || null, published: schedulePublished || null },
        documents: documents || [],
        commandCenter: ccData || {},
        budget: budgetData || {},
        financialPlanning: fpData || {},
      };

      // Add counts to meta
      backup._meta.collections = {
        students: backup.students.length,
        housePoints: backup.housePoints.length,
        conductEntries: backup.conductEntries.length,
        serviceHours: backup.serviceHours.length,
        announcements: backup.announcements.length,
        quickLinks: backup.quickLinks.length,
        documents: backup.documents.length,
        boardMeetings: (ccData?.boardMeetings || []).length,
        grants: (ccData?.grants || []).length,
        budgetLineItems: (budgetData?.lineItems || []).length,
        spending: (budgetData?.spending || []).length,
      };

      const json = JSON.stringify(backup, null, 2);
      downloadFile(json, `cafm-full-backup-${formatDate()}.json`);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Full backup downloaded' }));
    } catch (err) {
      console.error('Backup export failed:', err);
      alert('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  if (allLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading all data for backup...</div>;
  }

  const totalRecords = collections.reduce((sum, c) => sum + c.count, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 2 }}>Data Backup & Export</h3>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{totalRecords.toLocaleString()} total records across {collections.length} collections</div>
        </div>
        <button className="btn btn-primary" onClick={exportFullBackup} disabled={exporting} style={{ fontSize: 14, padding: '10px 20px' }}>
          {exporting ? 'Exporting...' : '\u{1F4E6} Download Full Backup'}
        </button>
      </div>

      {/* Full backup info */}
      <div style={{ padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, marginBottom: 20, fontSize: 12, color: '#1D4ED8' }}>
        <strong>Full Backup</strong> downloads a single JSON file containing all your data — students, scores, budget, spending, grants, minutes, service hours, schedule, and more. Keep this file safe as an offline backup.
      </div>

      {/* Individual exports */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>Individual Exports</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {collections.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <div>
                <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>{c.count} records</div>
              </div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={c.onExport} disabled={c.count === 0} style={{ opacity: c.count === 0 ? 0.4 : 1 }}>
              {c.format}
            </button>
          </div>
        ))}
      </div>

      {/* Additional exports that need special handling */}
      <div style={{ marginTop: 20, fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>Financial Reports</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{'\u{1F4CA}'}</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>6-Year Projections</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{(fpData?.projections || []).length} line items</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => {
            if (!fpData?.projections) return;
            const years = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
            const header = ['Line Item', 'Owner', ...years];
            const rows = fpData.projections.map(p => [escCsv(p.name), escCsv(p.owner), ...years.map(yr => (parseFloat(p.values?.[yr]) || 0).toFixed(0))]);
            const totals = ['TOTAL', '', ...years.map(yr => fpData.projections.reduce((s, p) => s + (parseFloat(p.values?.[yr]) || 0), 0).toFixed(0))];
            downloadFile([header.join(','), ...rows.map(r => r.join(',')), totals.join(',')].join('\n'), `cafm-6yr-projections-${formatDate()}.csv`, 'text/csv');
            window.dispatchEvent(new CustomEvent('toast', { detail: 'Projections exported' }));
          }} disabled={!(fpData?.projections?.length)}>CSV</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{'\u{1F4C5}'}</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>Schedule</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{schedulePublished ? 'Published' : 'Draft only'}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => {
            downloadFile(JSON.stringify(scheduleConfig || {}, null, 2), `cafm-schedule-${formatDate()}.json`);
            window.dispatchEvent(new CustomEvent('toast', { detail: 'Schedule exported' }));
          }} disabled={!scheduleConfig}>JSON</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{'\u{1F3EB}'}</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1B3A5C', fontSize: 13 }}>Board Directory</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{(ccData?.directors || []).length} members</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const dirs = ccData?.directors || [];
            const header = ['Name', 'Role', 'Email', 'Phone', 'Term Start', 'Term End'];
            const rows = dirs.map(d => [escCsv(d.name), escCsv(d.role), escCsv(d.email), escCsv(d.phone), escCsv(d.termStart), escCsv(d.termEnd)]);
            downloadFile([header.join(','), ...rows.map(r => r.join(','))].join('\n'), `cafm-board-directory-${formatDate()}.csv`, 'text/csv');
            window.dispatchEvent(new CustomEvent('toast', { detail: 'Directory exported' }));
          }} disabled={!(ccData?.directors?.length)}>CSV</button>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '12px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, color: '#6B7280' }}>
        <strong>Tip:</strong> Run a full backup regularly and save the JSON file somewhere safe (Google Drive, external drive, etc.). The backup contains everything needed to restore your data.
      </div>
    </div>
  );
}
