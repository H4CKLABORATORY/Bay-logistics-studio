// Local accounts: password hashing + credential validation (main process only).
// Passwords are NEVER stored or logged in plaintext: only a bcrypt hash is
// persisted in the users table. bcryptjs (BSD-3-Clause, pure JS — no native
// build) was chosen over native bcrypt so it builds identically in Electron
// and in plain Node (Vitest) with no per-ABI rebuild.
import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!password || !hash) return false;
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    // A malformed stored hash never authenticates.
    return false;
  }
}

export function validateUsername(username: unknown): string[] {
  const errors: string[] = [];
  if (typeof username !== 'string' || !username.trim()) {
    errors.push('Username is required.');
    return errors;
  }
  const u = username.trim();
  if (u.length < 3) errors.push('Username must be at least 3 characters.');
  if (u.length > 32) errors.push('Username must be at most 32 characters.');
  if (!/^[A-Za-z0-9._-]+$/.test(u)) {
    errors.push('Username may only contain letters, numbers, dots, dashes and underscores.');
  }
  return errors;
}

export function validatePassword(password: unknown): string[] {
  const errors: string[] = [];
  if (typeof password !== 'string' || !password) {
    errors.push('Password is required.');
    return errors;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return errors;
}

export function isUserRole(role: unknown): role is 'admin' | 'user' {
  return role === 'admin' || role === 'user';
}
