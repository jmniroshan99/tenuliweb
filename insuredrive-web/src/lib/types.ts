// Legacy records are dynamically shaped by the installed additive Supabase migrations.
export type Row = Record<string, any>;
export type RentalData = {
  owner_only: boolean;
  customers: Row[];
  bookings: Row[];
  invoices: Row[];
  ledger: Row[];
  allocations: Row[];
  business?: Row;
};
export const emptyRental: RentalData = {
  owner_only: false,
  customers: [],
  bookings: [],
  invoices: [],
  ledger: [],
  allocations: [],
};
export type LegacyData = {
  vehicles: Row[];
  profiles: Row[];
  policies: Row[];
  revenue: Row[];
  emission: Row[];
  fitness: Row[];
  locations: Row[];
  trips: Row[];
  notifications: Row[];
  audit: Row[];
  errors: Record<string, string>;
};
export const emptyLegacy: LegacyData = {
  vehicles: [],
  profiles: [],
  policies: [],
  revenue: [],
  emission: [],
  fitness: [],
  locations: [],
  trips: [],
  notifications: [],
  audit: [],
  errors: {},
};
export type Field = {
  maxLength?: number;
  key: string;
  en: string;
  si?: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  step?: string;
  wide?: boolean;
  hint?: string;
};
