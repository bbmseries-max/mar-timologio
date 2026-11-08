export interface TransmissionOutcome {
  status: 'success' | 'error';
  invoiceType: string;
  series: string;
  documentNumber: string | number;
  issueDate: string;
  grossTotal: number;
  // Filled on success:
  mark?: string;
  uid?: string;
  qrUrl?: string;
  recordId?: string | number;
  // Filled on error:
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string[];
}