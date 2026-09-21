export type Currency = string;
export type CategorySource = "manual" | "rule" | "ai" | "none";
export interface Account {
  id: string;
  name: string;
  bank: string;
  currency: Currency;
  openingBalance?: number;
  bankBalance?: number;
  bankBalanceAt?: string;
  externalId?: string;
}
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  parentId?: string;
  description: string;
}
export interface Movement {
  id: string;
  accountId: string;
  amount: number;
  currency: Currency;
  description: string;
  merchant: string;
  date: string;
  bookingDate?: string;
  balance?: number;
  timestamp?: string;
  categoryId?: string;
  categorySource: CategorySource;
  notes: string;
  source: string;
  externalId?: string;
  fingerprint: string;
  importId?: string;
  aiSuggestion?: { categoryId: string; score: number };
  createdAt: string;
}
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  descriptionContains: string;
  merchantContains: string;
  accountId?: string;
  minAmount?: number;
  maxAmount?: number;
  categoryId?: string;
  note: string;
}
export interface Recurrence {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  currency: Currency;
  frequency: "weekly" | "monthly" | "yearly";
  anchorDate: string;
  nextDate: string;
  active: boolean;
  movementIds: string[];
}
export interface Relation {
  id: string;
  type: "transfer" | "refund" | "related";
  movementIds: string[];
}
export interface Location {
  id: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  accuracy?: number;
  name: string;
  source: string;
}
export interface Assignment {
  id: string;
  movementId: string;
  locationId: string;
  status: "suggested" | "confirmed";
  evidence: string;
}
export interface ImportProfile {
  id: string;
  name: string;
  headerRow: number;
  dateFormat: "DMY" | "MDY" | "YMD";
  decimal: "," | ".";
  columns: {
    date: number;
    description: number;
    amount: number;
    debit: number;
    credit: number;
    merchant: number;
    externalId: number;
    balance?: number;
  };
}
export interface Settings {
  id: "main";
  maps: boolean;
  search: boolean;
  banking: boolean;
  timezone: string;
}
export interface SearchCache {
  id: string;
  savedAt: string;
  results: MerchantResult[];
}
export interface MerchantResult {
  name: string;
  detail: string;
  url: string;
  lat?: number;
  lng?: number;
  source: string;
}
export interface ModelState {
  id: "embeddings" | "chat";
  ready: boolean;
  revision: string;
  savedAt: string;
}
export interface Embedding {
  id: string;
  text: string;
  vector: number[];
  model: string;
}
export interface Snapshot {
  accounts: Account[];
  movements: Movement[];
  categories: Category[];
  rules: Rule[];
  recurrences: Recurrence[];
  relations: Relation[];
  locations: Location[];
  assignments: Assignment[];
  profiles: ImportProfile[];
  settings: Settings[];
}
export const emptySnapshot = (): Snapshot => ({
  accounts: [],
  movements: [],
  categories: [],
  rules: [],
  recurrences: [],
  relations: [],
  locations: [],
  assignments: [],
  profiles: [],
  settings: [],
});
