// ============================================================================
// Ledgerline — root app component (sidebar shell + module routing)
// ============================================================================
import React, { useEffect, useState } from 'react';
import { StoreProvider, useStore, useCurrentUser } from './store';
import { ToastHost } from './components';
import HomeModule from './modules/Home';
import PersonalModule from './modules/PersonalFinance';
import BookkeeperModule from './modules/Bookkeeper';
import TaxModule from './modules/Tax';
import MarketModule from './modules/Market';
import HRModule from './modules/HR';
import AlertsModule from './modules/Alerts';
import AssistantModule from './modules/Assistant';
import SettingsModule from './modules/Settings';
import OnboardingWizard from './modules/Onboarding';

const NAV = [
  { section: 'Overview' },
  { id: 'home',     label: 'Home',           icon: '⌂' },
  { section: 'Money' },
  { id: 'personal', label: 'Personal',       icon: '◧' },
  { id: 'book',     label: 'Bookkeeper',     icon: '☰' },
  { id: 'tax',      label: 'Tax',            icon: '%' },
  { section: 'Markets & People' },
  { id: 'market',   label: 'Markets',        icon: '⇅' },
  { id: 'hr',       label: 'HR & Leave',     icon: '◉' },
  { section: 'Tools' },
  { id: 'alerts',   label: 'Smart Alerts',   icon: '!' },
  { id: 'ai',       label: 'AI Assistant',   icon: '◇' },
  { id: 'settings', label: 'Settings',       icon: '⚙' },
];

function Shell() {
  const { state } = useStore();
  const user = useCurrentUser();
  const [page, setPage] = useState('home');

  useEffect(() => {
    document.documentElement.style.setProperty('--font-base', `${state.profile.fontSize || 14}px`);
  }, [state.profile.fontSize]);

  if (!state.onboarded) return <OnboardingWizard />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title"><span className="logo-dot" /> Ledgerline</div>
          <div className="brand-sub">Finance Suite · AU</div>
        </div>
        <nav>
          {NAV.map((n, i) => n.section
            ? <div key={`s${i}`} className="nav-section">{n.section}</div>
            : <button
                key={n.id}
                className={`nav-item ${page === n.id ? 'active' : ''}`}
                onClick={() => setPage(n.id)}
              >
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
              </button>
          )}
        </nav>
        <div className="footer">
          <div style={{ fontWeight: 600 }}>{user?.name}</div>
          <div style={{ opacity: .7 }}>{user?.role}</div>
          <div style={{ marginTop: 6, fontSize: '0.85em' }}>{state.profile.businessName}</div>
        </div>
      </aside>

      <main className="main">
        {page === 'home'     && <HomeModule onNavigate={setPage} />}
        {page === 'personal' && <PersonalModule />}
        {page === 'book'     && <BookkeeperModule />}
        {page === 'tax'      && <TaxModule />}
        {page === 'market'   && <MarketModule />}
        {page === 'hr'       && <HRModule />}
        {page === 'alerts'   && <AlertsModule />}
        {page === 'ai'       && <AssistantModule />}
        {page === 'settings' && <SettingsModule />}
      </main>
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
