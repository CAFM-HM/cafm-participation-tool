import React, { useState, useMemo } from 'react';
import { useAnnouncements, useQuickLinks, useTeacherData } from '../hooks/useFirestore';
import { VIRTUES } from '../data/virtueData';

const TODAY = new Date().toISOString().split('T')[0];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Home({ uid, isAdmin, displayName, masterStudents, onNavigate }) {
  const { announcements, loading: annLoading, addAnnouncement, removeAnnouncement, togglePin } = useAnnouncements();
  const { links, loading: linksLoading, addLink, removeLink } = useQuickLinks();
  const { classes, loading: classesLoading } = useTeacherData(uid, masterStudents);

  const [showPostForm, setShowPostForm] = useState(false);
  const [newAnn, setNewAnn] = useState({ title: '', body: '', pinned: false });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newLink, setNewLink] = useState({ label: '', url: '' });

  // ============================================================
  // SCORING STATUS — this week
  // ============================================================
  const weekDates = useMemo(() => getWeekDates(), []);
  const scoringStatus = useMemo(() => {
    const status = { totalClasses: classes.length, scoredToday: 0, weekProgress: [] };

    weekDates.forEach(dateStr => {
      let scored = 0;
      classes.forEach(cls => {
        const hasAnyScore = (cls.students || []).some(s => {
          const dayScores = s.scores?.[dateStr];
          if (!dayScores || dayScores.absent) return false;
          return VIRTUES.some(v => dayScores[v.key] > 0);
        });
        if (hasAnyScore) scored++;
      });
      status.weekProgress.push({ date: dateStr, scored, total: classes.length });
      if (dateStr === TODAY) status.scoredToday = scored;
    });

    // Students below 3.0
    let belowThree = 0;
    classes.forEach(cls => {
      (cls.students || []).forEach(s => {
        const allDayAvgs = [];
        Object.entries(s.scores || {}).forEach(([, dayScores]) => {
          if (dayScores.absent) return;
          const vals = VIRTUES.map(v => dayScores[v.key] || 0).filter(x => x > 0);
          if (vals.length > 0) allDayAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        });
        if (allDayAvgs.length > 0) {
          const avg = allDayAvgs.reduce((a, b) => a + b, 0) / allDayAvgs.length;
          if (avg < 3) belowThree++;
        }
      });
    });
    status.belowThree = belowThree;

    return status;
  }, [classes, weekDates]);

  const handlePostAnnouncement = async () => {
    if (!newAnn.title.trim()) return;
    await addAnnouncement({ ...newAnn, postedBy: uid, postedByName: displayName });
    setNewAnn({ title: '', body: '', pinned: false });
    setShowPostForm(false);
  };

  const handleAddLink = async () => {
    if (!newLink.label.trim() || !newLink.url.trim()) return;
    let url = newLink.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    await addLink({ label: newLink.label.trim(), url });
    setNewLink({ label: '', url: '' });
    setShowLinkForm(false);
  };

  const loading = annLoading || linksLoading || classesLoading;

  // Sort announcements: pinned first, then by date
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0; // already sorted by postedAt desc from Firestore
  });

  const todayName = DAY_NAMES[new Date().getDay()];
  const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div>
      {/* Welcome header */}
      <div className="home-welcome">
        <div>
          <h2 className="home-greeting">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {displayName?.split(' ')[0] || 'Teacher'}</h2>
          <div className="home-date">{todayName}, {todayFormatted}</div>
        </div>
      </div>

      <div className="home-grid">
        {/* ── Left Column ── */}
        <div className="home-main">

          {/* Scoring Status */}
          {!loading && classes.length > 0 && (
            <div className="home-card">
              <div className="home-card-header">
                <h3>This Week</h3>
                <button className="btn btn-sm btn-primary" onClick={() => onNavigate('daily')}>Go to Scoring</button>
              </div>

              {/* Today's status */}
              <div style={{ marginBottom: 16 }}>
                {scoringStatus.scoredToday < scoringStatus.totalClasses ? (
                  <div className="scoring-nudge nudge-warning">
                    You've scored {scoringStatus.scoredToday} of {scoringStatus.totalClasses} classes today.
                    <button className="btn btn-sm btn-gold" style={{ marginLeft: 8 }} onClick={() => onNavigate('daily')}>
                      Score Now
                    </button>
                  </div>
                ) : (
                  <div className="scoring-nudge nudge-done">
                    All {scoringStatus.totalClasses} classes scored today.
                  </div>
                )}
              </div>

              {/* Week progress grid */}
              <div className="week-grid">
                {weekDates.map((dateStr, idx) => {
                  const wp = scoringStatus.weekProgress[idx];
                  const isToday = dateStr === TODAY;
                  const isFuture = dateStr > TODAY;
                  const allDone = wp.scored >= wp.total && wp.total > 0;
                  const dayLabel = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][idx];
                  return (
                    <div key={dateStr} className={`week-day ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''} ${allDone ? 'done' : ''}`}>
                      <div className="week-day-label">{dayLabel}</div>
                      <div className="week-day-date">{new Date(dateStr + 'T00:00:00').getDate()}</div>
                      {!isFuture && (
                        <div className="week-day-status">
                          {wp.total === 0 ? '—' : allDone ? '✓' : `${wp.scored}/${wp.total}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {scoringStatus.belowThree > 0 && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#DC2626' }}>
                  {scoringStatus.belowThree} student{scoringStatus.belowThree !== 1 ? 's' : ''} currently below 3.0
                </div>
              )}
            </div>
          )}

          {!loading && classes.length === 0 && (
            <div className="home-card">
              <div className="home-card-header"><h3>Get Started</h3></div>
              <p style={{ color: '#6B7280', fontSize: 14 }}>
                You haven't set up any classes yet. Head to the Daily Tracker to create your first class and start scoring.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onNavigate('daily')}>
                Set Up Classes
              </button>
            </div>
          )}

          {/* Announcements */}
          <div className="home-card">
            <div className="home-card-header">
              <h3>Announcements</h3>
              {isAdmin && (
                <button className="btn btn-sm btn-primary" onClick={() => setShowPostForm(!showPostForm)}>
                  {showPostForm ? 'Cancel' : '+ Post'}
                </button>
              )}
            </div>

            {isAdmin && showPostForm && (
              <div style={{ marginBottom: 16, padding: 14, background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                <input type="text" placeholder="Title" value={newAnn.title}
                  onChange={e => setNewAnn({ ...newAnn, title: e.target.value })}
                  style={{ marginBottom: 8, fontWeight: 600 }} />
                <textarea placeholder="Message (optional)" value={newAnn.body}
                  onChange={e => setNewAnn({ ...newAnn, body: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 6,
                    fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical', marginBottom: 8
                  }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={newAnn.pinned}
                      onChange={e => setNewAnn({ ...newAnn, pinned: e.target.checked })} />
                    Pin to top
                  </label>
                  <button className="btn btn-gold" onClick={handlePostAnnouncement}>Post</button>
                </div>
              </div>
            )}

            {annLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>
            ) : sortedAnnouncements.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                No announcements yet.
              </div>
            ) : (
              <div className="announcement-list">
                {sortedAnnouncements.map(ann => (
                  <div key={ann.id} className={`announcement-item ${ann.pinned ? 'pinned' : ''}`}>
                    <div className="announcement-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ann.pinned && <span className="pin-badge">PINNED</span>}
                        <span className="announcement-title">{ann.title}</span>
                      </div>
                      <span className="announcement-meta">{timeAgo(ann.postedAt)}</span>
                    </div>
                    {ann.body && <div className="announcement-body">{ann.body}</div>}
                    <div className="announcement-footer">
                      <span className="announcement-author">{ann.postedByName || 'Admin'}</span>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => togglePin(ann.id, ann.pinned)}>
                            {ann.pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button className="btn btn-sm" style={{ color: '#DC2626', background: 'none', padding: '4px 8px' }}
                            onClick={() => window.confirm('Delete this announcement?') && removeAnnouncement(ann.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column / Sidebar ── */}
        <div className="home-sidebar">

          {/* Quick Links */}
          <div className="home-card">
            <div className="home-card-header">
              <h3>Quick Links</h3>
              {isAdmin && (
                <button className="btn btn-sm btn-secondary" onClick={() => setShowLinkForm(!showLinkForm)}>
                  {showLinkForm ? 'Cancel' : '+ Add'}
                </button>
              )}
            </div>

            {isAdmin && showLinkForm && (
              <div style={{ marginBottom: 12, padding: 12, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                <input type="text" placeholder="Label (e.g. PraxisSchool)" value={newLink.label}
                  onChange={e => setNewLink({ ...newLink, label: e.target.value })} style={{ marginBottom: 6 }} />
                <input type="text" placeholder="URL" value={newLink.url}
                  onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddLink()} style={{ marginBottom: 8 }} />
                <button className="btn btn-sm btn-gold" onClick={handleAddLink}>Add Link</button>
              </div>
            )}

            {linksLoading ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#9CA3AF' }}>Loading...</div>
            ) : links.length === 0 ? (
              <div style={{ padding: 12, color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 }}>
                {isAdmin ? 'Add some quick links for your team.' : 'No links added yet.'}
              </div>
            ) : (
              <div className="quick-links-list">
                {links.map(link => (
                  <div key={link.id} className="quick-link-item">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="quick-link-anchor">
                      {link.label}
                    </a>
                    {isAdmin && (
                      <button className="remove-btn" onClick={() => window.confirm(`Remove "${link.label}"?`) && removeLink(link.id)}>×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Navigation */}
          <div className="home-card">
            <div className="home-card-header"><h3>Quick Navigation</h3></div>
            <div className="quick-nav-list">
              <button className="quick-nav-btn" onClick={() => onNavigate('daily')}>Daily Scoring</button>
              <button className="quick-nav-btn" onClick={() => onNavigate('narrative')}>Narrative Builder</button>
              <button className="quick-nav-btn" onClick={() => onNavigate('house')}>House Points</button>
              {isAdmin && <button className="quick-nav-btn" onClick={() => onNavigate('dashboard')}>Admin Dashboard</button>}
              {isAdmin && <button className="quick-nav-btn" onClick={() => onNavigate('roster')}>Master Roster</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
