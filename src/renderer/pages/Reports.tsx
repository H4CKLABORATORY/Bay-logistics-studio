// Reports (Phase 8, NetSuite-style): three reports over real DB data with
// a date-range picker. Export each as CSV or PDF via the main process.
import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  defaultRange, groupBolsByCustomer, groupBolsByPeriod, isValidDateRange,
  summarizeInventory, summarizeMovements,
  type ReportBolRow, type ReportInventoryRow, type ReportMovementRow,
} from '../../shared/reports';

type Kind = 'bols' | 'movements' | 'inventory';

export default function Reports() {
  const [range, setRange] = useState(defaultRange(30));
  const [kind, setKind] = useState<Kind>('bols');
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [bols, setBols] = useState<ReportBolRow[]>([]);
  const [movements, setMovements] = useState<ReportMovementRow[]>([]);
  const [inventory, setInventory] = useState<{ rows: ReportInventoryRow[]; palletCount: number; boxCount: number }>({ rows: [], palletCount: 0, boxCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const [b, m, inv] = await Promise.all([
        api.reportBols(from, to),
        api.reportMovements(from, to),
        api.reportInventory(),
      ]);
      setBols(b);
      setMovements(m);
      setInventory(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = () => {
    if (!isValidDateRange(range.from, range.to)) {
      setError('Date range is invalid: use YYYY-MM-DD and make sure "from" is on or before "to".');
      return;
    }
    load(range.from, range.to);
  };

  const exportCsv = async () => {
    try {
      const res = await api.reportExportCsv(kind, range.from, range.to);
      setNotice(res.saved ? `CSV saved to ${res.path}` : 'Export cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportPdf = async () => {
    try {
      const res = await api.reportExportPdf(kind, range.from, range.to);
      setNotice(res.saved ? `PDF saved to ${res.path}` : 'Export cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const byPeriod = groupBolsByPeriod(bols, granularity);
  const byCustomer = groupBolsByCustomer(bols);
  const moveSummary = summarizeMovements(movements);
  const invSummary = summarizeInventory(inventory.rows, inventory.palletCount, inventory.boxCount);

  return (
    <div>
      <h1>Reports</h1>
      <p className="sub">BOLs, movements and inventory — all numbers come from the database.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="card">
        <div className="toolbar">
          <label style={{ margin: 0 }}>From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label style={{ margin: 0 }}>To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          <button className="btn primary" onClick={applyRange}>Apply range</button>
          <button className="btn" onClick={() => { const r = defaultRange(30); setRange(r); load(r.from, r.to); }}>Last 30 days</button>
        </div>
        <div className="toolbar">
          <button className={`btn ${kind === 'bols' ? 'primary' : ''}`} onClick={() => setKind('bols')}>BOLs by period</button>
          <button className={`btn ${kind === 'movements' ? 'primary' : ''}`} onClick={() => setKind('movements')}>Movements summary</button>
          <button className={`btn ${kind === 'inventory' ? 'primary' : ''}`} onClick={() => setKind('inventory')}>Inventory overview</button>
          {kind === 'bols' && (
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'week')}>
              <option value="day">Group by day</option>
              <option value="week">Group by week</option>
            </select>
          )}
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={exportPdf}>Export PDF</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : kind === 'bols' ? (
        <>
          <div className="grid">
            <div className="stat"><div className="num">{bols.length}</div><div className="lbl">BOLs in range</div></div>
            <div className="stat"><div className="num">{byPeriod.reduce((s, r) => s + r.totalQty, 0)}</div><div className="lbl">Total quantity</div></div>
            <div className="stat"><div className="num">{byPeriod.reduce((s, r) => s + r.totalWeight, 0).toFixed(1)}</div><div className="lbl">Total weight (as entered)</div></div>
          </div>
          <h2>BOLs by {granularity === 'day' ? 'day' : 'week'}</h2>
          {byPeriod.length === 0 ? <div className="card"><p className="empty">No BOLs in this range.</p></div> : (
            <table>
              <thead><tr><th>{granularity === 'day' ? 'Date' : 'Week starting'}</th><th>BOLs</th><th>Items</th><th>Total qty</th><th>Total weight</th></tr></thead>
              <tbody>{byPeriod.map((r) => (
                <tr key={r.period}><td>{r.period}</td><td>{r.bolCount}</td><td>{r.totalItems}</td><td>{r.totalQty}</td><td>{r.totalWeight.toFixed(1)}</td></tr>
              ))}</tbody>
            </table>
          )}
          <h2>By customer</h2>
          {byCustomer.length === 0 ? <div className="card"><p className="empty">No BOLs in this range.</p></div> : (
            <table>
              <thead><tr><th>Customer</th><th>BOLs</th><th>Items</th><th>Total qty</th></tr></thead>
              <tbody>{byCustomer.map((r) => (
                <tr key={r.customer}><td>{r.customer}</td><td>{r.bolCount}</td><td>{r.totalItems}</td><td>{r.totalQty}</td></tr>
              ))}</tbody>
            </table>
          )}
        </>
      ) : kind === 'movements' ? (
        <>
          <div className="grid">
            <div className="stat"><div className="num">{movements.filter((m) => m.type === 'entry').length}</div><div className="lbl">Entries</div></div>
            <div className="stat"><div className="num">{movements.filter((m) => m.type === 'exit').length}</div><div className="lbl">Exits</div></div>
            <div className="stat"><div className="num">{movements.filter((m) => m.type === 'move').length}</div><div className="lbl">Moves</div></div>
            <div className="stat"><div className="num">{movements.reduce((s, m) => s + m.quantity, 0)}</div><div className="lbl">Total units moved</div></div>
          </div>
          <h2>Movements per SKU ({range.from} → {range.to})</h2>
          {moveSummary.length === 0 ? <div className="card"><p className="empty">No movements in this range.</p></div> : (
            <table>
              <thead><tr><th>SKU</th><th>Item</th><th>Entries</th><th>Entry qty</th><th>Exits</th><th>Exit qty</th><th>Moves</th><th>Move qty</th></tr></thead>
              <tbody>{moveSummary.map((r) => (
                <tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.entries}</td><td>{r.entryQty}</td><td>{r.exits}</td><td>{r.exitQty}</td><td>{r.moves}</td><td>{r.moveQty}</td></tr>
              ))}</tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="grid">
            <div className="stat"><div className="num">{invSummary.totalUnits}</div><div className="lbl">Total units in stock</div></div>
            <div className="stat"><div className="num">{invSummary.distinctSkus}</div><div className="lbl">SKUs</div></div>
            <div className="stat"><div className="num">{invSummary.locationsUsed}</div><div className="lbl">Locations used</div></div>
            <div className="stat"><div className="num">{invSummary.palletCount}</div><div className="lbl">Pallets</div></div>
            <div className="stat"><div className="num">{invSummary.boxCount}</div><div className="lbl">Boxes</div></div>
          </div>
          <h2>Stock per SKU</h2>
          {invSummary.rows.length === 0 ? <div className="card"><p className="empty">No inventory items yet.</p></div> : (
            <table>
              <thead><tr><th>SKU</th><th>Item</th><th>Total units</th><th>Locations used</th></tr></thead>
              <tbody>{invSummary.rows.map((r) => (
                <tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.totalQty}</td><td>{r.locationsUsed}</td></tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
