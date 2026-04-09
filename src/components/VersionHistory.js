import React, { useState } from 'react';

/**
 * Reusable Version History panel.
 *
 * Props:
 *   versions     – array of { id, timestamp, label?, snapshot }
 *   onRestore    – (snapshot) => void   — called when user restores a version
 *   renderDiff   – (snapshot) => ReactNode  — optional: render a summary of what was in that snapshot
 *   canRestore   – boolean (default true) — show restore buttons
 *   title        – string (default "Version History")
 */
export default function VersionHistory({ versions = [], onRestore, renderDiff, canRestore = true, title = 'Version History' }) {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  if (versions.length === 0) return null;

  const sorted = [...versions].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const handleRestore = (v) => {
    if (confirmId === v.id) {
      onRestore(v.snapshot);
      setConfirmId(null);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Restored to previous version' }));
    } else {
      setConfirmId(v.id);
      // Auto-clear confirm after 4 seconds
      setTimeout(() => setConfirmId(prev => prev === v.id ? null : prev), 4000);
    }
  };

  return (
    <div style={{ marginTop: 16, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{'\u{1F553}'}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C' }}>{title}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div style={{ maxHeight: 350, overflowY: 'auto' }}>
        {sorted.map((v, idx) => {
          const isExpanded = expandedId === v.id;
          const isConfirming = confirmId === v.id;
          const ts = new Date(v.timestamp);
          const relTime = getRelativeTime(ts);

          return (
            <div key={v.id} style={{ borderBottom: idx < sorted.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer', background: isExpanded ? '#FFFBEB' : '#fff', transition: 'background 0.15s' }}
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', width: 16, textAlign: 'center' }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                      {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {relTime}
                      {v.label && <span style={{ marginLeft: 6 }}>&middot; {v.label}</span>}
                    </div>
                  </div>
                </div>
                {canRestore && onRestore && (
                  <button
                    className={`btn btn-sm ${isConfirming ? 'btn-gold' : 'btn-secondary'}`}
                    style={{ fontSize: 10, padding: '3px 8px' }}
                    onClick={e => { e.stopPropagation(); handleRestore(v); }}
                  >
                    {isConfirming ? 'Click again to confirm' : 'Restore'}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div style={{ padding: '8px 14px 12px 38px', background: '#FFFBEB', fontSize: 12, color: '#6B7280' }}>
                  {renderDiff ? renderDiff(v.snapshot) : (
                    <div style={{ fontStyle: 'italic' }}>Snapshot saved at {ts.toLocaleString()}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
}

/**
 * Helper: create a version entry to push into a versions array.
 * Call this BEFORE applying changes, passing the current state as snapshot.
 */
export function createVersion(snapshot, label) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    label: label || undefined,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
  };
}

/**
 * Helper: trim a versions array to maxLength (keep most recent).
 */
export function trimVersions(versions, maxLength = 30) {
  if (!versions || versions.length <= maxLength) return versions;
  return versions.slice(-maxLength);
}
