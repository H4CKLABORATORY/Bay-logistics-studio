import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CatalogKind, CatalogRecord } from '../../shared/types';

const KINDS: Array<{ kind: CatalogKind; label: string; fields: Array<{ key: string; label: string }> }> = [
  { kind: 'companies', label: 'Companies', fields: [{ key: 'name', label: 'Name' }, { key: 'address', label: 'Address' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }] },
  { kind: 'customers', label: 'Customers', fields: [{ key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }] },
  { kind: 'projects', label: 'Projects', fields: [{ key: 'name', label: 'Name' }, { key: 'customer_id', label: 'Customer ID' }, { key: 'description', label: 'Description' }] },
  { kind: 'addresses', label: 'Addresses', fields: [{ key: 'label', label: 'Label' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP' }, { key: 'notes', label: 'Notes' }] },
  { kind: 'requesters', label: 'Requesters', fields: [{ key: 'name', label: 'Name' }, { key: 'company', label: 'Company' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }] },
  { kind: 'carriers', label: 'Carriers', fields: [{ key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }] },
  { kind: 'items', label: 'Items', fields: [{ key: 'model', label: 'Model' }, { key: 'description', label: 'Description' }, { key: 'default_weight', label: 'Default weight' }] },
  { kind: 'materials', label: 'Materials', fields: [{ key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }, { key: 'unit', label: 'Unit' }, { key: 'weight', label: 'Weight' }] },
];

export default function Catalogs() {
  const [kind, setKind] = useState<CatalogKind>('customers');
  const [rows, setRows] = useState<CatalogRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<CatalogRecord | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const def = KINDS.find((k) => k.kind === kind)!;

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.catalogList(kind, search));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const startNew = () => {
    setEditing(null);
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, ''])));
  };

  const startEdit = (r: CatalogRecord) => {
    setEditing(r);
    setForm({ ...r });
  };

  const save = async () => {
    try {
      if (editing?.id) {
        await api.catalogUpdate(kind, editing.id, form);
        setNotice('Updated.');
      } else {
        await api.catalogCreate(kind, form);
        setNotice('Created.');
      }
      setForm({});
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (r: CatalogRecord) => {
    if (!window.confirm(`Delete this ${def.label.slice(0, -1).toLowerCase()} record?`)) return;
    try {
      await api.catalogDelete(kind, r.id as number);
      setNotice('Deleted.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h1>Catalogs</h1>
      <p className="sub">Reusable companies, customers, projects, addresses, requesters, carriers, items, and materials.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}
      <div className="toolbar">
        {KINDS.map((k) => (
          <button key={k.kind} className={`btn ${k.kind === kind ? 'primary' : ''}`} onClick={() => { setKind(k.kind); setForm({}); setEditing(null); }}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input placeholder={`Search ${def.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn primary" onClick={startNew}>+ New {def.label.slice(0, -1)}</button>
      </div>

      {Object.keys(form).length > 0 && (
        <div className="card">
          <h3>{editing ? 'Edit' : 'New'} {def.label.slice(0, -1)}</h3>
          <div className="form-row">
            {def.fields.map((f) => (
              <div key={f.key}>
                <label>{f.label}</label>
                <input value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={save}>Save</button>
            <button className="btn" onClick={() => { setForm({}); setEditing(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card"><p className="empty">No {def.label.toLowerCase()} yet.</p></div>
      ) : (
        <table>
          <thead>
            <tr>
              {def.fields.map((f) => <th key={f.key}>{f.label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id as number}>
                {def.fields.map((f) => <td key={f.key}>{String(r[f.key] ?? '')}</td>)}
                <td>
                  <button className="btn btn-sm" onClick={() => startEdit(r)}>Edit</button>
                  <button className="btn btn-sm danger" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
