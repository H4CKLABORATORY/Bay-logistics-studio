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
  };
  units: 'imperial' | 'metric';
  dateFormat: string;
  numbering: NumberingSettings;
  print: PrintSettings;
  backups: { autoBackup: boolean; intervalDays: number; lastBackupAt?: string };
  theme: 'light' | 'dark';
}

export interface BolHistoryEntry {
  id?: number;
  bolId: number;
  bolNumber: string;
  action: string;
  detail: string;
  createdAt?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  setupComplete: false,
  brandName: 'Logistics Studio',
  company: { name: '', address: '', phone: '', email: '' },
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
