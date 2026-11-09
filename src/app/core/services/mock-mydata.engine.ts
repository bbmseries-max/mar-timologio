// src/app/core/services/mock-mydata.engine.ts
import { Injectable } from '@angular/core';

export interface MockInvoiceResponse {
  success: boolean;
  statusCode: 'Success';
  mark: string;
  invoiceMark: string;
  uid: string;
  invoiceUid: string;
  qrUrl: string;
  isSimulated: true;
  timestamp: string;
}

export interface MockCancelResponse {
  success: boolean;
  statusCode: 'Success';
  cancellationMark: string;
  isSimulated: true;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class MockMydataEngine {
  /**
   * Generates a pseudo MARK matching AADE 15-digit structure with '999' prefix
   * Formats QR URL strictly according to AADE TimologioQR schema.
   */
  public async simulateSendInvoice(
    series: string,
    documentNumber: string | number,
    delayMs: number = 250
  ): Promise<MockInvoiceResponse> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const pseudoMark = '999' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const pseudoUid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    
    // Official AADE TimologioQR endpoint format
    const qrUrl = `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=${pseudoMark}`;

    return {
      success: true,
      statusCode: 'Success',
      mark: pseudoMark,
      invoiceMark: pseudoMark,
      uid: pseudoUid,
      invoiceUid: pseudoUid,
      qrUrl,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Simulates an AADE invoice cancellation response with a valid cancellation MARK.
   */
  public async simulateCancelInvoice(
    mark: string,
    delayMs: number = 200
  ): Promise<MockCancelResponse> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const cancellationMark = '9998' + Math.floor(10000000000 + Math.random() * 90000000000).toString();
    return {
      success: true,
      statusCode: 'Success',
      cancellationMark,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };
  }
}