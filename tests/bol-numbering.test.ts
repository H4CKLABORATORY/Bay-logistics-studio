import { describe, expect, it } from 'vitest';
import { allocateBolNumber, formatBolNumber, parseBolNumber } from '../src/shared/bolNumbering';

describe('formatBolNumber', () => {
  it('pads with zeroes to the configured length', () => {
    expect(formatBolNumber('BOL-', 1, 5)).toBe('BOL-00001');
    expect(formatBolNumber('BOL-', 42, 5)).toBe('BOL-00042');
    expect(formatBolNumber('WH-', 123456, 5)).toBe('WH-123456'); // longer than pad: no truncation
  });
  it('rejects negative numbers', () => {
    expect(() => formatBolNumber('BOL-', -1)).toThrow();
  });
});

describe('allocateBolNumber', () => {
  it('allocates consecutive numbers', () => {
    const used = new Set<string>();
    const first = allocateBolNumber(used, 'BOL-', 1, 5);
    expect(first.bolNumber).toBe('BOL-00001');
    used.add(first.bolNumber);
    const second = allocateBolNumber(used, 'BOL-', first.nextNumber, 5);
    expect(second.bolNumber).toBe('BOL-00002');
    expect(second.nextNumber).toBe(3);
  });
  it('never returns a duplicate — skips numbers already in use', () => {
    const used = new Set(['BOL-00001', 'BOL-00002', 'BOL-00003']);
    const { bolNumber, nextNumber } = allocateBolNumber(used, 'BOL-', 1, 5);
    expect(bolNumber).toBe('BOL-00004');
    expect(nextNumber).toBe(5);
  });
  it('allocates 100 unique numbers in a row without duplicates', () => {
    const used = new Set<string>();
    let next = 1;
    for (let i = 0; i < 100; i++) {
      const r = allocateBolNumber(used, 'BOL-', next, 5);
      expect(used.has(r.bolNumber)).toBe(false);
      used.add(r.bolNumber);
      next = r.nextNumber;
    }
    expect(used.size).toBe(100);
  });
});

describe('parseBolNumber', () => {
  it('parses the numeric part back out', () => {
    expect(parseBolNumber('BOL-00042', 'BOL-')).toBe(42);
    expect(parseBolNumber('WH-7', 'BOL-')).toBeNull();
    expect(parseBolNumber('BOL-ABC', 'BOL-')).toBeNull();
  });
});
