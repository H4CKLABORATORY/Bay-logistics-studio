// Consecutive BOL numbering. Pure functions — covered by Vitest.

export function formatBolNumber(prefix: string, n: number, padLength = 5): string {
  if (!Number.isInteger(n) || n < 0) throw new Error('BOL number must be a non-negative integer');
  return `${prefix}${String(n).padStart(Math.max(1, padLength), '0')}`;
}

/** Allocate the next unused BOL number, skipping any already in use. */
export function allocateBolNumber(
  used: ReadonlySet<string>,
  prefix: string,
  nextNumber: number,
  padLength = 5,
): { bolNumber: string; nextNumber: number } {
  let n = Math.max(1, Math.floor(nextNumber));
  for (let guard = 0; guard < 10000; guard++) {
    const candidate = formatBolNumber(prefix, n, padLength);
    if (!used.has(candidate)) return { bolNumber: candidate, nextNumber: n + 1 };
    n++;
  }
  throw new Error('Could not allocate a free BOL number after 10000 attempts');
}

/** Parse a formatted BOL number back to its numeric part (for the given prefix). */
export function parseBolNumber(bolNumber: string, prefix: string): number | null {
  if (!bolNumber.startsWith(prefix)) return null;
  const rest = bolNumber.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return parseInt(rest, 10);
}
