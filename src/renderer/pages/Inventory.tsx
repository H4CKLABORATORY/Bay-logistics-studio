// Inventory page (Phase 4): stock list, item/location creation, entry/exit/
// move form, and search by SKU / client / project / RR number. An RR search
// finds BOL line items with that RR, their BOLs, and BOL-linked movements.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { buildLocationCode, parseLocationCode } from '../../shared/inventory';
import type { InvItem, InvLocation, InvMovement, InvStockRow, InventorySearchResult, SessionUser } from '../../shared/types';

export default function Inventory({ currentUser }: { currentUser?: SessionUser | null }) {
  const [items, setItems] = useState<InvItem[]>([]);
  const [locations, setLocations] = useState<Array<InvLocation & { stockQty: number }>>([]);
  const [stock, setStock] = useState<InvStockRow[]>([]);
  const [movements, setMovements] = useState<InvMovement[]>([]);
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<InventorySearchResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  // Movement form
  const [mvType, setMvType] = useState<'entry' | 'exit' | 'move'>('entry');
  const [mvItemId, setMvItemId] = useState('');
  const [mvQty, setMvQty] = useState(1);
  const [mvFrom, setMvFrom] = useState('');
  const [mvTo, setMvTo] = useState('');
  const [mvBolId, setMvBolId] = useState('');
  const [mvRr, setMvRr] = useState('');

  // New item form
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newProject, setNewProject] = useState('');

  // New location form
  const [newCode, setNewCode] = useState('');

  const load = async () => {
    try {
      const [it, loc, st, mv] = await Promise.all([
        api.inventoryItems(), api.inventoryLocations(), api.inventoryStock(), api.inventoryMovements(50),
      ]);
      setItems(it); setLocations(loc); setStock(st); setMovements(mv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = async () => {
    setError(''); setNotice('');
    if (!search.trim()) { setSearchResult(null); return; }
    try {
      setSearchResult(await api.inventorySearch(search.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitMovement = async () => {
    setError(''); setNotice('');
    try {
      await api.inventoryMovementCreate({
        type: mvType, itemId: Number(mvItemId), quantity: mvQty,
        fromLocationId: mvFrom ? Number(mvFrom) : null,
        toLocationId: mvTo ? Number(mvTo) : null,
        bolId: mvBolId ? Number(mvBolId) : null,
        // The server records the signed-in session user; the name is not typed in.
        rrNumber: mvRr, user: currentUser?.username ?? '',
      });
      setNotice(`Movement recorded (${mvType}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitItem = async () => {
    setError(''); setNotice('');
    try {
      await api.inventoryItemCreate({ sku: newSku, name: newName, description: '', unit: '', weight: '', customer: newCustomer, project: newProject });
      setNotice(`Item ${newSku} created.`);
      setNewSku(''); setNewName(''); setNewCustomer(''); setNewProject('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitLocation = async () => {
    setError(''); setNotice('');
    const parsed = parseLocationCode(newCode);
    if (!parsed || !locations.length) { setError('Location code must look like A-01-02-03.'); return; }
    const whId = locations[0].warehouseId;
    try {
      await api.inventoryLocationCreate({
        warehouseId: whId, code: newCode.trim().toUpperCase(), zone: parsed.zone,
        aisle: parsed.aisle, shelf: parsed.shelf, position: parsed.position,
        x: 2 + parsed.aisle * 4, y: 0.6 + parsed.shelf * 1.2, z: 2 + parsed.position * 2, capacity: 100,
      });
      setNotice(`Location ${newCode.trim().toUpperCase()} created.`);
      setNewCode('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div><h1>Inventory</h1><p className="muted">Loading…</p></div>;

  return (
    <div>
      <h1>Inventory</h1>
      <p className="sub">Stock, locations, and movements. Moves are atomic: source and destination update together, or nothing changes.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <h2>Search — SKU, client, project, or RR #</h2>
      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. 9912 (RR), SKU, client, project" />
        <button className="btn primary" onClick={doSearch}>Search</button>
        <button className="btn" onClick={() => { setSearch(''); setSearchResult(null); }}>Clear</button>
      </div>
      {searchResult && (
        <div className="card">
          <p><strong>{searchResult.items.length}</strong> item(s), <strong>{searchResult.bols.length}</strong> BOL(s), <strong>{searchResult.movements.length}</strong> movement(s) found.</p>
          {searchResult.bols.length > 0 && (
            <p>RR-linked BOLs: {searchResult.bols.map((b) => `${b.bolNumber} (RR ${b.rrNumber})`).join(', ')}</p>
          )}
          {searchResult.items.map((it) => <p key={it.id}>{it.sku} — {it.name} {it.customer ? `· ${it.customer}` : ''} {it.project ? `· ${it.project}` : ''}</p>)}
          {searchResult.movements.map((m) => (
            <p key={m.id}>{m.type} {m.quantity} x {m.sku} {m.fromLocationCode ? `from ${m.fromLocationCode}` : ''} {m.toLocationCode ? `to ${m.toLocationCode}` : ''} {m.bolNumber ? `· BOL ${m.bolNumber}` : ''} {m.rrNumber ? `· RR ${m.rrNumber}` : ''} {m.user ? `· by ${m.user}` : ''}</p>
          ))}
          {searchResult.items.length === 0 && searchResult.bols.length === 0 && searchResult.movements.length === 0 && (
            <p className="muted">Nothing found for “{search}”.</p>
          )}
        </div>
      )}

      <h2>Record a movement</h2>
      <div className="card">
        <div className="form-row">
          <div><label>Type</label>
            <select value={mvType} onChange={(e) => setMvType(e.target.value as 'entry' | 'exit' | 'move')}>
              <option value="entry">Entry (in)</option>
              <option value="exit">Exit (out)</option>
              <option value="move">Move (location to location)</option>
            </select>
          </div>
          <div><label>Item</label>
            <select value={mvItemId} onChange={(e) => setMvItemId(e.target.value)}>
              <option value="">— select item —</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
            </select>
          </div>
          <div><label>Quantity</label><input type="number" min={1} value={mvQty} onChange={(e) => setMvQty(Number(e.target.value))} /></div>
          <div><label>Registrado como</label><p className="muted" style={{ margin: '6px 0' }}>{currentUser?.username ?? '—'}</p></div>
          {(mvType === 'exit' || mvType === 'move') && (
            <div><label>From location</label>
              <select value={mvFrom} onChange={(e) => setMvFrom(e.target.value)}>
                <option value="">— select —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.stockQty} in stock)</option>)}
              </select>
            </div>
          )}
          {(mvType === 'entry' || mvType === 'move') && (
            <div><label>To location</label>
              <select value={mvTo} onChange={(e) => setMvTo(e.target.value)}>
                <option value="">— select —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.stockQty} in stock)</option>)}
              </select>
            </div>
          )}
          <div><label>Linked BOL id (optional)</label><input type="number" value={mvBolId} onChange={(e) => setMvBolId(e.target.value)} placeholder="BOL database id" /></div>
          <div><label>RR # (optional)</label><input value={mvRr} onChange={(e) => setMvRr(e.target.value)} /></div>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={submitMovement}>Record movement</button>
        </div>
      </div>

      <h2>Stock</h2>
      {stock.length === 0 ? (
        <div className="card"><p className="empty">No stock yet. Add an item below, then record an entry movement.</p></div>
      ) : (
        <table><thead><tr><th>Location</th><th>SKU</th><th>Item</th><th>Qty</th></tr></thead>
          <tbody>{stock.map((s) => (
            <tr key={s.id}><td><strong>{s.locationCode}</strong></td><td>{s.sku}</td><td>{s.itemName}</td><td>{s.quantity}</td></tr>
          ))}</tbody>
        </table>
      )}

      <h2>Locations ({locations.length})</h2>
      <table><thead><tr><th>Code</th><th>Zone</th><th>Aisle</th><th>Shelf</th><th>Pos</th><th>Coords (x,y,z m)</th><th>Stock</th></tr></thead>
        <tbody>{locations.map((l) => (
          <tr key={l.id}><td><strong>{l.code}</strong></td><td>{l.zone}</td><td>{l.aisle}</td><td>{l.shelf}</td><td>{l.position}</td><td>{l.x}, {l.y}, {l.z}</td><td>{l.stockQty}</td></tr>
        ))}</tbody>
      </table>

      <div className="form-row">
        <div className="card">
          <h3>New item</h3>
          <label>SKU</label><input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="e.g. HOOK-5T" />
          <label>Name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label>Client</label><input value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
          <label>Project</label><input value={newProject} onChange={(e) => setNewProject(e.target.value)} />
          <div className="toolbar" style={{ marginTop: 12 }}><button className="btn primary" onClick={submitItem}>Add item</button></div>
        </div>
        <div className="card">
          <h3>New location</h3>
          <label>Code (zone-aisle-shelf-position)</label>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. A-01-03-01" />
          <p className="muted">Coordinates are derived from the code (aisle → x, shelf → y, position → z). Example: {buildLocationCode('A', 1, 3, 1)}</p>
          <div className="toolbar" style={{ marginTop: 12 }}><button className="btn primary" onClick={submitLocation}>Add location</button></div>
        </div>
      </div>

      <h2>Recent movements</h2>
      {movements.length === 0 ? <p className="muted">No movements yet.</p> : (
        <table><thead><tr><th>When</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th><th>BOL</th><th>RR</th><th>By</th></tr></thead>
          <tbody>{movements.map((m) => (
            <tr key={m.id}><td>{(m.createdAt ?? '').slice(0, 19).replace('T', ' ')}</td><td>{m.type}</td><td>{m.sku} — {m.itemName}</td><td>{m.quantity}</td><td>{m.fromLocationCode ?? '—'}</td><td>{m.toLocationCode ?? '—'}</td><td>{m.bolNumber ?? '—'}</td><td>{m.rrNumber || '—'}</td><td>{m.user || '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
