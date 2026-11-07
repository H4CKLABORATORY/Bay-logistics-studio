// The 7 configurable base templates. Warehouse and Delivery are the two
// fully-specified BOL templates; the other five are configurable shells whose
// fields are stored in the DB (templates table) and editable in Settings.
import type { BolTemplateKey } from './types';

export interface TemplateField {
  key: string;
  label: string;
  required: boolean;
}

export interface BaseTemplate {
  key: BolTemplateKey;
  name: string;
  description: string;
  fields: TemplateField[];
  hasWarehouseChecks: boolean;
  hasInternalSignatures: boolean;
  hasDeliveryReceipt: boolean;
}

const COMMON_FIELDS: TemplateField[] = [
  { key: 'bolNumber', label: 'BOL NUMBER', required: true },
  { key: 'date', label: 'DATE', required: true },
  { key: 'jobNumber', label: 'JOB #', required: false },
  { key: 'shipFrom', label: 'SHIP FROM', required: true },
  { key: 'deliveryAddress', label: 'DELIVERY ADDRESS', required: true },
  { key: 'requestBy', label: 'REQUEST BY', required: true },
  { key: 'truckTrailer', label: 'TRUCK/TRAILER', required: false },
  { key: 'billTo', label: 'THIRD PARTY FREIGHT CHARGES BILL TO', required: false },
  { key: 'requestedDelivery', label: 'REQUESTED DELIVERY', required: false },
  { key: 'deliveryNotes', label: 'DELIVERY NOTES', required: false },
];

export const BASE_TEMPLATES: BaseTemplate[] = [
  {
    key: 'warehouse',
    name: 'Warehouse',
    description:
      'Default. Items carry FOUND / PICKED / LOADED checkboxes and internal signatures FOUND BY / CHECKED BY / LOADED BY. No customer receipt signatures.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: true,
    hasInternalSignatures: true,
    hasDeliveryReceipt: false,
  },
  {
    key: 'delivery',
    name: 'Delivery',
    description:
      'Customer receipt: Receiver Printed Name, Date, Driver Signature. No FOUND/PICKED/LOADED checks, no internal signatures.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: false,
    hasInternalSignatures: false,
    hasDeliveryReceipt: true,
  },
  {
    key: 'standard',
    name: 'Standard',
    description: 'Plain BOL with the common fields and a simple items table.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: false,
    hasInternalSignatures: false,
    hasDeliveryReceipt: false,
  },
  {
    key: 'return',
    name: 'Return',
    description: 'Return-to-vendor BOL. Same fields; SHIP FROM and DELIVERY ADDRESS are swapped by convention.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: true,
    hasInternalSignatures: false,
    hasDeliveryReceipt: false,
  },
  {
    key: 'transfer',
    name: 'Transfer',
    description: 'Inter-warehouse transfer. Uses JOB # to link the transfer order.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: true,
    hasInternalSignatures: true,
    hasDeliveryReceipt: false,
  },
  {
    key: 'pickup',
    name: 'Pickup',
    description: 'Customer pickup BOL with receiver name/date on handover.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: false,
    hasInternalSignatures: false,
    hasDeliveryReceipt: true,
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Blank configurable template. Edit its fields in Settings → Templates.',
    fields: COMMON_FIELDS,
    hasWarehouseChecks: false,
    hasInternalSignatures: false,
    hasDeliveryReceipt: false,
  },
];

export function getTemplate(key: BolTemplateKey): BaseTemplate {
  return BASE_TEMPLATES.find((t) => t.key === key) ?? BASE_TEMPLATES[0];
}
