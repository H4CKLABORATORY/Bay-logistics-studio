// 3D warehouse map (Phase 5): a real interactive Three.js scene built from
// live SQLite rows — warehouse floor, shelf slots as boxes, pallets and boxes
// as coloured meshes at their stored x/y/z. Click a location to select it
// and move stock to another location from the 3D view. Lazy-loaded by App
// so the main bundle stays fast. If WebGL is unavailable the page shows a
// clear error state instead of crashing the app.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../api';
import { buildSceneModel, isOccupied, validatePosition } from '../../shared/warehouse3d';
import type { InvLocation, InvMovement, InvStockRow, Warehouse } from '../../shared/types';

interface Selected {
  location: InvLocation & { stockQty: number };
  stock: InvStockRow[];
}

export default function Warehouse3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [webglOk, setWebglOk] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [locations, setLocations] = useState<Array<InvLocation & { stockQty: number }>>([]);
  const [notice, setNotice] = useState('');
  const [moveItemId, setMoveItemId] = useState('');
  const [moveQty, setMoveQty] = useState(1);
  const [moveToId, setMoveToId] = useState('');
  const selectedRef = useRef<Selected | null>(null);
  selectedRef.current = selected;
  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const whs = await api.warehouseList();
        if (cancelled) return;
        setWarehouses(whs);
        const wh = whs[0];
        if (!wh) { setError('No warehouse configured.'); return; }
        const [locs, pallets, boxes] = await Promise.all([
          api.inventoryLocations(wh.id), api.inventoryPallets(), api.inventoryBoxes(),
        ]);
        if (cancelled) return;
        setLocations(locs);
        // WebGL availability check — guarded, never throws.
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (!gl) { setWebglOk(false); return; }
        const model = buildSceneModel(
          { widthM: wh.widthM, depthM: wh.depthM, heightM: wh.heightM },
          locs, pallets, boxes,
        );
        const mount = mountRef.current;
        if (!mount) return;
        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
          setWebglOk(false);
          return;
        }
        renderer.setSize(mount.clientWidth || 800, 460);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e2329);
        const camera = new THREE.PerspectiveCamera(55, (mount.clientWidth || 800) / 460, 0.1, 500);
        camera.position.set(model.dims.widthM * 0.9, model.dims.heightM * 1.6, model.dims.depthM * 1.1);
        camera.lookAt(model.dims.widthM / 2, 0, model.dims.depthM / 2);
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(20, 30, 10);
        scene.add(dir);

        // Floor
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(model.dims.widthM, model.dims.depthM),
          new THREE.MeshStandardMaterial({ color: 0x3a4552 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(model.dims.widthM / 2, 0, model.dims.depthM / 2);
        scene.add(floor);

        const clickable: THREE.Mesh[] = [];
        const locByMesh = new Map<number, InvLocation & { stockQty: number }>();
        for (const l of model.locations) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 1.0, 1.6),
            new THREE.MeshStandardMaterial({ color: l.occupied ? model.legend.occupied : model.legend.free }),
          );
          mesh.position.set(l.x, l.y, l.z);
          mesh.userData.locationId = l.id;
          scene.add(mesh);
          clickable.push(mesh);
          const full = locs.find((x) => x.id === l.id);
          if (full) locByMesh.set(mesh.id, full);
        }
        for (const p of model.pallets) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.25, 1.2),
            new THREE.MeshStandardMaterial({ color: model.legend.pallet }),
          );
          mesh.position.set(p.x, Math.max(p.y, 0.15), p.z);
          scene.add(mesh);
        }
        for (const b of model.boxes) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            new THREE.MeshStandardMaterial({ color: model.legend.box }),
          );
          mesh.position.set(b.x, Math.max(b.y, 0.3), b.z);
          scene.add(mesh);
        }

        // Simple drag-to-orbit + wheel zoom (no OrbitControls dependency).
        let yaw = 0; let dragging = false; let lastX = 0; let lastY = 0; let dist = 42;
        const updateCamera = () => {
          const cx = model.dims.widthM / 2; const cz = model.dims.depthM / 2;
          camera.position.set(cx + Math.sin(yaw) * dist, model.dims.heightM * 1.4, cz + Math.cos(yaw) * dist);
          camera.lookAt(cx, 0.5, cz);
        };
        updateCamera();
        const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          yaw += (e.clientX - lastX) * 0.005;
          dist = Math.max(10, Math.min(90, dist + (e.clientY - lastY) * 0.1));
          lastX = e.clientX; lastY = e.clientY;
          updateCamera();
        };
        const onUp = () => { dragging = false; };
        const onWheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(10, Math.min(90, dist + e.deltaY * 0.02)); updateCamera(); };
        renderer.domElement.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

        // Click to select a location.
        const raycaster = new THREE.Raycaster();
        const onClick = async (e: MouseEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
          );
          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObjects(clickable);
          if (!hits.length) return;
          const loc = locByMesh.get(hits[0].object.id);
          if (!loc) return;
          try {
            const st = await api.inventoryStock(loc.id);
            setSelected({ location: loc, stock: st });
            setMoveItemId(st[0] ? String(st[0].itemId) : '');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        };
        renderer.domElement.addEventListener('click', onClick);

        let raf = 0;
        const animate = () => { raf = requestAnimationFrame(animate); renderer.render(scene, camera); };
        animate();
        return () => {
          cancelAnimationFrame(raf);
          renderer.domElement.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          renderer.domElement.removeEventListener('wheel', onWheel);
          renderer.domElement.removeEventListener('click', onClick);
          renderer.dispose();
          mount.removeChild(renderer.domElement);
        };
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const doMoveFrom3D = async () => {
    if (!selected) return;
    setError(''); setNotice('');
    const target = locations.find((l) => l.id === Number(moveToId));
    if (!target) { setError('Choose a destination location.'); return; }
    if (target.id === selected.location.id) { setError('Destination must be different from the source location.'); return; }
    // Validate the target position exists and is free/compatible: it must be
    // inside the warehouse and not already occupied by different stock.
    const wh = warehouses[0];
    const posErrors = wh ? validatePosition({ x: target.x, y: target.y, z: target.z }, { widthM: wh.widthM, depthM: wh.depthM, heightM: wh.heightM }) : [];
    if (posErrors.length) { setError(posErrors.join(' ')); return; }
    const occupants = locations.filter((l) => l.id !== target.id && l.stockQty > 0).map((l) => ({ id: l.id!, code: l.code, x: l.x, y: l.y, z: l.z }));
    if (isOccupied({ x: target.x, y: target.y, z: target.z }, occupants) && target.stockQty > 0) {
      setError(`Destination ${target.code} already holds stock at that position.`);
      return;
    }
    try {
      const mv: InvMovement = await api.inventoryMovementCreate({
        type: 'move', itemId: Number(moveItemId), quantity: moveQty,
        fromLocationId: selected.location.id!, toLocationId: target.id!,
      });
      setNotice(`Moved ${mv.quantity} x ${mv.sku} from ${selected.location.code} to ${target.code}.`);
      const locs = await api.inventoryLocations(wh?.id);
      setLocations(locs);
      const st = await api.inventoryStock(selected.location.id!);
      setSelected({ location: locs.find((l) => l.id === selected.location.id) ?? selected.location, stock: st });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!webglOk) {
    return (
      <div>
        <h1>3D Warehouse</h1>
        <div className="error">3D view is unavailable: this computer has no WebGL support. The rest of the app still works — use the Inventory page for stock and moves.</div>
      </div>
    );
  }

  return (
    <div>
      <h1>3D Warehouse</h1>
      <p className="sub">Live map from the database — drag to orbit, scroll to zoom, click a shelf slot to select it. Amber = occupied, teal = free, purple = pallet, blue = box.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}
      <div className="card">
        <p className="muted">
          {warehouses[0] ? `${warehouses[0].name}: ${warehouses[0].widthM} x ${warehouses[0].depthM} x ${warehouses[0].heightM} m · ${locations.length} locations` : 'Loading warehouse…'}
        </p>
        <div ref={mountRef} style={{ width: '100%', height: 460, borderRadius: 8, overflow: 'hidden' }} />
      </div>
      {selected && (
        <div className="card">
          <h3>Selected: {selected.location.code}</h3>
          <p className="muted">Position ({selected.location.x}, {selected.location.y}, {selected.location.z}) m · {selected.stock.length ? '' : 'empty'}</p>
          {selected.stock.map((s) => <p key={s.id}>{s.sku} — {s.itemName}: {s.quantity}</p>)}
          {selected.stock.length > 0 && (
            <div className="form-row">
              <div><label>Item to move</label>
                <select value={moveItemId} onChange={(e) => setMoveItemId(e.target.value)}>
                  {selected.stock.map((s) => <option key={s.itemId} value={s.itemId}>{s.sku} — {s.itemName} ({s.quantity})</option>)}
                </select>
              </div>
              <div><label>Quantity</label><input type="number" min={1} value={moveQty} onChange={(e) => setMoveQty(Number(e.target.value))} /></div>
              <div><label>Destination location</label>
                <select value={moveToId} onChange={(e) => setMoveToId(e.target.value)}>
                  <option value="">— select —</option>
                  {locations.filter((l) => l.id !== selected.location.id).map((l) => (
                    <option key={l.id} value={l.id}>{l.code} ({l.stockQty} in stock)</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {selected.stock.length > 0 && (
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={doMoveFrom3D}>Move from 3D view</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
