import { useEffect, useState } from 'react';
import { api } from '../api';
import type { BolDocument } from '../../shared/types';
import type { View } from '../App';

export default function Dashboard({ go }: { go: (v: View) => void }) {
  const [bols, setBols] = useState<BolDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.bolList()
      .then(setBols)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const byTemplate = (t: string) => bols.filter((b) => b.template === t).length;
  const recent = bols.slice(0, 8);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="sub">Bills of Lading at a glance.</p>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid">
            <div className="stat"><div className="num">{bols.length}</div><div className="lbl">Total BOLs</div></div>
            <div className="stat"><div className="num">{byTemplate('warehouse')}</div><div className="lbl">Warehouse</div></div>
            <div className="stat"><div className="num">{byTemplate('delivery')}</div><div className="lbl">Delivery</div></div>
            <div className="stat"><div className="num">{bols.filter((b) => b.date === new Date().toISOString().slice(0, 10)).length}</div><div className="lbl">Today</div></div>
          </div>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => go({ name: 'bol-new', template: 'warehouse' })}>+ New Warehouse BOL</button>
            <button className="btn" onClick={() => go({ name: 'bol-new', template: 'delivery' })}>+ New Delivery BOL</button>
            <button className="btn" onClick={() => go({ name: 'bols' })}>View all BOLs</button>
          </div>
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
