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
  order?: number;
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
  secondaryDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  balance?: number;
  /** Fee in the movement currency's minor units; already included in amount. */
  fee?: number;
  /** Explicit source quote (decimal or currency equation), never a computed rate. */
  exchangeRate?: string;
  /** Wall-clock time from the source, associated with date; no timezone conversion. */
  time?: string;
  secondaryTime?: string;
  sourcePosition?: {
    sheet: string;
    page?: number;
    row: number;
    position: number;
    previousPosition?: number;
    direction?: 1 | -1;
  };
  order?: {
    rank: number;
    after: string[];
    uncertain: boolean;
    sourceIssue?: boolean;
  };
  categoryId?: string;
  tagIds: string[];
  categorySource: CategorySource;
  notes: string;
  source: string;
  fingerprint: string;
  importId?: string;
  aiSuggestion?: { categoryId: string; score: number };
  createdAt: string;
}
export interface Tag {
  id: string;
  name: string;
  normalizedName: string;
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
export interface Settings {
  hideImportWelcome?: boolean;
  hideTanuWelcome?: boolean;
  cpuThreads?: "auto" | number;
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
  id: string;
  ready: boolean;
  revision: string;
  savedAt: string;
  modelKey?: string;
  modelId?: string;
  backend?: "wasm" | "webgpu";
  name?: string;
  preparing?: boolean;
  error?: string;
  checkedDevice?: string;
  engine?: "wllama" | "webllm";
  quantization?: string;
  activeThreads?: number;
  resources?: {
    cache?: string;
    model?: string;
    library?: string;
    gguf?: string;
  };
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
  tags: Tag[];
  rules: Rule[];
  recurrences: Recurrence[];
  relations: Relation[];
  locations: Location[];
  assignments: Assignment[];
  settings: Settings[];
}
export const emptySnapshot = (): Snapshot => ({
  accounts: [],
  movements: [],
  categories: [],
  tags: [],
  rules: [],
  recurrences: [],
  relations: [],
  locations: [],
  assignments: [],
  settings: [],
});
