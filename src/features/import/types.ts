import type { Movement } from "../../data/types";
export interface DetectedLayout {
  headerRow: number;
  dateFormat: "DMY" | "MDY" | "YMD";
  decimal: "," | ".";
  bank?: "revolut" | "n26";
  currency?: string;
  columns: {
    date: number;
    description: number;
    amount: number;
    debit: number;
    credit: number;
    merchant: number;
    externalId: number;
    balance?: number;
    currency?: number;
    valueDate?: number;
    bookingDate?: number;
    fee?: number;
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
}
export interface ParsedFile {
  name: string;
  sheets: Sheet[];
  warnings: string[];
  normalizedPdf?: boolean;
  kind?: "pdf" | "table";
}
export interface Candidate {
  movement: Movement;
  row: number;
  duplicate: "none" | "possible" | "exact";
  selected: boolean;
  balanceMissing?: boolean;
  page?: number;
  sheet?: string;
}
