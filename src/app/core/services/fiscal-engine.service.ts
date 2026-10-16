import { VatRateCategory, InvoiceLineItem, InvoiceTotals } from '../models/aade.models';

/**
 * Validates a Greek VAT Number (Α.Φ.Μ.) using the official Modulo-11 algorithm.
 * Rejects non-9-digit strings, non-numeric values, and all-zero strings.
 */
export function isValidGreekAfm(afm: string | null | undefined): boolean {
  if (!afm) return false;
  const clean = afm.replace(/\D/g, '').trim();

  if (clean.length !== 9 || clean === '000000000') {
    return false;
  }

  const digits = clean.split('').map(Number);
  const checkDigit = digits[8];

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    // Weights: 2^(8 - i) -> 256, 128, 64, 32, 16, 8, 4, 2
    sum += digits[i] * (1 << (8 - i));
  }

  const remainder = (sum % 11) % 10;
  return remainder === checkDigit;
}

/**
 * Returns the numeric VAT percentage (0 - 100) corresponding to an AADE VatRateCategory.
 */
export function getVatPercentage(category: VatRateCategory | number): number {
  switch (Number(category)) {
    case 1:
      return 24; // Standard
    case 2:
      return 13; // Reduced (Food, hospitality)
    case 3:
      return 6;  // Super-reduced (Medicines, theater)
    case 4:
      return 17; // Island standard
    case 5:
      return 9;  // Island reduced
    case 6:
      return 4;  // Island super-reduced
    case 7:
    case 8:
      return 0;  // Exempt / Zero rate
    default:
      return 24;
  }
}

/**
 * Calculates net, VAT, and gross values for a single line item with cent precision.
 */
export function calculateLineValues(
  quantity: number,
  unitPrice: number,
  discountPercentage: number = 0,
  vatRateCategory: VatRateCategory = 1
): { netValue: number; vatAmount: number; totalValue: number; vatPercentage: number } {
  const safeQty = Math.max(0, Number(quantity) || 0);
  const safePrice = Math.max(0, Number(unitPrice) || 0);
  const safeDisc = Math.min(100, Math.max(0, Number(discountPercentage) || 0));

  // Base raw net
  const grossSubtotal = safeQty * safePrice;
  const discountAmount = roundToTwoDecimals(grossSubtotal * (safeDisc / 100));
  const netValue = roundToTwoDecimals(grossSubtotal - discountAmount);

  const vatPercentage = getVatPercentage(vatRateCategory);
  const vatAmount = roundToTwoDecimals(netValue * (vatPercentage / 100));
  const totalValue = roundToTwoDecimals(netValue + vatAmount);

  return {
    netValue,
    vatAmount,
    totalValue,
    vatPercentage,
  };
}

/**
 * Aggregates all line items into the official InvoiceTotals summary structure,
 * including per-category VAT breakdowns.
 */
export function calculateInvoiceTotals(lines: InvoiceLineItem[]): InvoiceTotals {
  if (!lines || lines.length === 0) {
    return {
      totalNetValue: 0,
      totalVatAmount: 0,
      totalGrossValue: 0,
      vatBreakdowns: [],
    };
  }

  let totalNet = 0;
  let totalVat = 0;

  // Map to accumulate totals per VAT category
  const breakdownMap = new Map<
    VatRateCategory,
    { ratePercentage: number; netAmount: number; vatAmount: number }
  >();

  for (const line of lines) {
    const net = Number(line.netValue) || 0;
    const vat = Number(line.vatAmount) || 0;
    const cat = (Number(line.vatRateCategory) || 1) as VatRateCategory;
    const pct = line.vatPercentage ?? getVatPercentage(cat);

    totalNet += net;
    totalVat += vat;

    const existing = breakdownMap.get(cat);
    if (existing) {
      existing.netAmount += net;
      existing.vatAmount += vat;
    } else {
      breakdownMap.set(cat, {
        ratePercentage: pct,
        netAmount: net,
        vatAmount: vat,
      });
    }
  }

  // Format breakdowns with 2 decimal precision
  const vatBreakdowns = Array.from(breakdownMap.entries()).map(([cat, data]) => ({
    rateCategory: cat,
    ratePercentage: data.ratePercentage,
    netAmount: roundToTwoDecimals(data.netAmount),
    vatAmount: roundToTwoDecimals(data.vatAmount),
  }));

  const roundedNet = roundToTwoDecimals(totalNet);
  const roundedVat = roundToTwoDecimals(totalVat);
  const roundedGross = roundToTwoDecimals(roundedNet + roundedVat);

  return {
    totalNetValue: roundedNet,
    totalVatAmount: roundedVat,
    totalGrossValue: roundedGross,
    vatBreakdowns,
  };
}

/**
 * Robust mathematical half-up rounding to two decimal places.
 * Avoids IEEE 754 precision bugs (e.g. 1.005 rounding to 1.00).
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}