import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMasterRoster } from './hooks/useFirestore';
import Home from './components/Home';
import DailyTracker from './components/DailyTracker';
import NarrativeBuilder from './components/NarrativeBuilder';
import Dashboard from './components/Dashboard';
import HousePoints from './components/HousePoints';
import Demerits from './components/Demerits';
import MasterRoster from './components/MasterRoster';
import ScheduleBuilder from './components/ScheduleBuilder';

function App() {
  const { user, loading, login, logout, isAdmin, displayName } = useAuth();
  const { students: masterStudents, loading: rosterLoading, addStudent, updateStudent, removeStudent, bulkImport, refresh: refreshRoster } = useMasterRoster();
  const [activeTab, setActiveTab] = useState('home');

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
        <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="login-logo" />
        <h1>Chesterton Academy</h1>
        <p className="subtitle">Formation Management Portal</p>
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
    );
  }

  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'daily', label: 'Daily Tracker' },
    { id: 'narrative', label: 'Narrative Builder' },
    { id: 'house', label: 'House Points' },
    { id: 'demerits', label: 'Conduct Log' },
    { id: 'schedule', label: isAdmin ? 'Schedule Builder' : 'Schedule' },
    ...(isAdmin ? [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'roster', label: 'Master Roster' },
    ] : []),
  ];

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="CAFM" className="header-logo" />
            <div>
              <div className="school-name">Chesterton Academy of the Florida Martyrs</div>
              <div className="app-title">Formation Management Portal</div>
            </div>
          </div>
          <div className="header-user">
            <span>{displayName}</span>
            {isAdmin && <span className="badge badge-green">Admin</span>}
            <button onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <nav className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
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
          {activeTab === 'demerits' && <Demerits uid={user.uid} isAdmin={isAdmin} masterStudents={masterStudents} />}
          {activeTab === 'schedule' && <ScheduleBuilder isAdmin={isAdmin} />}
          {activeTab === 'dashboard' && isAdmin && <Dashboard masterStudents={masterStudents} />}
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
        </div>
      </main>
    </div>
  );
}

export default App;
