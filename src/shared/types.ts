// Shared types used by main, renderer and tests. No Electron/Node imports here.

export type BolTemplateKey =
  | 'warehouse'
  | 'delivery'
  | 'standard'
  | 'return'
  | 'transfer'
  | 'pickup'
  | 'custom';

export interface BolItem {
  id?: number;
  quantity: number;
  modelDescription: string;
  rrNumber: string;
  weight: string;
  /** Warehouse only */
  found?: boolean;
  picked?: boolean;
  loaded?: boolean;
}

export interface BolDocument {
  id?: number;
  bolNumber: string;
  template: BolTemplateKey;
  date: string; // YYYY-MM-DD
  jobNumber: string;
  shipFrom: string;
  deliveryAddress: string;
  requestBy: string;
  truckTrailer: string;
  billTo: string;
  requestedDelivery: string;
  deliveryNotes: string;
  items: BolItem[];
  /** Warehouse internal signatures (NO customer receipt signatures) */
  foundBy?: string;
  checkedBy?: string;
  loadedBy?: string;
  /** Delivery receipt signatures */
  receiverName?: string;
  receiverDate?: string;
  driverSignature?: string;
  customerId?: number | null;
  projectId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export type CatalogKind =
  | 'companies'
  | 'customers'
  | 'projects'
  | 'addresses'
  | 'requesters'
  | 'carriers'
  | 'items'
  | 'materials';

export interface CatalogRecord {
  id?: number;
  [key: string]: unknown;
}

export interface NumberingSettings {
  /** 'global' = one sequence for all templates; 'per-template' = separate sequence per template */
  mode: 'global' | 'per-template';
  prefix: string;
  nextNumber: number;
  padLength: number;
  perTemplateNext?: Partial<Record<BolTemplateKey, number>>;
}

// ---- Accounts (Phase 9): local username + password accounts (SQLite). ----
// Only the bcrypt hash is stored; PublicUser / SessionUser never carry it.
export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id?: number;
  username: string;
  role: UserRole;
  createdAt?: string;
}

/** Logged-in user kept in main-process memory for the app run. */
export interface SessionUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface AuthStatus {
  hasUsers: boolean;
  user: SessionUser | null;
}

export interface PrintSettings {
  paperSize: 'Letter' | 'A4';
  orientation: 'portrait' | 'landscape';
  copies: number;
  silent: boolean;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  defaultPrinter?: string;
  /** Label format option. NIIMBOT RW403B 4x6 is UNTESTED — no driver test has been run. */
  labelFormat?: 'none' | 'niimbot-rw403b-4x6-untested';
}

export interface AppSettings {
  setupComplete: boolean;
  brandName: string;
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    /** Company website, shown in the PDF header / SHIP FROM block. */
    website?: string;
  };
  units: 'imperial' | 'metric';
  dateFormat: string;
  numbering: NumberingSettings;
  print: PrintSettings;
  backups: { autoBackup: boolean; intervalDays: number; lastBackupAt?: string };
  theme: 'light' | 'dark';
}

// ---- Inventory (Phase 4) ----
// NOTE: `items`/`materials` catalog tables already exist; inventory stock
// items live in `inv_items` so the two do not collide.
export interface Warehouse {
  id?: number;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  createdAt?: string;
}

export interface InvLocation {
  id?: number;
  warehouseId: number;
  code: string; // e.g. A-01-02-03 (zone-aisle-shelf-position)
  zone: string;
  aisle: number;
  shelf: number;
  position: number;
  x: number; // metres, centre of the slot (3D map)
  y: number;
  z: number;
  capacity: number;
  createdAt?: string;
}

export interface InvItem {
  id?: number;
  sku: string;
  name: string;
  description: string;
  unit: string;
  weight: string;
  customer: string;
  project: string;
  createdAt?: string;
}

export interface InvPallet {
  id?: number;
  code: string;
  locationId: number | null;
  x: number;
  y: number;
  z: number;
  createdAt?: string;
}

export interface InvBox {
  id?: number;
  code: string;
  palletId: number | null;
  locationId: number | null;
  x: number;
  y: number;
  z: number;
  createdAt?: string;
}

export interface InvStockRow {
  id?: number;
  itemId: number;
  sku: string;
  itemName: string;
  locationId: number;
  locationCode: string;
  palletId: number;
  boxId: number;
  quantity: number;
}

export type InvMovementType = 'entry' | 'exit' | 'move';

export interface InvMovement {
  id?: number;
  type: InvMovementType;
  itemId: number;
  sku?: string;
  itemName?: string;
  quantity: number;
  fromLocationId: number | null;
  fromLocationCode?: string | null;
  toLocationId: number | null;
  toLocationCode?: string | null;
  bolId: number | null;
  bolNumber?: string | null;
  rrNumber: string;
  user: string;
  note: string;
  createdAt?: string;
}

export interface InvHistoryEntry {
  id?: number;
  entityType: string;
  entityId: number;
  action: string;
  detail: string;
  /** Username of the signed-in user who performed the action ('' for pre-accounts data). */
  username?: string;
  createdAt?: string;
}

export interface InventorySearchResult {
  items: InvItem[];
  movements: InvMovement[];
  bols: Array<{ id: number; bolNumber: string; rrNumber: string }>;
}

export interface BolHistoryEntry {
  id?: number;
  bolId: number;
  bolNumber: string;
  action: string;
  detail: string;
  /** Username of the signed-in user who performed the action ('' for pre-accounts data). */
  username?: string;
  createdAt?: string;
}

// ---- Dashboard (Phase 8) ----
export interface DashboardActivityEntry {
  id: number;
  source: 'bol' | 'inventory';
  ref: string; // BOL number, or inventory entity type
  action: string;
  detail: string;
  /** Username of the signed-in user who performed the action ('' for pre-accounts data). */
  username?: string;
  createdAt: string;
}

export interface DashboardOverCapacityLocation {
  code: string;
  capacity: number;
  stockQty: number;
}

export interface DashboardZeroStockItem {
  sku: string;
  name: string;
}

export interface DashboardWeeklyBar {
  week: string; // Monday YYYY-MM-DD
  label: string; // same as week (Monday date)
  count: number;
}

export interface DashboardStats {
  totalBols: number;
  bolsToday: number;
  bolsThisWeek: number;
  totalStockUnits: number;
  distinctSkusInStock: number;
  locationsOccupied: number;
  locationsTotal: number;
  overCapacity: DashboardOverCapacityLocation[];
  zeroStockItems: DashboardZeroStockItem[];
  weekly: DashboardWeeklyBar[];
  recentActivity: DashboardActivityEntry[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  setupComplete: false,
  brandName: 'Logistics Studio',
  // Default company data from the official BOL template
  // (docs/official-bol-template.pdf). These are editable company settings,
  // not product branding — changing them changes the PDF header.
  company: {
    name: 'Bay Crane Mid-Atlantic LLC',
    address: '51 Ritchie Road, Capitol Heights, MD 20743',
    phone: '(202) 529-6100',
    email: '',
    website: 'baycrane-ma.com',
  },
  units: 'imperial',
  dateFormat: 'YYYY-MM-DD',
  numbering: { mode: 'global', prefix: 'BOL-', nextNumber: 1, padLength: 5 },
  print: {
    paperSize: 'Letter',
    orientation: 'portrait',
    copies: 1,
    silent: false,
    marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
    labelFormat: 'none',
  },
  backups: { autoBackup: true, intervalDays: 7 },
  theme: 'light',
};

export function blankBol(template: BolTemplateKey = 'warehouse'): BolDocument {
  return {
    bolNumber: '',
    template,
    date: new Date().toISOString().slice(0, 10),
    jobNumber: '',
    shipFrom: '',
    deliveryAddress: '',
    requestBy: '',
    truckTrailer: '',
    billTo: '',
    requestedDelivery: '',
    deliveryNotes: '',
    items: [{ quantity: 1, modelDescription: '', rrNumber: '', weight: '' }],
    foundBy: '',
    checkedBy: '',
    loadedBy: '',
    receiverName: '',
    receiverDate: '',
    driverSignature: '',
    customerId: null,
    projectId: null,
  };
}
