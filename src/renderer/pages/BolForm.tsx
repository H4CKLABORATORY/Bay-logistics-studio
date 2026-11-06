import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { blankBol, type BolDocument, type BolItem, type BolTemplateKey } from '../../shared/types';
import { validateBol } from '../../shared/validation';
import { parseEmailToBol, parseItemLine } from '../../shared/emailParser';
import { getTemplate } from '../../shared/templates';

const TEMPLATES: BolTemplateKey[] = ['warehouse', 'delivery', 'standard', 'return', 'transfer', 'pickup', 'custom'];

export default function BolForm({
  bolId,
  template,
  onDone,
  onCancel,
}: {
  bolId?: number;
  template?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [doc, setDoc] = useState<BolDocument>(() => blankBol((template as BolTemplateKey) || 'warehouse'));
  const [loading, setLoading] = useState(!!bolId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autosaveState, setAutosaveState] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string; isDefault?: boolean }>>([]);
  const [printCopies, setPrintCopies] = useState(1);
  const [printSilent, setPrintSilent] = useState(false);
  const [printerName, setPrinterName] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const isNew = bolId === undefined;
  const tpl = getTemplate(doc.template);

  useEffect(() => {
    if (!bolId) {
      // New BOL: allocate the next consecutive number (reserves it in settings).
      api.bolNextNumber()
        .then((n) => setDoc((d) => ({ ...d, bolNumber: n })))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }
    api.bolGet(bolId)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bolId]);

  useEffect(() => {
    api.printersList().then(setPrinters).catch(() => setPrinters([]));
  }, []);

  // Debounced autosave for existing BOLs (800 ms after the last edit).
  useEffect(() => {
    if (isNew || loading) return;
    setAutosaveState('Editing…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const errors = validateBol(docRef.current);
      if (errors.length) {
        setAutosaveState('Not saved — fix validation errors.');
        return;
      }
      try {
        setAutosaveState('Saving…');
        await api.bolUpdate(bolId!, docRef.current);
        setAutosaveState(`Autosaved ${new Date().toLocaleTimeString()}.`);
      } catch (e) {
        setAutosaveState(`Autosave failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const set = <K extends keyof BolDocument>(key: K, value: BolDocument[K]) =>
    setDoc((d) => ({ ...d, [key]: value }));

  const setItem = (idx: number, patch: Partial<BolItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const addItem = () =>
    setDoc((d) => ({ ...d, items: [...d.items, { quantity: 1, modelDescription: '', rrNumber: '', weight: '' }] }));

  const removeItem = (idx: number) =>
    setDoc((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    const errors = validateBol(doc);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isNew) await api.bolCreate(doc);
      else await api.bolUpdate(bolId!, doc);
      setNotice('Saved.');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const applyPaste = () => {
    const parsed = parseEmailToBol(pasteText, doc.template);
    setDoc((d) => ({ ...d, ...parsed, bolNumber: d.bolNumber, items: parsed.items?.length ? parsed.items : d.items }));
    setShowPaste(false);
    setNotice('Pasted email parsed into the form — review the fields before saving.');
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text) as Partial<BolDocument>;
        setDoc((d) => ({ ...d, ...parsed, bolNumber: d.bolNumber }));
        setNotice('JSON imported — review before saving.');
      } else {
        // CSV: quantity,model/description,rr #,weight (one item per line, header optional)
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const items: BolItem[] = [];
        for (const line of lines) {
          if (/^quantity/i.test(line)) continue;
          const it = parseItemLine(line.replace(/,/g, ' | '));
          if (it && it.modelDescription) items.push(it);
        }
        if (!items.length) throw new Error('No item lines found in the CSV.');
        setDoc((d) => ({ ...d, items }));
        setNotice(`Imported ${items.length} item(s) from CSV — review before saving.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openPreview = async () => {
    if (!doc.id) {
      setError('Save the BOL first, then preview the PDF.');
      return;
    }
    try {
      const base64 = await api.bolPdfPreview(doc.id);
      setPreviewUrl(`data:application/pdf;base64,${base64}`);
      setShowPreview(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async () => {
    if (!doc.id) {
      setError('Save the BOL first, then export the PDF.');
      return;
    }
    try {
      const res = await api.bolExportPdf(doc.id);
      setNotice(res.saved ? `PDF saved to ${res.path}` : 'PDF generated (save dialog cancelled).');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doPrint = async () => {
    if (!doc.id) {
      setError('Save the BOL first, then print.');
      return;
    }
    try {
      await api.bolPrint(doc.id, { copies: printCopies, silent: printSilent, printerName: printerName || undefined });
      setNotice('Sent to printer.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div><p className="muted">Loading BOL…</p></div>;

  return (
    <div>
      <h1>{isNew ? 'New BOL' : `BOL ${doc.bolNumber}`}</h1>
      <p className="sub">
        Template: <strong>{tpl.name}</strong> — {tpl.description}
        {!isNew && autosaveState && <span className="muted"> · {autosaveState}</span>}
      </p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="toolbar">
        <button className="btn" onClick={() => setShowPaste(true)}>Paste from email</button>
        <label className="btn" style={{ margin: 0, cursor: 'pointer' }}>
          Import CSV / JSON
          <input type="file" accept=".csv,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </label>
        <button className="btn" onClick={openPreview}>Preview PDF</button>
        <button className="btn" onClick={doExport}>Export PDF</button>
      </div>

      <div className="card">
        <div className="form-row">
          <div>
            <label>Template</label>
            <select value={doc.template} onChange={(e) => set('template', e.target.value as BolTemplateKey)}>
              {TEMPLATES.map((t) => <option key={t} value={t}>{getTemplate(t).name}</option>)}
            </select>
          </div>
          <div>
            <label>BOL NUMBER *</label>
            <input value={doc.bolNumber} onChange={(e) => set('bolNumber', e.target.value)} />
          </div>
          <div>
            <label>DATE *</label>
            <input type="date" value={doc.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label>JOB #</label>
            <input value={doc.jobNumber} onChange={(e) => set('jobNumber', e.target.value)} />
          </div>
          <div>
            <label>SHIP FROM *</label>
            <input value={doc.shipFrom} onChange={(e) => set('shipFrom', e.target.value)} />
          </div>
          <div>
            <label>DELIVERY ADDRESS *</label>
            <input value={doc.deliveryAddress} onChange={(e) => set('deliveryAddress', e.target.value)} />
          </div>
          <div>
            <label>REQUEST BY *</label>
            <input value={doc.requestBy} onChange={(e) => set('requestBy', e.target.value)} />
          </div>
          <div>
            <label>TRUCK/TRAILER</label>
            <input value={doc.truckTrailer} onChange={(e) => set('truckTrailer', e.target.value)} />
          </div>
          <div>
            <label>THIRD PARTY FREIGHT CHARGES BILL TO</label>
            <input value={doc.billTo} onChange={(e) => set('billTo', e.target.value)} />
          </div>
          <div>
            <label>REQUESTED DELIVERY</label>
            <input value={doc.requestedDelivery} onChange={(e) => set('requestedDelivery', e.target.value)} />
          </div>
        </div>
        <label>DELIVERY NOTES</label>
        <textarea rows={3} value={doc.deliveryNotes} onChange={(e) => set('deliveryNotes', e.target.value)} />
      </div>

      <h2>Items — QUANTITY | MODEL/DESCRIPTION | RR # | WEIGHT</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>QTY</th><th>MODEL/DESCRIPTION</th><th>RR #</th><th>WEIGHT</th>
              {tpl.hasWarehouseChecks && <><th>FOUND</th><th>PICKED</th><th>LOADED</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td><input type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, { quantity: parseInt(e.target.value, 10) || 0 })} style={{ width: 70 }} /></td>
                <td><input value={it.modelDescription} onChange={(e) => setItem(i, { modelDescription: e.target.value })} /></td>
                <td><input value={it.rrNumber} onChange={(e) => setItem(i, { rrNumber: e.target.value })} /></td>
                <td><input value={it.weight} onChange={(e) => setItem(i, { weight: e.target.value })} placeholder="e.g. 150 lbs" /></td>
                {tpl.hasWarehouseChecks && (
                  <>
                    <td><input type="checkbox" checked={!!it.found} onChange={(e) => setItem(i, { found: e.target.checked })} /></td>
                    <td><input type="checkbox" checked={!!it.picked} onChange={(e) => setItem(i, { picked: e.target.checked })} /></td>
                    <td><input type="checkbox" checked={!!it.loaded} onChange={(e) => setItem(i, { loaded: e.target.checked })} /></td>
                  </>
                )}
                <td><button className="btn btn-sm danger" onClick={() => removeItem(i)} disabled={doc.items.length <= 1}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}><button className="btn" onClick={addItem}>+ Add item</button></div>
      </div>

      {tpl.hasInternalSignatures && (
        <div className="card">
          <h3>Internal signatures (warehouse — no customer receipt)</h3>
          <div className="form-row">
            <div><label>FOUND BY</label><input value={doc.foundBy ?? ''} onChange={(e) => set('foundBy', e.target.value)} /></div>
            <div><label>CHECKED BY</label><input value={doc.checkedBy ?? ''} onChange={(e) => set('checkedBy', e.target.value)} /></div>
            <div><label>LOADED BY</label><input value={doc.loadedBy ?? ''} onChange={(e) => set('loadedBy', e.target.value)} /></div>
          </div>
        </div>
      )}

      {tpl.hasDeliveryReceipt && (
        <div className="card">
          <h3>Delivery receipt</h3>
          <div className="form-row">
            <div><label>RECEIVER PRINTED NAME</label><input value={doc.receiverName ?? ''} onChange={(e) => set('receiverName', e.target.value)} /></div>
            <div><label>DATE</label><input type="date" value={doc.receiverDate ?? ''} onChange={(e) => set('receiverDate', e.target.value)} /></div>
            <div><label>DRIVER SIGNATURE</label><input value={doc.driverSignature ?? ''} onChange={(e) => set('driverSignature', e.target.value)} placeholder="Type name as signature" /></div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Print</h3>
        <div className="toolbar">
          <select value={printerName} onChange={(e) => setPrinterName(e.target.value)}>
            <option value="">Default printer</option>
            {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}{p.isDefault ? ' (default)' : ''}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none' }}>
            Copies <input type="number" min={1} max={99} value={printCopies} onChange={(e) => setPrintCopies(parseInt(e.target.value, 10) || 1)} style={{ width: 64 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none' }}>
            <input type="checkbox" checked={printSilent} onChange={(e) => setPrintSilent(e.target.checked)} /> Silent print
          </label>
          <button className="btn" onClick={doPrint} disabled={!doc.id}>Print</button>
        </div>
        {printers.length === 0 && <p className="muted">No printers detected on this computer yet. Printing will report an error instead of failing silently.</p>}
      </div>

      <div className="toolbar">
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create BOL' : 'Save'}</button>
        <button className="btn" onClick={onCancel}>Back to list</button>
      </div>

      {showPaste && (
        <div className="modal-backdrop" onClick={() => setShowPaste(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Paste from email</h2>
            <p className="muted">Paste the raw email text. BOL fields and item lines are parsed into the form — nothing is saved until you review and press Save.</p>
            <textarea rows={14} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'BOL NUMBER: BOL-00042\nDATE: 2026-11-06\nJOB #: 8812\nSHIP FROM: Warehouse A\nDELIVERY ADDRESS: 123 Main St\nREQUEST BY: Jane\nITEMS:\n2 x CRANE HOOK 5T RR# 9912 150 lbs'} />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={applyPaste} disabled={!pasteText.trim()}>Parse into form</button>
              <button className="btn" onClick={() => setShowPaste(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="modal-backdrop" onClick={() => setShowPreview(false)}>
          <div className="modal" style={{ width: 'min(860px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
            <h2>PDF preview — {doc.bolNumber}</h2>
            <iframe className="pdf-preview" src={previewUrl} title="BOL PDF preview" />
            <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setShowPreview(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
