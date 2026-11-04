// src/app/core/services/mock-mydata.engine.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MockMydataEngine {
  /** Generates a pseudo MARK matching AADE 15-digit structure with '999' prefix */
  public simulateSendInvoice(series: string, documentNumber: string) {
    const pseudoMark = '999' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const pseudoUid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    const qrUrl = `https://mydata.aade.gr/invoices/qr?mark=${pseudoMark}&uid=${pseudoUid}`;

    return {
      statusCode: 'Success' as const,
      mark: pseudoMark,
      uid: pseudoUid,
      qrUrl,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  public simulateCancelInvoice(mark: string) {
    const cancellationMark = '9998' + Math.floor(10000000000 + Math.random() * 90000000000).toString();
    return {
      statusCode: 'Success' as const,
      cancellationMark,
      isSimulated: true
    };
  }
}