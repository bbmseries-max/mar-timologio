// src/app/core/utils/fiscal-engine.ts
import { InvoiceLineItem, InvoiceTotals, VatRateCategory } from '../models/aade.models';

export const VAT_RATES_MAP: Record<VatRateCategory, number> = {
  1: 24,
  2: 13,
  3: 6,
  4: 17,
  5: 9,
  6: 4,
  7: 0,
  8: 0,
};

/**
 * Validates Greek Tax Identification Numbers (Α.Φ.Μ.) via official Modulo-11 algorithm.
 * Correctly supports leading zeros (e.g., 067..., 07..., 09...).
 */
export function isValidGreekAfm(afm: unknown): boolean {
  if (afm === null || afm === undefined) return false;

  // 1. Force string conversion and strip any spaces or non-digit chars
  let clean = String(afm).trim().replace(/\D/g, '');

  // 2. Older 8-digit tax IDs: pad single leading zero
  if (clean.length === 8) {
    clean = '0' + clean;
  }

  // 3. Must be exactly 9 digits and cannot be all zeros
  if (clean.length !== 9 || clean === '000000000') {
    return false;
  }

  // 4. Modulo-11 Algorithm
  // Digits: d1 d2 d3 d4 d5 d6 d7 d8 (check digit: d9)
  // Weights: 256, 128, 64, 32, 16, 8, 4, 2
  const digits = clean.split('').map(d => parseInt(d, 10));
  const checkDigit = digits[8];

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * (1 << (8 - i)); // equivalent to digits[i] * Math.pow(2, 8 - i)
  }

  const remainder = sum % 11;
  const computedCheckDigit = remainder % 10;

  return computedCheckDigit === checkDigit;
}

/**
 * Calculates line-level net, discount, VAT, and gross values with cent-precision rounding.
 */
export function calculateLineValues(
  quantity: number,
  unitPrice: number,
  discountPercentage: number,
  vatRateCategory: VatRateCategory
): Pick<InvoiceLineItem, 'netValue' | 'vatPercentage' | 'vatAmount' | 'totalValue'> {
  const vatPercentage = VAT_RATES_MAP[vatRateCategory] ?? 0;
  
  const rawSubtotal = quantity * unitPrice;
  const discountAmount = rawSubtotal * (discountPercentage / 100);
  const netValue = Number((rawSubtotal - discountAmount).toFixed(2));
  
  const vatAmount = Number((netValue * (vatPercentage / 100)).toFixed(2));
  const totalValue = Number((netValue + vatAmount).toFixed(2));

  return { netValue, vatPercentage, vatAmount, totalValue };
}

/**
 * Aggregates document lines into summarized fiscal totals and VAT categorization arrays.
 */
export function calculateInvoiceTotals(lines: InvoiceLineItem[]): InvoiceTotals {
  const vatMap = new Map<VatRateCategory, { net: number; vat: number; pct: number }>();

  let totalNetValue = 0;
  let totalVatAmount = 0;

  for (const line of lines) {
    totalNetValue += line.netValue;
    totalVatAmount += line.vatAmount;

    const current = vatMap.get(line.vatRateCategory) || {
      net: 0,
      vat: 0,
      pct: line.vatPercentage,
    };
    current.net += line.netValue;
    current.vat += line.vatAmount;
    vatMap.set(line.vatRateCategory, current);
  }

  const vatBreakdowns = Array.from(vatMap.entries()).map(([rateCategory, data]) => ({
    rateCategory,
    ratePercentage: data.pct,
    netAmount: Number(data.net.toFixed(2)),
    vatAmount: Number(data.vat.toFixed(2)),
  }));

  const roundedNet = Number(totalNetValue.toFixed(2));
  const roundedVat = Number(totalVatAmount.toFixed(2));
  const totalGrossValue = Number((roundedNet + roundedVat).toFixed(2));

  return {
    totalNetValue: roundedNet,
    totalVatAmount: roundedVat,
    totalGrossValue,
    vatBreakdowns,
  };
}

/**
 * Generates the official AADE verification URL used in the QR Code.
 */
export function buildAadeQrUrl(
  issuerAfm: string,
  issueDate: string,
  mark: string,
  grossAmount: number
): string {
  const formattedGross = grossAmount.toFixed(2);
  return `https://www.aade.gr/mydata/verify?afm=${issuerAfm}&d=${issueDate}&mark=${mark}&g=${formattedGross}`;
}