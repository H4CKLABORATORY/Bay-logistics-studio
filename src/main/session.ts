// In-memory session for the current app run. The logged-in user lives only
// in main-process memory: quitting the app (or logging out) ends the session,
// and nothing session-related is written to disk. The renderer never decides
// who is logged in — IPC handlers read the session here.
import type { SessionUser } from '../shared/types';

let currentUser: SessionUser | null = null;

export function getSessionUser(): SessionUser | null {
  return currentUser;
}

export function setSessionUser(user: SessionUser | null): void {
  currentUser = user;
}

export function clearSession(): void {
  currentUser = null;
}

export function requireSessionUser(): SessionUser {
  if (!currentUser) throw new Error('Sign in to continue.');
  return currentUser;
}
