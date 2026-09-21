import type { Movement } from "../../data/types";
export interface Sheet {
  name: string;
  rows: string[][];
  page?: number;
}
export interface ParsedFile {
  name: string;
  sheets: Sheet[];
  warnings: string[];
  normalizedPdf?: boolean;
}
export interface Candidate {
  movement: Movement;
  row: number;
  duplicate: "none" | "possible" | "exact";
  selected: boolean;
}
