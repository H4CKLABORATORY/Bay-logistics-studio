// Sign-in / first-run admin creation (Phase 9). Spanish UI, same card/button
// styles as the rest of the app. No default password exists: on a fresh
// database the first account created here becomes the admin.
import { useState } from 'react';
import { api } from '../api';
import type { SessionUser } from '../../shared/types';

export default function AuthScreen({ hasUsers, onAuthed }: { hasUsers: boolean; onAuthed: (u: SessionUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Escribe el nombre de usuario y la contraseña.');
      return;
    }
    if (!hasUsers && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      if (!hasUsers) {
        const created = await api.authSignup(username.trim(), password, 'admin');
        onAuthed({ id: created.id!, username: created.username, role: created.role });
      } else {
        onAuthed(await api.authLogin(username.trim(), password));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div className="main" style={{ maxWidth: 480, margin: '60px auto' }}>
      <h1>Logistics Studio</h1>
      {hasUsers ? (
        <p className="sub">Inicia sesión con tu cuenta para continuar.</p>
      ) : (
        <p className="sub">Primer uso: crea la cuenta de administrador. No hay contraseña predeterminada — elige una y guárdala bien, porque sin ella no se puede entrar.</p>
      )}
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>{hasUsers ? 'Iniciar sesión' : 'Crear cuenta de administrador'}</h2>
        <label>Nombre de usuario</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={onKey} autoFocus placeholder="p. ej. admin" />
        <label>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} placeholder="Mínimo 8 caracteres" />
        {!hasUsers && (
          <>
            <label>Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={onKey} />
            <p className="muted">Esta cuenta será la administradora: podrá crear más cuentas en Ajustes → Usuarios.</p>
          </>
        )}
        <button className="btn primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Comprobando…' : hasUsers ? 'Entrar' : 'Crear cuenta de administrador'}
        </button>
      </div>
      <p className="muted">Las cuentas se guardan solo en este equipo (base de datos local). Las contraseñas se guardan como hash bcrypt, nunca en texto claro.</p>
    </div>
  );
}
