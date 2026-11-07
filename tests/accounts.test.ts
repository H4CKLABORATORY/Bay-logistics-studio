import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/db';
import { authStatus, createAccount, deleteAccount, listAccounts, login, logout } from '../src/main/accounts';
import { clearSession, getSessionUser } from '../src/main/session';
import { hashPassword, validatePassword, validateUsername, verifyPassword } from '../src/main/auth';
import { blankBol } from '../src/shared/types';

function freshStore() {
  return new Store(':memory:');
}

beforeEach(() => {
  clearSession();
});

describe('credential validation', () => {
  it('rejects a short username, bad characters and a short password', () => {
    expect(validateUsername('ab').length).toBeGreaterThan(0);
    expect(validateUsername('bad name!').length).toBeGreaterThan(0);
    expect(validateUsername('').length).toBeGreaterThan(0);
    expect(validateUsername('ana-1.x').length).toBe(0);
    expect(validatePassword('short').length).toBeGreaterThan(0);
    expect(validatePassword('long-enough-1').length).toBe(0);
  });

  it('bcrypt hashes verify and wrong passwords do not', () => {
    const hash = hashPassword('correct horse battery');
    expect(hash).not.toBe('correct horse battery');
    expect(hash.startsWith('$2b$')).toBe(true);
    expect(verifyPassword('correct horse battery', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
    expect(verifyPassword('correct horse battery', 'not-a-hash')).toBe(false);
  });
});

describe('sign-up (first account becomes admin)', () => {
  it('the first account is forced to admin and starts the session', () => {
    const store = freshStore();
    expect(authStatus(store)).toEqual({ hasUsers: false, user: null });
    const created = createAccount(store, 'jefa', 'password-segura-1', 'user');
    expect(created.role).toBe('admin');
    expect(store.countUsers()).toBe(1);
    expect(getSessionUser()).toEqual({ id: created.id, username: 'jefa', role: 'admin' });
    expect(authStatus(store).hasUsers).toBe(true);
  });

  it('rejects a duplicate username, case-insensitively', () => {
    const store = freshStore();
    createAccount(store, 'Ana', 'password-segura-1');
    expect(() => createAccount(store, 'ana', 'another-password-1', 'user')).toThrow(/already taken/i);
    expect(() => createAccount(store, 'ANA', 'another-password-1', 'user')).toThrow(/already taken/i);
    expect(store.countUsers()).toBe(1);
  });

  it('rejects weak credentials without creating a user', () => {
    const store = freshStore();
    expect(() => createAccount(store, 'ab', 'password-segura-1')).toThrow();
    expect(() => createAccount(store, 'ana', 'short')).toThrow();
    expect(store.countUsers()).toBe(0);
  });
});

describe('login + session', () => {
  it('successful login starts the session; logout ends it', () => {
    const store = freshStore();
    createAccount(store, 'jefa', 'password-segura-1');
    logout();
    expect(getSessionUser()).toBeNull();
    const user = login(store, 'jefa', 'password-segura-1');
    expect(user).toEqual({ id: expect.any(Number), username: 'jefa', role: 'admin' });
    expect(getSessionUser()?.username).toBe('jefa');
    logout();
    expect(getSessionUser()).toBeNull();
  });

  it('wrong password and unknown user are rejected with the same message', () => {
    const store = freshStore();
    createAccount(store, 'jefa', 'password-segura-1');
    logout();
    expect(() => login(store, 'jefa', 'wrong-password')).toThrow('Incorrect username or password.');
    expect(() => login(store, 'nadie', 'password-segura-1')).toThrow('Incorrect username or password.');
    expect(getSessionUser()).toBeNull();
  });

  it('login is case-insensitive for the username', () => {
    const store = freshStore();
    createAccount(store, 'Jefa', 'password-segura-1');
    logout();
    expect(login(store, 'jefa', 'password-segura-1').username).toBe('Jefa');
  });
});

describe('admin-only account management', () => {
  it('a non-admin cannot create accounts; an admin can', () => {
    const store = freshStore();
    createAccount(store, 'jefa', 'password-segura-1');
    createAccount(store, 'ana', 'password-segura-2', 'user');
    logout();
    login(store, 'ana', 'password-segura-2');
    expect(() => createAccount(store, 'luis', 'password-segura-3')).toThrow(/Only an admin/i);
    logout();
    login(store, 'jefa', 'password-segura-1');
    const luis = createAccount(store, 'luis', 'password-segura-3', 'user');
    expect(luis.role).toBe('user');
    logout();
    expect(login(store, 'luis', 'password-segura-3').username).toBe('luis');
  });

  it('listUsers never exposes a password hash', () => {
    const store = freshStore();
    createAccount(store, 'jefa', 'password-segura-1');
    const users = listAccounts(store);
    expect(users).toHaveLength(1);
    expect(users[0]).toEqual({ id: expect.any(Number), username: 'jefa', role: 'admin', createdAt: expect.any(String) });
    expect(JSON.stringify(users)).not.toContain('password-segura-1');
    expect('passwordHash' in users[0]).toBe(false);
  });

  it('an admin cannot delete herself or the last admin', () => {
    const store = freshStore();
    const jefa = createAccount(store, 'jefa', 'password-segura-1');
    createAccount(store, 'ana', 'password-segura-2', 'user');
    expect(() => deleteAccount(store, jefa.id!)).toThrow(/cannot delete your own/i);
    logout();
    login(store, 'ana', 'password-segura-2');
    expect(() => deleteAccount(store, jefa.id!)).toThrow(/Only an admin/i);
    logout();
    login(store, 'jefa', 'password-segura-1');
    const ana = store.listUsers().find((u) => u.username === 'ana')!;
    deleteAccount(store, ana.id!);
    expect(store.countUsers()).toBe(1);
    // Last admin: even the store layer refuses.
    expect(() => store.deleteUser(jefa.id!)).toThrow(/last admin/i);
  });
});

describe('acting user in audit history', () => {
  it('BOL history records which user created/updated/deleted the BOL', () => {
    const store = freshStore();
    const doc = {
      ...blankBol('warehouse'), bolNumber: 'BOL-00099', shipFrom: 'Warehouse A',
      deliveryAddress: '1 Main St', requestBy: 'Jane',
      items: [{ quantity: 1, modelDescription: 'X', rrNumber: '1', weight: '' }],
    };
    const created = store.createBol(doc, 'ana');
    store.updateBol(created.id!, { ...created, jobNumber: 'J-1' }, 'luis');
    store.deleteBol(created.id!, 'ana');
    const history = store.listHistory();
    expect(history.map((h) => [h.action, h.username])).toEqual([
      ['deleted', 'ana'],
      ['updated', 'luis'],
      ['created', 'ana'],
    ]);
  });

  it('inventory movements and history record the acting user', () => {
    const store = freshStore();
    const item = store.createInvItem({ sku: 'HK-1', name: 'Hook', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = store.listLocations()[0];
    const mv = store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 5, toLocationId: loc.id!, user: 'ana' });
    expect(mv.user).toBe('ana');
    const history = store.listInvHistory(10);
    expect(history[0].username).toBe('ana');
    expect(history[0].action).toBe('entry');
  });
});

describe('users survive backup round-trip', () => {
  it('a backup restores accounts and the password still works', () => {
    const src = freshStore();
    createAccount(src, 'jefa', 'password-segura-1');
    const dump = src.dumpAll() as Record<string, unknown>;
    expect(Array.isArray(dump.users)).toBe(true);
    expect((dump.users as { username: string }[]).map((u) => u.username)).toEqual(['jefa']);
    const dst = new Store(':memory:');
    dst.restoreAll(dump);
    expect(dst.countUsers()).toBe(1);
    logout();
    expect(login(dst, 'jefa', 'password-segura-1').role).toBe('admin');
    expect(() => login(dst, 'jefa', 'wrong-password')).toThrow('Incorrect username or password.');
  });

  it('upgrades a v0.3.0 database file: users table and username columns are added', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bay-upgrade-'));
    const dbPath = path.join(dir, 'old.db');
    try {
      const src = new Store(dbPath);
      const created = src.createBol({
        ...blankBol('warehouse'), bolNumber: 'BOL-00123', shipFrom: 'Warehouse A',
        deliveryAddress: '1 Main St', requestBy: 'Jane',
        items: [{ quantity: 1, modelDescription: 'X', rrNumber: '1', weight: '' }],
      }, 'ana');
      src.close();
      // Downgrade the file to the v0.3.0 shape: no users table, no username
      // columns, schema_version 2.
      const raw = new Database(dbPath);
      raw.exec(`DROP TABLE users; ALTER TABLE bol_history DROP COLUMN username; ALTER TABLE inv_history DROP COLUMN username; UPDATE meta SET value = '2' WHERE key = 'schema_version';`);
      raw.close();
      // Reopening with the current code must migrate it, not crash, and old
      // history rows must still read (username defaults to '').
      const upgraded = new Store(dbPath);
      expect(upgraded.countUsers()).toBe(0);
      expect(upgraded.listHistory()[0].username).toBe('');
      const again = upgraded.updateBol(created.id!, { ...created, jobNumber: 'J-9' }, 'luis');
      expect(again.jobNumber).toBe('J-9');
      expect(upgraded.listHistory()[0].username).toBe('luis');
      upgraded.close();
      const check = new Database(dbPath, { readonly: true });
      const ver = check.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as { value: string };
      expect(ver.value).toBe('3');
      check.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a pre-accounts backup without users still restores', () => {
    const src = freshStore();
    const dump = src.dumpAll() as Record<string, unknown>;
    delete dump.users;
    const dst = new Store(':memory:');
    dst.restoreAll(dump);
    expect(dst.countUsers()).toBe(0);
    expect(dst.listWarehouses().length).toBeGreaterThanOrEqual(1);
  });
});
