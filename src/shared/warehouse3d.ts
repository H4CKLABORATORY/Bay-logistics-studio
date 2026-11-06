// 3D warehouse — pure coordinate math + scene-model builder.
// No Three.js import here, so Vitest can run this headless without WebGL.
// The renderer (Warehouse3D.tsx) turns the plain scene model into real
// THREE.Mesh objects; the math below is what the tests cover.
//
// Coordinate system: metres, origin at one floor corner (0,0,0).
// x = along warehouse width, z = along depth, y = up (height).
// A location's stored (x, y, z) is the centre of its shelf slot.

export interface WarehouseDims {
  widthM: number;
  depthM: number;
  heightM: number;
}

export const DEFAULT_WAREHOUSE_DIMS: WarehouseDims = { widthM: 30, depthM: 20, heightM: 6 };

/** Metres per grid cell when snapping a free point to the floor grid. */
export const CELL_SIZE_M = 1.2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GridCell {
  col: number; // along width (x)
  row: number; // along depth (z)
  level: number; // vertical shelf level (y)
}

export function gridToWorld(cell: GridCell, dims: WarehouseDims): Vec3 {
  return {
    x: (cell.col + 0.5) * CELL_SIZE_M,
    y: (cell.level + 0.5) * CELL_SIZE_M,
    z: (cell.row + 0.5) * CELL_SIZE_M,
  };
}

export function worldToGrid(p: Vec3): GridCell {
  return {
    col: Math.floor(p.x / CELL_SIZE_M),
    row: Math.floor(p.z / CELL_SIZE_M),
    level: Math.floor(p.y / CELL_SIZE_M),
  };
}

/** Is a point inside the warehouse volume (with a small epsilon)? */
export function isInsideWarehouse(p: Vec3, dims: WarehouseDims): boolean {
  return p.x >= 0 && p.x <= dims.widthM && p.z >= 0 && p.z <= dims.depthM && p.y >= 0 && p.y <= dims.heightM;
}

export function validatePosition(p: Partial<Vec3>, dims: WarehouseDims): string[] {
  const errors: string[] = [];
  for (const k of ['x', 'y', 'z'] as const) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k] as number)) errors.push(`Position ${k} must be a number.`);
  }
  if (errors.length) return errors;
  if (!isInsideWarehouse(p as Vec3, dims)) {
    errors.push(`Position (${p.x}, ${p.y}, ${p.z}) is outside the warehouse (${dims.widthM} x ${dims.depthM} x ${dims.heightM} m).`);
  }
  return errors;
}

export interface Occupant {
  id: number;
  code: string;
  x: number;
  y: number;
  z: number;
}

/** True when `candidate` is within `minDistanceM` of any existing occupant
 *  (same floor level counts; different shelf levels are separate slots). */
export function isOccupied(candidate: Vec3, occupants: Occupant[], minDistanceM = 0.6): boolean {
  return occupants.some((o) => {
    const dy = Math.abs(o.y - candidate.y);
    if (dy > 0.6) return false; // different shelf level: not the same slot
    const dx = o.x - candidate.x;
    const dz = o.z - candidate.z;
    return Math.hypot(dx, dz) < minDistanceM;
  });
}

export interface SceneLocation {
  id: number;
  code: string;
  x: number;
  y: number;
  z: number;
  occupied: boolean;
  stockQty: number;
}
export interface ScenePallet {
  id: number;
  code: string;
  x: number;
  y: number;
  z: number;
}
export interface SceneBox {
  id: number;
  code: string;
  x: number;
  y: number;
  z: number;
}
export interface SceneModel {
  dims: WarehouseDims;
  locations: SceneLocation[];
  pallets: ScenePallet[];
  boxes: SceneBox[];
  /** Colour key used by the renderer: occupied shelf = amber, free = teal. */
  legend: { occupied: string; free: string; pallet: string; box: string };
}

/** Build the plain scene model from DB rows. No renderer, no WebGL — this
 *  is what the headless smoke test exercises. */
export function buildSceneModel(
  dims: WarehouseDims,
  locations: Array<{ id: number; code: string; x: number; y: number; z: number; stockQty?: number }>,
  pallets: Array<{ id: number; code: string; x: number; y: number; z: number }>,
  boxes: Array<{ id: number; code: string; x: number; y: number; z: number }>,
): SceneModel {
  return {
    dims,
    locations: locations.map((l) => ({
      id: l.id,
      code: l.code,
      x: l.x,
      y: l.y,
      z: l.z,
      occupied: (l.stockQty ?? 0) > 0,
      stockQty: l.stockQty ?? 0,
    })),
    pallets: pallets.map((p) => ({ id: p.id, code: p.code, x: p.x, y: p.y, z: p.z })),
    boxes: boxes.map((b) => ({ id: b.id, code: b.code, x: b.x, y: b.y, z: b.z })),
    legend: { occupied: '#d97706', free: '#0d9488', pallet: '#7c3aed', box: '#2563eb' },
  };
}
