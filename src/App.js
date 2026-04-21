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
import Compliance from './components/Compliance';
import AccessControl from './components/AccessControl';
import { useServiceHours } from './hooks/useFirestore';

function App() {
  const { user, loading, login, logout, isAdmin, isBoardMember, displayName, email } = useAuth();
  const { students: masterStudents, loading: rosterLoading, addStudent, updateStudent, removeStudent, bulkImport, refresh: refreshRoster } = useMasterRoster();
  const { entries: serviceEntries, loading: serviceLoading, addEntry: addServiceEntry, updateEntry: updateServiceEntry, deleteEntry: deleteServiceEntry } = useServiceHours();
  const [activeTab, setActiveTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      { id: 'compliance', label: 'Compliance', icon: '\u{1F4D7}' },
      { id: 'access', label: 'Access Control', icon: '\u{1F511}' },
    ] : []),
  ];

  const tabs = [
    { id: 'home', label: 'Home', icon: '\u{1F3E0}' },
    { section: 'Formation Management', tabs: formationTabs },
    { section: 'Operations', tabs: operationsTabs },
  ];

  const navItems = tabs.flatMap(item => item.section ? [{ sectionLabel: item.section }, ...item.tabs] : [item]);

  const handleNavClick = (id) => {
    setActiveTab(id);
    setSidebarOpen(false);
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header" onClick={() => handleNavClick('home')} style={{ cursor: 'pointer' }}>
          <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="sidebar-logo" />
          <div className="sidebar-brand">
            <div className="sidebar-school">CAFM</div>
            <div className="sidebar-app-title">Institutional Success Engine</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            if (item.sectionLabel) {
              return <div key={item.sectionLabel} className="sidebar-section-label">{item.sectionLabel}</div>;
            }
            return (
              <button key={item.id}
                className={`sidebar-btn ${activeTab === item.id ? 'sidebar-btn-active' : ''}`}
                onClick={() => handleNavClick(item.id)}>
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{displayName}</span>
            {isAdmin && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 6px' }}>Admin</span>}
          </div>
          {(isAdmin || isBoardMember) && (
            <button className="sidebar-btn sidebar-spend-btn" onClick={() => { handleNavClick('command'); window.dispatchEvent(new CustomEvent('navigate-budget-spending')); }}>
              <span className="sidebar-icon">$</span>
              <span className="sidebar-label">Log Spend</span>
            </button>
          )}
          <button className="sidebar-btn sidebar-signout-btn" onClick={logout}>
            <span className="sidebar-icon">{'\u{1F6AA}'}</span>
            <span className="sidebar-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main area */}
      <div className="main-area">
        <header className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <span></span><span></span><span></span>
          </button>
          <div className="topbar-title">{navItems.find(n => n.id === activeTab)?.label || 'Home'}</div>
          <div className="topbar-right">
            <span className="topbar-user">{displayName}</span>
            {isAdmin && <span className="badge badge-green" style={{ fontSize: 10 }}>Admin</span>}
          </div>
        </header>

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
          {activeTab === 'compliance' && isAdmin && <Compliance uid={user.uid} />}
          {activeTab === 'access' && isAdmin && <AccessControl currentEmail={email} />}
          </div>
        </main>

        {toast && (
          <div className="toast">
            <span className="toast-check">&#10003;</span>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
