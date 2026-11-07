import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { BolDocument, BolHistoryEntry } from '../../shared/types';
import type { View } from '../App';

type SortKey = 'bolNumber' | 'date' | 'requestBy' | 'shipFrom';

export default function BolList({ go }: { go: (v: View) => void }) {
  const [bols, setBols] = useState<BolDocument[]>([]);
  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<BolHistoryEntry[] | null>(null);

  const load = async (q = search) => {
    setLoading(true);
    try {
      setBols(await api.bolList(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search (300 ms) so typing doesn't hammer IPC.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const visible = useMemo(() => {
    const rows = templateFilter === 'all' ? [...bols] : bols.filter((b) => b.template === templateFilter);
    rows.sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return av.localeCompare(bv) * sortDir;
    });
    return rows;
  }, [bols, templateFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  const doDelete = async (b: BolDocument) => {
    if (!window.confirm(`Delete BOL ${b.bolNumber}? This cannot be undone.`)) return;
    try {
      await api.bolDelete(b.id!);
      setNotice(`Deleted ${b.bolNumber}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doDuplicate = async (b: BolDocument) => {
    try {
      const copy = await api.bolDuplicate(b.id!);
      setNotice(`Duplicated as ${copy.bolNumber}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async (b: BolDocument) => {
    try {
      const res = await api.bolExportPdf(b.id!);
      setNotice(res.saved ? `PDF saved to ${res.path}` : 'PDF generated (save dialog cancelled — preview still available in the editor).');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doPrint = async (b: BolDocument) => {
    try {
      await api.bolPrint(b.id!);
      setNotice(`Sent ${b.bolNumber} to the printer.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h1>Bills of Lading</h1>
      <p className="sub">Search by BOL number, RR #, customer, or project. Click a row to edit.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}
      <div className="toolbar">
        <input placeholder="Search BOL / RR / customer / project…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
          <option value="all">All templates</option>
          <option value="warehouse">Warehouse</option>
          <option value="delivery">Delivery</option>
          <option value="standard">Standard</option>
          <option value="return">Return</option>
          <option value="transfer">Transfer</option>
          <option value="pickup">Pickup</option>
          <option value="custom">Custom</option>
        </select>
        <button className="btn primary" onClick={() => go({ name: 'bol-new', template: 'warehouse' })}>+ New BOL</button>
        <button className="btn" onClick={async () => { setHistory(await api.bolHistory()); }}>History</button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card"><p className="empty">No BOLs match. Create one, or clear the search.</p></div>
      ) : (
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('bolNumber')}>BOL # {sortKey === 'bolNumber' ? (sortDir === 1 ? '▲' : '▼') : ''}</th>
              <th>Template</th>
              <th onClick={() => toggleSort('date')}>Date {sortKey === 'date' ? (sortDir === 1 ? '▲' : '▼') : ''}</th>
              <th onClick={() => toggleSort('shipFrom')}>Ship From</th>
              <th onClick={() => toggleSort('requestBy')}>Request By</th>
              <th>Items</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.id}>
                <td><strong>{b.bolNumber}</strong></td>
                <td><span className="badge">{b.template}</span></td>
                <td>{b.date}</td>
                <td>{b.shipFrom}</td>
                <td>{b.requestBy}</td>
                <td>{b.items.length}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => go({ name: 'bol-edit', id: b.id! })}>Edit</button>
                  <button className="btn btn-sm" onClick={() => doDuplicate(b)}>Duplicate</button>
                  <button className="btn btn-sm" onClick={() => doExport(b)}>PDF</button>
                  <button className="btn btn-sm" onClick={() => doPrint(b)}>Print</button>
                  <button className="btn btn-sm danger" onClick={() => doDelete(b)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {history && (
        <div className="modal-backdrop" onClick={() => setHistory(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>BOL history (audit log)</h2>
            {history.length === 0 ? (
              <p className="muted">No history yet.</p>
            ) : (
              <table>
                <thead><tr><th>When</th><th>BOL</th><th>Action</th><th>By</th><th>Detail</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}><td>{h.createdAt}</td><td>{h.bolNumber}</td><td>{h.action}</td><td>{h.username ?? ''}</td><td>{h.detail}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 14 }}><button className="btn" onClick={() => setHistory(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
