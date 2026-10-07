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
 * Validates Greek AFM (Tax Identification Number) using the standard Modulo 11 algorithm.
 */
export function isValidGreekAfm(afm: string): boolean {
  if (!/^\d{9}$/.test(afm) || afm === '000000000') {
    return false;
  }

  const digits = afm.split('').map(Number);
  const checkDigit = digits[8];

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * Math.pow(2, 8 - i);
  }

  const remainder = sum % 11;
  const calculatedCheck = remainder % 10;

  return calculatedCheck === checkDigit;
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