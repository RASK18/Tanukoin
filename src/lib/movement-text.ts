import type { Movement } from "../data/types";

// ISO 13616 national lengths (SWIFT IBAN Registry). Structural removal also
// covers masked/checksum-invalid exports; this is not account validation.
// https://www.swift.com/resource/iban-registry-pdf
const ibanLengths: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HN: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};
const iban = new RegExp(
  `(?<![a-z0-9])(?:${Object.entries(ibanLengths)
    .map(
      ([country, length]) =>
        `${country}[\\s-]*[0-9*X]{2}(?:[\\s-]*[a-z0-9*]){${length - 4}}`,
    )
    .join("|")})(?![a-z0-9*])`,
  "gi",
);

export const containsIban = (value: string) => value.search(iban) >= 0;

export function removeIbans(value: string): string {
  return value
    .replace(iban, "")
    .replace(/\bIBAN\s*[:：]?\s*(?=[,;.·•\n]|BIC\b|$)/gi, "")
    .replace(/[ \t]+([,;])/g, "$1")
    .replace(/[,;][ \t]*(?=\n|$)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sanitizeMovementText(
  m: Pick<Movement, "description" | "merchant" | "notes" | "reference">,
) {
  return {
    description: removeIbans(m.description) || "Sin concepto",
    ...(m.reference !== undefined
      ? { reference: removeIbans(m.reference) || undefined }
      : {}),
    merchant: removeIbans(m.merchant),
    notes: removeIbans(m.notes),
  };
}

const clean = (value = "") => {
  const text = removeIbans(value).replace(/\s+/g, " ").trim();
  return text === "-" ? "" : text;
};
const referenceLabel =
  /(?:referencia(?: de(?:l)? pago)?|payment reference|reference|ref\.)\s*[:：]\s*/i;
const detailLabel =
  /^(?:A |De |To |From |Tarjeta\s*:|Card\s*:|Comisi[oó]n\b|Tipo de cambio\b|Fecha\b|Importe original\b|Informaci[oó]n original\b|IBAN\b|Beneficiario\s*:|Ordenante\s*:)/i;

/** PDF line boundaries distinguish wrapped references from the next labelled detail. */
function extractReferences(value: string) {
  const references: string[] = [];
  const kept: string[] = [];
  let reference: string[] | undefined;
  const finish = () => {
    if (reference) references.push(clean(reference.join(" ")));
    reference = undefined;
  };
  for (const line of value.split(/\r?\n/)) {
    const match = referenceLabel.exec(line);
    if (match) {
      finish();
      const before = line.slice(0, match.index).replace(/[\s;,.]+$/, "");
      if (before) kept.push(before);
      reference = [line.slice(match.index + match[0].length)];
    } else if (reference && line.trim() && !detailLabel.test(line.trim())) {
      reference.push(line);
    } else {
      finish();
      kept.push(line);
    }
  }
  finish();
  return { text: kept.join("\n").trim(), references };
}

export function inferCounterparty(description: string): string {
  const patterns = [
    /^(?:pago|transferencia|traspaso|bizum)(?:\s+sepa)?(?:\s+(?:inmediata|recibid[oa]|enviad[oa]|emitid[oa]))?\s+(?:a favor de|procedente de|a|de|desde|para)\s+(.+)$/i,
    /^(?:compra|pago)(?:\s+con\s+tarjeta(?:\s+[\d*]+)?)?\s+en\s+(.+)$/i,
    /^(?:to|from|payment to|payment from|transfer to|transfer from|recibo de)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const name = clean(pattern.exec(description)?.[1]);
    if (
      /^(?:prueba|ejemplo|fondos|dinero|efectivo|saldo|divisas|ahorro|n[oó]mina)[.!]?$/i.test(
        name,
      )
    )
      continue;
    if (name && /\p{L}/u.test(name)) return name;
  }
  return "";
}

export function normalizeImportedText(input: {
  description: string;
  merchant?: string;
  reference?: string;
  notes?: string;
  fallback?: string;
  namedCounterparty?: boolean;
}) {
  const descriptionParts = extractReferences(input.description);
  const noteParts = extractReferences(input.notes || "");
  const base = clean(descriptionParts.text);
  const explicit = clean(input.merchant);
  const references = [
    clean(input.reference),
    ...descriptionParts.references,
    ...noteParts.references,
  ].filter(Boolean);
  const description =
    base || explicit || clean(input.fallback) || "Sin concepto";
  const reference = [...new Set(references)].join(". ") || undefined;
  const merchant =
    explicit ||
    inferCounterparty(base) ||
    (input.namedCounterparty ? base : "");
  return sanitizeMovementText({
    description,
    reference,
    merchant,
    notes: noteParts.text,
  });
}

export function movementDescription(
  m: Pick<Movement, "description" | "reference">,
): string {
  const reference = m.reference?.trim();
  if (
    !reference ||
    m.description.toLocaleLowerCase().includes(reference.toLocaleLowerCase())
  )
    return m.description;
  return `${m.description.replace(/[.\s]+$/, "")}. ${reference.replace(/^[.\s]+/, "")}`;
}
