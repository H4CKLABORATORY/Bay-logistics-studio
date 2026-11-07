import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AppSettings } from '../../shared/types';
import { BASE_TEMPLATES } from '../../shared/templates';

export default function Settings({ settings, onSaved }: { settings: AppSettings; onSaved: (s: AppSettings) => void }) {
  const [s, setS] = useState<AppSettings>(settings);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string; isDefault?: boolean }>>([]);

  useEffect(() => {
    api.templatesList().then(setTemplates).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api.printersList().then(setPrinters).catch(() => setPrinters([]));
  }, []);

  const save = async () => {
    try {
      await api.settingsSet(s);
      onSaved(s);
      setNotice('Settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doBackup = async () => {
    try {
      const res = await api.backupExport();
      setNotice(res.path ? `Backup saved to ${res.path}` : 'Backup cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshPrinters = async () => {
    try {
      const list = await api.printersList();
      setPrinters(list);
      setNotice(list.length ? `Found ${list.length} printer${list.length === 1 ? '' : 's'}.` : 'No printers found on this computer.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doRestore = async () => {
    if (!window.confirm('Restore replaces ALL data (BOLs, catalogs, settings) with the backup file. Continue?')) return;
    try {
      const res = await api.backupRestore();
      setNotice(res.restored ? 'Backup restored. Restart the app to reload all data.' : 'Restore cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <p className="sub">Brand, company, BOL numbering, print, backups, theme, and templates.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="card">
        <h2>Brand &amp; company</h2>
        <div className="form-row">
          <div><label>Brand name (shown in the app &amp; PDFs)</label><input value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} /></div>
          <div><label>Company name</label><input value={s.company.name} onChange={(e) => setS({ ...s, company: { ...s.company, name: e.target.value } })} /></div>
          <div><label>Company address</label><input value={s.company.address} onChange={(e) => setS({ ...s, company: { ...s.company, address: e.target.value } })} /></div>
          <div><label>Company phone</label><input value={s.company.phone} onChange={(e) => setS({ ...s, company: { ...s.company, phone: e.target.value } })} /></div>
          <div><label>Company email</label><input value={s.company.email} onChange={(e) => setS({ ...s, company: { ...s.company, email: e.target.value } })} /></div>
          <div><label>Company website</label><input value={s.company.website ?? ''} onChange={(e) => setS({ ...s, company: { ...s.company, website: e.target.value } })} /></div>
          <div><label>Units</label>
            <select value={s.units} onChange={(e) => setS({ ...s, units: e.target.value as 'imperial' | 'metric' })}>
              <option value="imperial">Imperial (lb)</option>
              <option value="metric">Metric (kg)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>BOL numbering</h2>
        <div className="form-row">
          <div><label>Prefix</label><input value={s.numbering.prefix} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, prefix: e.target.value } })} /></div>
          <div><label>Next number</label><input type="number" min={1} value={s.numbering.nextNumber} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, nextNumber: parseInt(e.target.value, 10) || 1 } })} /></div>
          <div><label>Zero padding</label><input type="number" min={1} max={8} value={s.numbering.padLength} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, padLength: parseInt(e.target.value, 10) || 5 } })} /></div>
          <div><label>Numbering mode</label>
            <select value={s.numbering.mode} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, mode: e.target.value as 'global' | 'per-template' } })}>
              <option value="global">Global (one sequence for all templates)</option>
              <option value="per-template">Per template (separate sequence per template)</option>
            </select>
          </div>
        </div>
        <p className="muted">Example next BOL: {s.numbering.prefix}{String(s.numbering.nextNumber).padStart(s.numbering.padLength, '0')}</p>
      </div>

      <div className="card">
        <h2>Print</h2>
        <div className="form-row">
          <div><label>Paper size</label>
            <select value={s.print.paperSize} onChange={(e) => setS({ ...s, print: { ...s.print, paperSize: e.target.value as 'Letter' | 'A4' } })}>
              <option value="Letter">Letter (default)</option>
              <option value="A4">A4</option>
            </select>
          </div>
          <div><label>Orientation</label>
            <select value={s.print.orientation} onChange={(e) => setS({ ...s, print: { ...s.print, orientation: e.target.value as 'portrait' | 'landscape' } })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <div><label>Default copies</label><input type="number" min={1} max={99} value={s.print.copies} onChange={(e) => setS({ ...s, print: { ...s.print, copies: parseInt(e.target.value, 10) || 1 } })} /></div>
          <div><label>Default printer</label>
            <select value={s.print.defaultPrinter ?? ''} onChange={(e) => setS({ ...s, print: { ...s.print, defaultPrinter: e.target.value || undefined } })}>
              <option value="">System default</option>
              {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
            </select>
            <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={refreshPrinters}>Refresh printers</button>
          </div>
          <div><label>Margins (mm) — top / right / bottom / left</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <input key={side} type="number" min={0} max={50} value={s.print.marginsMm[side]} onChange={(e) => setS({ ...s, print: { ...s.print, marginsMm: { ...s.print.marginsMm, [side]: parseInt(e.target.value, 10) || 0 } } })} />
              ))}
            </div>
          </div>
          <div><label>Label format</label>
            <select value={s.print.labelFormat ?? 'none'} onChange={(e) => setS({ ...s, print: { ...s.print, labelFormat: e.target.value as 'none' | 'niimbot-rw403b-4x6-untested' } })}>
              <option value="none">None (full-page BOL only)</option>
              <option value="niimbot-rw403b-4x6-untested">NIIMBOT RW403B 4×6 label — UNTESTED, no driver test run</option>
            </select>
            <p className="muted">NIIMBOT RW403B support is prepared as a format option only. Real compatibility is NOT claimed — it needs a driver test on a Windows PC with the printer attached.</p>
          </div>
        </div>
        <label className="check-row"><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={s.print.silent} onChange={(e) => setS({ ...s, print: { ...s.print, silent: e.target.checked } })} /> Silent print by default (no dialog)</span></label>
      </div>

      <div className="card">
        <h2>Templates (7 base templates)</h2>
        {templates.length === 0 ? <p className="muted">Loading templates…</p> : (
          <table>
            <thead><tr><th>Key</th><th>Name</th><th>Warehouse checks</th><th>Internal signatures</th><th>Delivery receipt</th></tr></thead>
            <tbody>
              {templates.map((t) => {
                const base = BASE_TEMPLATES.find((b) => b.key === t.key);
                return (
                  <tr key={String(t.key)}>
                    <td>{String(t.key)}</td>
                    <td>{String(t.name)}{base ? ` — ${base.description}` : ''}</td>
                    <td>{t.has_warehouse_checks ? 'Yes' : 'No'}</td>
                    <td>{t.has_internal_signatures ? 'Yes' : 'No'}</td>
                    <td>{t.has_delivery_receipt ? 'Yes' : 'No'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted">Template field sets are stored in the database and editable via the templates API; the Warehouse and Delivery layouts are fixed to the specified field sets.</p>
      </div>

      <div className="card">
        <h2>Backup &amp; restore</h2>
        <p className="muted">Backups are JSON exports of the whole database (BOLs, catalogs, settings, history).</p>
        <div className="toolbar">
          <button className="btn" onClick={doBackup}>Export backup (.json)</button>
          <button className="btn danger" onClick={doRestore}>Restore from backup…</button>
        </div>
        <label className="check-row"><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={s.backups.autoBackup} onChange={(e) => setS({ ...s, backups: { ...s.backups, autoBackup: e.target.checked } })} /> Remind about backups</span></label>
      </div>

      <div className="card">
        <h2>Theme</h2>
        <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as 'light' | 'dark' })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <button className="btn primary" onClick={save}>Save settings</button>
    </div>
  );
}
