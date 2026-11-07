import { useState } from 'react';
import { api } from '../api';
import type { AppSettings } from '../../shared/types';

const STEPS = ['Company', 'BOL numbering', 'Units & formats', 'Printer', 'Templates & backups', 'Theme'];

export default function SetupWizard({ settings, onDone }: { settings: AppSettings; onDone: (s: AppSettings) => void }) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<AppSettings>(settings);
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string }>>([]);
  const [error, setError] = useState('');

  const loadPrinters = async () => {
    try {
      setPrinters(await api.printersList());
    } catch {
      setPrinters([]);
    }
  };

  const next = () => setStep((v) => Math.min(v + 1, STEPS.length - 1));
  const back = () => setStep((v) => Math.max(v - 1, 0));

  const finish = () => {
    if (!s.company.name.trim()) {
      setError('Company name is required to finish setup.');
      return;
    }
    onDone({ ...s, setupComplete: true });
  };

  return (
    <div className="main" style={{ maxWidth: 720, margin: '40px auto' }}>
      <h1>Welcome to {s.brandName}</h1>
      <p className="sub">First-run setup — a few quick choices. You can change all of these later in Settings.</p>
      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} className={i === step ? 'on' : ''}>{i + 1}. {label}</span>
        ))}
      </div>
      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card">
          <h2>Company</h2>
          <label>Brand name (shown in the app)</label>
          <input value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} />
          <label>Company name *</label>
          <input value={s.company.name} onChange={(e) => setS({ ...s, company: { ...s.company, name: e.target.value } })} />
          <label>Company address</label>
          <input value={s.company.address} onChange={(e) => setS({ ...s, company: { ...s.company, address: e.target.value } })} />
          <div className="form-row">
            <div><label>Phone</label><input value={s.company.phone} onChange={(e) => setS({ ...s, company: { ...s.company, phone: e.target.value } })} /></div>
            <div><label>Email</label><input value={s.company.email} onChange={(e) => setS({ ...s, company: { ...s.company, email: e.target.value } })} /></div>
          </div>
          <div className="form-row">
            <div><label>Website</label><input value={s.company.website ?? ''} onChange={(e) => setS({ ...s, company: { ...s.company, website: e.target.value } })} /></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2>BOL numbering</h2>
          <label>Prefix</label>
          <input value={s.numbering.prefix} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, prefix: e.target.value } })} />
          <label>First number</label>
          <input type="number" min={1} value={s.numbering.nextNumber} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, nextNumber: parseInt(e.target.value, 10) || 1 } })} />
          <label>Numbering mode</label>
          <select value={s.numbering.mode} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, mode: e.target.value as 'global' | 'per-template' } })}>
            <option value="global">Global (one sequence for all templates)</option>
            <option value="per-template">Per template</option>
          </select>
          <p className="muted">First BOL will be: {s.numbering.prefix}{String(s.numbering.nextNumber).padStart(s.numbering.padLength, '0')}</p>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Units &amp; formats</h2>
          <label>Units</label>
          <select value={s.units} onChange={(e) => setS({ ...s, units: e.target.value as 'imperial' | 'metric' })}>
            <option value="imperial">Imperial (lb)</option>
            <option value="metric">Metric (kg)</option>
          </select>
          <label>Date format</label>
          <select value={s.dateFormat} onChange={(e) => setS({ ...s, dateFormat: e.target.value })}>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          </select>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2>Printer</h2>
          <button className="btn" onClick={loadPrinters}>Detect printers</button>
          <label>Default printer</label>
          <select value={s.print.defaultPrinter ?? ''} onChange={(e) => setS({ ...s, print: { ...s.print, defaultPrinter: e.target.value || undefined } })}>
            <option value="">System default</option>
            {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
          </select>
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
          </div>
          <p className="muted">Label format: NIIMBOT RW403B 4×6 is available as an option in Settings, marked UNTESTED — it needs a driver test on a Windows PC with the printer attached.</p>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h2>Templates &amp; backups</h2>
          <p>7 base templates are ready: <strong>Warehouse</strong> (default), <strong>Delivery</strong>, Standard, Return, Transfer, Pickup, and Custom. Each is configurable in Settings → Templates.</p>
          <label className="check-row"><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={s.backups.autoBackup} onChange={(e) => setS({ ...s, backups: { ...s.backups, autoBackup: e.target.checked } })} /> Remind me about backups</span></label>
          <label>Backup reminder interval (days)</label>
          <input type="number" min={1} max={90} value={s.backups.intervalDays} onChange={(e) => setS({ ...s, backups: { ...s.backups, intervalDays: parseInt(e.target.value, 10) || 7 } })} />
        </div>
      )}

      {step === 5 && (
        <div className="card">
          <h2>Theme</h2>
          <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as 'light' | 'dark' })}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="muted">You are ready. Your data is stored locally on this computer (user data folder) and your BOLs are numbered consecutively from {s.numbering.prefix}{String(s.numbering.nextNumber).padStart(s.numbering.padLength, '0')}.</p>
        </div>
      )}

      <div className="toolbar">
        {step > 0 && <button className="btn" onClick={back}>Back</button>}
        {step < STEPS.length - 1 && <button className="btn primary" onClick={next}>Next</button>}
        {step === STEPS.length - 1 && <button className="btn primary" onClick={finish}>Finish setup</button>}
      </div>
    </div>
  );
}
