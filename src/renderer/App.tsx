import { useEffect, useState } from 'react';
import { api } from './api';
import type { AppSettings } from '../shared/types';
import Dashboard from './pages/Dashboard';
import BolList from './pages/BolList';
import BolForm from './pages/BolForm';
import Catalogs from './pages/Catalogs';
import Settings from './pages/Settings';
import SetupWizard from './pages/SetupWizard';

export type View =
  | { name: 'dashboard' }
  | { name: 'bols' }
  | { name: 'bol-new'; template?: string }
  | { name: 'bol-edit'; id: number }
  | { name: 'catalogs' }
  | { name: 'settings' };

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setSettings(await api.settingsGet());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings?.theme ?? 'light');
  }, [settings?.theme]);

  if (loading) return <div className="main"><p className="muted">Loading…</p></div>;
  if (error && !settings) return <div className="main"><div className="error">{error}</div></div>;
  if (!settings) return <div className="main"><p className="muted">Could not load settings.</p></div>;

  if (!settings.setupComplete) {
    return (
      <SetupWizard
        settings={settings}
        onDone={async (s) => {
          await api.settingsSet(s);
          setSettings(s);
        }}
      />
    );
  }

  const nav = (v: View, label: string) => (
    <button
      key={label}
      className={`nav-btn ${view.name === v.name ? 'active' : ''}`}
      onClick={() => setView(v)}
    >
      {label}
    </button>
  );

  const toggleTheme = async () => {
    const next = { ...settings, theme: settings.theme === 'dark' ? 'dark' : 'light' } as AppSettings;
    await api.settingsSet(next);
    setSettings(next);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">{settings.brandName}</div>
        {nav({ name: 'dashboard' }, 'Dashboard')}
        {nav({ name: 'bols' }, 'Bills of Lading')}
        {nav({ name: 'catalogs' }, 'Catalogs')}
        {nav({ name: 'settings' }, 'Settings')}
        <div className="spacer" />
        <button className="theme-toggle" onClick={toggleTheme}>
          {settings.theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
        </button>
      </aside>
      <main className="main">
        {view.name === 'dashboard' && <Dashboard go={setView} />}
        {view.name === 'bols' && <BolList go={setView} />}
        {view.name === 'bol-new' && (
          <BolForm template={view.template} onDone={() => setView({ name: 'bols' })} onCancel={() => setView({ name: 'bols' })} />
        )}
        {view.name === 'bol-edit' && (
          <BolForm bolId={view.id} onDone={() => setView({ name: 'bols' })} onCancel={() => setView({ name: 'bols' })} />
        )}
        {view.name === 'catalogs' && <Catalogs />}
        {view.name === 'settings' && <Settings settings={settings} onSaved={setSettings} />}
      </main>
    </div>
  );
}
