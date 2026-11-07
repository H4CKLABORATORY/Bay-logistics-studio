// Dashboard (Phase 8): KPI cards, low-stock/capacity alerts, an 8-week
// BOL bar chart and recent activity — all from one aggregated
// `dashboard:stats` call (SQL COUNT/SUM/GROUP BY in Store), plus the
// recent-BOLs table from the existing BOL list. No demo data.
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { BolDocument, DashboardStats } from '../../shared/types';
import type { View } from '../App';

export default function Dashboard({ go }: { go: (v: View) => void }) {
  const [bols, setBols] = useState<BolDocument[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.bolList(), api.dashboardStats()])
      .then(([b, s]) => { setBols(b); setStats(s); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const recent = bols.slice(0, 8);
  const maxWeek = stats ? Math.max(1, ...stats.weekly.map((w) => w.count)) : 1;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="sub">Bills of Lading and inventory at a glance.</p>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid">
            <div className="stat"><div className="num">{stats?.totalBols ?? bols.length}</div><div className="lbl">Total BOLs</div></div>
            <div className="stat"><div className="num">{stats?.bolsThisWeek ?? 0}</div><div className="lbl">BOLs this week</div></div>
            <div className="stat"><div className="num">{stats?.bolsToday ?? 0}</div><div className="lbl">BOLs today</div></div>
            <div className="stat"><div className="num">{stats?.totalStockUnits ?? 0}</div><div className="lbl">Total stock units</div></div>
            <div className="stat"><div className="num">{stats?.distinctSkusInStock ?? 0}</div><div className="lbl">SKUs in stock</div></div>
            <div className="stat"><div className="num">{stats?.locationsOccupied ?? 0} / {stats?.locationsTotal ?? 0}</div><div className="lbl">Locations occupied</div></div>
          </div>

          <div className="toolbar" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => go({ name: 'bol-new', template: 'warehouse' })}>+ New Warehouse BOL</button>
            <button className="btn" onClick={() => go({ name: 'bol-new', template: 'delivery' })}>+ New Delivery BOL</button>
            <button className="btn" onClick={() => go({ name: 'bols' })}>View all BOLs</button>
            <button className="btn" onClick={() => go({ name: 'reports' })}>Reports</button>
          </div>

          <h2>BOLs — last 8 weeks</h2>
          {!stats || stats.weekly.length === 0 ? (
            <div className="card"><p className="empty">No BOLs in the last 8 weeks.</p></div>
          ) : (
            <div className="card">
              <div className="bars">
                {stats.weekly.map((w) => (
                  <div className="bar-col" key={w.week} title={`${w.label}: ${w.count} BOL${w.count === 1 ? '' : 's'}`}>
                    <div className="bar-value">{w.count}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(w.count === 0 ? 0 : 8, (w.count / maxWeek) * 100)}%` }} /></div>
                    <div className="bar-label">{w.label.slice(5)}</div>
                  </div>
                ))}
              </div>
              <p className="muted">Week starting {stats.weekly[0]?.label} → {stats.weekly[stats.weekly.length - 1]?.label}.</p>
            </div>
          )}

          <h2>Alerts</h2>
          <div className="card">
            {(!stats || (stats.overCapacity.length === 0 && stats.zeroStockItems.length === 0)) ? (
              <p className="empty">No alerts — no location is at or over capacity and every item has stock.</p>
            ) : (
              <>
                {stats.overCapacity.length > 0 && (
                  <>
                    <h3>Locations at or over capacity</h3>
                    <ul className="alert-list">
                      {stats.overCapacity.map((l) => (
                        <li key={l.code}><strong>{l.code}</strong> — {l.stockQty} units in a location with capacity {l.capacity}.</li>
                      ))}
                    </ul>
                  </>
                )}
                {stats.zeroStockItems.length > 0 && (
                  <>
                    <h3>Items with zero stock</h3>
                    <ul className="alert-list">
                      {stats.zeroStockItems.map((it) => (
                        <li key={it.sku}><strong>{it.sku}</strong> — {it.name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>

          <h2>Recent activity</h2>
          {!stats || stats.recentActivity.length === 0 ? (
            <div className="card"><p className="empty">No activity recorded yet.</p></div>
          ) : (
            <table>
              <thead><tr><th>When</th><th>Source</th><th>Action</th><th>By</th><th>Detail</th></tr></thead>
              <tbody>
                {stats.recentActivity.map((a) => (
                  <tr key={`${a.source}-${a.id}`}>
                    <td>{a.createdAt.slice(0, 19).replace('T', ' ')}</td>
                    <td><span className="badge">{a.source === 'bol' ? `BOL ${a.ref}` : a.ref}</span></td>
                    <td>{a.action}</td>
                    <td>{a.username ?? ''}</td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Recent BOLs</h2>
          {recent.length === 0 ? (
            <div className="card"><p className="empty">No BOLs yet. Create your first one above.</p></div>
          ) : (
            <table>
              <thead><tr><th>BOL #</th><th>Template</th><th>Date</th><th>Ship From</th><th>Request By</th><th>Items</th></tr></thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id} onClick={() => go({ name: 'bol-edit', id: b.id! })} style={{ cursor: 'pointer' }}>
                    <td><strong>{b.bolNumber}</strong></td>
                    <td><span className="badge">{b.template}</span></td>
                    <td>{b.date}</td>
                    <td>{b.shipFrom}</td>
                    <td>{b.requestBy}</td>
                    <td>{b.items.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
