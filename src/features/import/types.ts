import type { Movement } from "../../data/types";
export interface DetectedLayout {
  headerRow: number;
  dateFormat: "DMY" | "MDY" | "YMD";
  decimal: "," | ".";
  bank?: "revolut" | "n26";
  currency?: string;
  columns: {
    date: number;
    time?: number;
    secondaryTime?: number;
    description: number;
    amount: number;
    debit: number;
    credit: number;
    merchant: number;
    balance?: number;
    balanceSource?: number;
    currency?: number;
    valueDate?: number;
    bookingDate?: number;
    completionDate?: number;
    secondaryDate?: number;
    originalAmount?: number;
    originalCurrency?: number;
    fee?: number;
    exchangeRate?: number;
    status?: number;
    reference?: number;
    type?: number;
    notes?: number;
  };
}
export interface Sheet {
  name: string;
  rows: string[][];
  page?: number;
  informational?: boolean;
  warnings?: string[];
  currency?: string;
  issues?: ImportIssue[];
}
export type ReviewField =
  | "date"
  | "secondaryDate"
  | "time"
  | "secondaryTime"
  | "description"
  | "merchant"
  | "notes"
  | "amount"
  | "balance"
  | "originalAmount"
  | "originalCurrency"
  | "fee"
  | "exchangeRate";
export interface ImportIssue {
  noteFragments?: string[];
  resolved?: boolean;
  row: number;
  fields: ReviewField[];
  message: string;
}
export interface ParsedFile {
  name: string;
  sheets: Sheet[];
  warnings: string[];
  normalizedPdf?: boolean;
  kind?: "pdf" | "table";
}
export interface Candidate {
  reviewOriginalNotes?: string;
  issues?: ImportIssue[];
  edits?: Partial<Record<ReviewField, string>>;
  /** Original date columns, used only to recognize document direction before normalization. */
  sourceDates?: string[];
  orderEdited?: boolean;
  movement: Movement;
  row: number;
  duplicate: "none" | "possible";
  selected: boolean;
  balanceMissing?: boolean;
  page?: number;
  sheet?: string;
}
