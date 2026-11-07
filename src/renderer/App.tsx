import { Suspense, lazy, useEffect, useState } from 'react';
import { api } from './api';
import type { AppSettings, SessionUser } from '../shared/types';
import AuthScreen from './pages/AuthScreen';
import Dashboard from './pages/Dashboard';
import BolList from './pages/BolList';
import BolForm from './pages/BolForm';
import Catalogs from './pages/Catalogs';
import Settings from './pages/Settings';
import SetupWizard from './pages/SetupWizard';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
const Warehouse3D = lazy(() => import('./pages/Warehouse3D'));

export type View =
  | { name: 'dashboard' }
  | { name: 'bols' }
  | { name: 'bol-new'; template?: string }
  | { name: 'bol-edit'; id: number }
  | { name: 'catalogs' }
  | { name: 'inventory' }
  | { name: 'reports' }
  | { name: 'warehouse3d' }
  | { name: 'settings' };

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [auth, setAuth] = useState<{ hasUsers: boolean; user: SessionUser | null } | null>(null);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setSettings(await api.settingsGet());
      setAuth(await api.authStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const doLogout = async () => {
    try {
      await api.authLogout();
    } catch {
      // Session already ended — still show the login screen.
    }
    setAuth({ hasUsers: true, user: null });
    setView({ name: 'dashboard' });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings?.theme ?? 'light');
  }, [settings?.theme]);

  if (loading) return <div className="main"><p className="muted">Loading…</p></div>;
  if (error && !settings) return <div className="main"><div className="error">{error}</div></div>;
  if (!settings || !auth) return <div className="main"><p className="muted">Could not load settings.</p></div>;

  // Accounts gate (Phase 9): fresh database → create the admin account;
  // existing accounts → sign in. The app itself only renders after login.
  if (!auth.hasUsers) {
    return <AuthScreen hasUsers={false} onAuthed={(u) => setAuth({ hasUsers: true, user: u })} />;
  }
  if (!auth.user) {
    return <AuthScreen hasUsers onAuthed={(u) => setAuth({ hasUsers: true, user: u })} />;
  }

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
        {nav({ name: 'inventory' }, 'Inventory')}
        {nav({ name: 'reports' }, 'Reports')}
        {nav({ name: 'warehouse3d' }, '3D Warehouse')}
        {nav({ name: 'settings' }, 'Settings')}
        <div className="spacer" />
        <div className="user-chip">Sesión: <strong>{auth.user.username}</strong> · {auth.user.role === 'admin' ? 'Administrador' : 'Usuario'}</div>
        <button className="theme-toggle" onClick={doLogout}>Cerrar sesión</button>
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
        {view.name === 'inventory' && <Inventory currentUser={auth.user} />}
        {view.name === 'reports' && <Reports />}
        {view.name === 'warehouse3d' && (
          <Suspense fallback={<div className="main"><p className="muted">Loading 3D view…</p></div>}>
            <Warehouse3D />
          </Suspense>
        )}
        {view.name === 'settings' && <Settings settings={settings} onSaved={setSettings} currentUser={auth.user} />}
      </main>
    </div>
  );
}
