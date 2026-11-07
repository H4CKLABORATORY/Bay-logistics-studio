import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSceneModel, gridToWorld, isInsideWarehouse, isOccupied, validatePosition, worldToGrid, DEFAULT_WAREHOUSE_DIMS } from '../src/shared/warehouse3d';

const DIMS = DEFAULT_WAREHOUSE_DIMS; // 30 x 20 x 6 m

describe('warehouse 3D coordinate math', () => {
  it('grid <-> world round-trips', () => {
    const cell = { col: 3, row: 2, level: 1 };
    const world = gridToWorld(cell, DIMS);
    expect(worldToGrid(world)).toEqual(cell);
    expect(world.x).toBeGreaterThan(0);
    expect(world.z).toBeGreaterThan(0);
  });
  it('worldToGrid floors to the containing cell', () => {
    expect(worldToGrid({ x: 0, y: 0, z: 0 })).toEqual({ col: 0, row: 0, level: 0 });
    expect(worldToGrid({ x: 1.19, y: 1.19, z: 1.19 })).toEqual({ col: 0, row: 0, level: 0 });
    expect(worldToGrid({ x: 1.2, y: 0, z: 0 })).toEqual({ col: 1, row: 0, level: 0 });
  });
  it('validates positions inside and outside the warehouse', () => {
    expect(validatePosition({ x: 5, y: 2, z: 5 }, DIMS)).toEqual([]);
    expect(validatePosition({ x: 0, y: 0, z: 0 }, DIMS)).toEqual([]);
    expect(validatePosition({ x: 30, y: 6, z: 20 }, DIMS)).toEqual([]);
    expect(validatePosition({ x: 31, y: 2, z: 5 }, DIMS).length).toBeGreaterThan(0);
    expect(validatePosition({ x: 5, y: 7, z: 5 }, DIMS).length).toBeGreaterThan(0);
    expect(validatePosition({ x: -1, y: 2, z: 5 }, DIMS).length).toBeGreaterThan(0);
    expect(isInsideWarehouse({ x: 15, y: 3, z: 10 }, DIMS)).toBe(true);
    expect(isInsideWarehouse({ x: 15, y: 3, z: 21 }, DIMS)).toBe(false);
  });
  it('occupancy: same slot is occupied, a different shelf level is not', () => {
    const occupants = [{ id: 1, code: 'A-01-01-01', x: 6, y: 1.8, z: 4 }];
    expect(isOccupied({ x: 6.1, y: 1.8, z: 4.1 }, occupants)).toBe(true);
    expect(isOccupied({ x: 9, y: 1.8, z: 4 }, occupants)).toBe(false);
    expect(isOccupied({ x: 6.1, y: 4.2, z: 4.1 }, occupants)).toBe(false); // different shelf level
    expect(isOccupied({ x: 6.1, y: 1.8, z: 4.1 }, [])).toBe(false);
  });
});

describe('scene model from DB rows (headless, no WebGL)', () => {
  it('builds a plain model with occupied flags from stock quantities', () => {
    const model = buildSceneModel(DIMS,
      [
        { id: 1, code: 'A-01-01-01', x: 6, y: 1.8, z: 4, stockQty: 5 },
        { id: 2, code: 'A-01-01-02', x: 6, y: 1.8, z: 6, stockQty: 0 },
      ],
      [{ id: 1, code: 'PAL-001', x: 10, y: 0.15, z: 8 }],
      [{ id: 1, code: 'BOX-001', x: 10, y: 0.6, z: 8 }],
    );
    expect(model.locations).toHaveLength(2);
    expect(model.locations[0].occupied).toBe(true);
    expect(model.locations[1].occupied).toBe(false);
    expect(model.pallets).toHaveLength(1);
    expect(model.boxes).toHaveLength(1);
    expect(model.dims).toEqual(DIMS);
  });

  it('a Three.js scene builds from the model without a renderer (no WebGL needed)', () => {
    const model = buildSceneModel(DIMS,
      [{ id: 1, code: 'A-01-01-01', x: 6, y: 1.8, z: 4, stockQty: 2 }],
      [{ id: 1, code: 'PAL-001', x: 10, y: 0.15, z: 8 }],
      [{ id: 1, code: 'BOX-001', x: 10, y: 0.6, z: 8 }],
    );
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(model.dims.widthM, model.dims.depthM),
      new THREE.MeshStandardMaterial({ color: 0x3a4552 }),
    );
    scene.add(floor);
    for (const l of model.locations) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.0, 1.6),
        new THREE.MeshStandardMaterial({ color: l.occupied ? model.legend.occupied : model.legend.free }),
      );
      mesh.position.set(l.x, l.y, l.z);
      scene.add(mesh);
    }
    for (const p of model.pallets) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: model.legend.pallet }));
      mesh.position.set(p.x, p.y, p.z);
      scene.add(mesh);
    }
    for (const b of model.boxes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: model.legend.box }));
      mesh.position.set(b.x, b.y, b.z);
      scene.add(mesh);
    }
    // floor + 1 location + 1 pallet + 1 box
    expect(scene.children).toHaveLength(4);
    const locMesh = scene.children[1] as THREE.Mesh;
    expect(locMesh.position.x).toBe(6);
    expect(locMesh.position.z).toBe(4);
  });
});
