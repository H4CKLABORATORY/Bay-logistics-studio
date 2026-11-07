// Account policy + login, testable without Electron. IPC handlers in ipc.ts
// are thin wrappers around these functions; Vitest covers them directly.
// Password hashes never leave this module except into the Store.
import type { Store } from './db';
import { clearSession, getSessionUser, setSessionUser } from './session';
import { hashPassword, isUserRole, validatePassword, validateUsername, verifyPassword } from './auth';
import type { AuthStatus, PublicUser, SessionUser, UserRole } from '../shared/types';

export function authStatus(store: Store): AuthStatus {
  return { hasUsers: store.countUsers() > 0, user: getSessionUser() };
}

/**
 * Create an account.
 * - First account ever: always becomes admin (no default password, no
 *   hardcoded credentials — the person at the keyboard chooses it), and the
 *   session starts immediately so first-run setup can proceed.
 * - Later accounts: only a logged-in admin can create them.
 * Returns the created user (never the password hash).
 */
export function createAccount(
  store: Store,
  username: string,
  password: string,
  requestedRole: UserRole = 'user',
): PublicUser {
  const errors = [...validateUsername(username), ...validatePassword(password)];
  if (!isUserRole(requestedRole)) errors.push('Role must be "admin" or "user".');
  if (errors.length) throw new Error(errors.join(' '));
  const userCount = store.countUsers();
  let role: UserRole;
  if (userCount === 0) {
    role = 'admin';
  } else {
    const me = getSessionUser();
    if (!me || me.role !== 'admin') {
      throw new Error('Only an admin can create accounts. Sign in as an admin first.');
    }
    role = requestedRole;
  }
  const created = store.createUser(username.trim(), hashPassword(password), role);
  if (userCount === 0) {
    setSessionUser({ id: created.id!, username: created.username, role: created.role });
  }
  return created;
}

/**
 * Verify credentials. A wrong username and a wrong password give the same
 * generic error so login cannot be used to enumerate accounts.
 */
export function login(store: Store, username: string, password: string): SessionUser {
  const rec = typeof username === 'string' ? store.getUserAuth(username.trim()) : null;
  if (!rec || !verifyPassword(typeof password === 'string' ? password : '', rec.passwordHash)) {
    throw new Error('Incorrect username or password.');
  }
  const user: SessionUser = { id: rec.id, username: rec.username, role: rec.role };
  setSessionUser(user);
  return user;
}

export function logout(): void {
  clearSession();
}

export function listAccounts(store: Store): PublicUser[] {
  const me = getSessionUser();
  if (!me || me.role !== 'admin') throw new Error('Only an admin can list accounts.');
  return store.listUsers();
}

export function deleteAccount(store: Store, id: number): void {
  const me = getSessionUser();
  if (!me || me.role !== 'admin') throw new Error('Only an admin can delete accounts.');
  if (me.id === id) throw new Error('You cannot delete your own account while signed in.');
  store.deleteUser(id);
}
