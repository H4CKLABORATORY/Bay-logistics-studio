// Centralised IPC error sanitising (Phase 6).
// Renderer-facing errors must never leak stack traces, SQL text, file
// paths or driver internals. Validation messages are safe to pass through;
// anything that looks like a DB/driver error becomes a generic message.

const LEAK_PATTERNS = [
  /stack/i,
  /SQLITE_/i,
  /better-sqlite3/i,
  /UNIQUE constraint/i,
  /FOREIGN KEY/i,
  /no such table/i,
  /no such column/i,
  /database is locked/i,
  /at\s+\w+\s+\(/, // stack-frame shape "at fn (file:line)"
  /node:internal/i,
  /\.db\b/i,
  /[A-Za-z]:\\/, // Windows paths
  /\/data\/home\//,
];

export function sanitizeIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const msg = raw.split('\n')[0].trim();
  // Friendly, safe wording for the one DB error users can act on.
  if (/UNIQUE constraint failed: inv_items\.sku/i.test(msg)) return 'An inventory item with that SKU already exists.';
  if (/UNIQUE constraint failed: inv_locations\.code/i.test(msg)) return 'A location with that code already exists.';
  if (/UNIQUE constraint failed: (inv_pallets|inv_boxes)\.code/i.test(msg)) return 'A pallet/box with that code already exists.';
  if (/UNIQUE constraint failed: bol_documents\.bol_number/i.test(msg)) return 'That BOL number is already in use.';
  if (/UNIQUE constraint failed: users\.username/i.test(msg)) return 'That username is already taken.';
  if (/UNIQUE constraint failed/i.test(msg)) return 'That record already exists (duplicate value).';
  // Check the full raw error (not just the first line): a stack trace hides
  // below a harmless-looking first line.
  if (LEAK_PATTERNS.some((re) => re.test(raw))) return 'Database error. Please try again.';
  if (!msg) return 'Unknown error. Please try again.';
  return msg.length > 200 ? `${msg.slice(0, 197)}…` : msg;
}
