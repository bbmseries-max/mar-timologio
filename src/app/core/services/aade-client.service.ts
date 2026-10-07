import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TransmissionResponse {
  mark: string;
  uid: string;
  statusCode: string;
}

@Injectable({ providedIn: 'root' })
export class AadeClientService {
  private readonly http = inject(HttpClient);
  private readonly proxyUrl = '/api/mydata/transmit';

  public transmitInvoicesDoc(xmlPayload: string): Observable<TransmissionResponse> {
    return this.http.post<TransmissionResponse>(this.proxyUrl, { xmlPayload });
  }
}