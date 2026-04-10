import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMasterRoster } from './hooks/useFirestore';
import Home from './components/Home';
import DailyTracker from './components/DailyTracker';
import NarrativeBuilder from './components/NarrativeBuilder';
import Dashboard from './components/Dashboard';
import HousePoints from './components/HousePoints';
import MasterRoster from './components/MasterRoster';
import ScheduleBuilder from './components/ScheduleBuilder';
import CommandCenter from './components/CommandCenter';
import ServiceHours from './components/ServiceHours';
import DocumentRepository from './components/DocumentRepository';
import { useServiceHours } from './hooks/useFirestore';

function App() {
  const { user, loading, login, logout, isAdmin, isBoardMember, displayName } = useAuth();
  const { students: masterStudents, loading: rosterLoading, addStudent, updateStudent, removeStudent, bulkImport, refresh: refreshRoster } = useMasterRoster();
  const { entries: serviceEntries, loading: serviceLoading, addEntry: addServiceEntry, updateEntry: updateServiceEntry, deleteEntry: deleteServiceEntry } = useServiceHours();
  const [activeTab, setActiveTab] = useState('home');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setToast(e.detail);
      setTimeout(() => setToast(null), 2500);
    };
    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, []);


  if (loading || rosterLoading) {
    return (
      <div className="login-screen">
        <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="login-logo" />
        <h1>Loading...</h1>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="login-logo" />
          <h1>Chesterton Academy</h1>
          <p className="subtitle">Institutional Success Engine</p>
          <button className="login-btn" onClick={login}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Tab sections
  const formationTabs = [
    { id: 'daily', label: 'Daily Tracker', icon: '\u{1F4DD}' },
    { id: 'narrative', label: 'Narratives', icon: '\u{1F4D6}' },
    { id: 'house', label: 'House Points', icon: '\u{1F3C6}' },
    ...(isAdmin ? [{ id: 'service', label: 'Service Hours', icon: '\u{1F91D}' }] : []),
  ];

  const operationsTabs = [
    { id: 'schedule', label: isAdmin ? 'Schedule Builder' : 'Schedule', icon: '\u{1F4C5}' },
    ...(isBoardMember ? [{ id: 'command', label: 'Board', icon: '\u{1F465}' }] : []),
    ...(isAdmin ? [
      { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
      { id: 'roster', label: 'Roster', icon: '\u{1F4CB}' },
      { id: 'documents', label: 'Documents', icon: '\u{1F4C1}' },
    ] : []),
  ];

  const tabs = [
    { id: 'home', label: 'Home', icon: '\u{1F3E0}' },
    { section: 'Formation Management', tabs: formationTabs },
    { section: 'Operations', tabs: operationsTabs },
  ];

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="header-logo" />
            <div>
              <div className="school-name">Chesterton Academy of the Florida Martyrs</div>
              <div className="app-title">Institutional Success Engine</div>
            </div>
          </div>
          <div className="header-user">
            <span>{displayName}</span>
            {isAdmin && <span className="badge badge-green">Admin</span>}
            {(isAdmin || isBoardMember) && (
              <button className="header-spend-btn" onClick={() => { setActiveTab('command'); window.dispatchEvent(new CustomEvent('navigate-budget-spending')); }}>
                $ Log Spend
              </button>
            )}
            <button onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <nav className="tab-nav">
        {tabs.map((item, i) => {
          if (item.section) {
            // Section group with label
            const sectionActive = item.tabs.some(t => t.id === activeTab);
            return (
              <div key={item.section} className="tab-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="tab-section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: sectionActive ? '#C9A227' : '#9CA3AF', whiteSpace: 'nowrap', pointerEvents: 'none', marginBottom: -2 }}>{item.section}</span>
                <div style={{ display: 'flex', gap: 0 }}>
                  {item.tabs.map(tab => (
                    <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}>
                      <span className="tab-icon">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <button key={item.id} className={`tab-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}>
              <span className="tab-icon">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <main className="main-content">
        <div className="tab-panel">
          {activeTab === 'home' && (
            <Home
              uid={user.uid}
              isAdmin={isAdmin}
              displayName={displayName}
              masterStudents={masterStudents}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'daily' && <DailyTracker uid={user.uid} masterStudents={masterStudents} />}
          {activeTab === 'narrative' && <NarrativeBuilder uid={user.uid} masterStudents={masterStudents} />}
          {activeTab === 'house' && <HousePoints uid={user.uid} isAdmin={isAdmin} masterStudents={masterStudents} />}
          {activeTab === 'schedule' && <ScheduleBuilder isAdmin={isAdmin} />}
          {activeTab === 'command' && isBoardMember && <CommandCenter />}
          {activeTab === 'dashboard' && isAdmin && <Dashboard masterStudents={masterStudents} />}
          {activeTab === 'service' && <ServiceHours entries={serviceEntries} onAdd={addServiceEntry} onUpdate={updateServiceEntry} onDelete={deleteServiceEntry} masterStudents={masterStudents} />}
          {activeTab === 'roster' && isAdmin && (
            <MasterRoster
              students={masterStudents}
              onAdd={addStudent}
              onUpdate={updateStudent}
              onRemove={removeStudent}
              onBulkImport={bulkImport}
              onRefresh={refreshRoster}
            />
          )}
          {activeTab === 'documents' && isAdmin && (
            <DocumentRepository masterStudents={masterStudents} uid={user.uid} />
          )}
        </div>
      </main>

      {toast && (
        <div className="toast">
          <span className="toast-check">&#10003;</span>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
