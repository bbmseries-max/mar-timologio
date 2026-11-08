import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TransmissionOutcome } from '@core/models/transmission-outcome.model';

@Component({
  selector: 'app-transmission-outcome-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transmission-outcome-dialog.component.html',
})
export class TransmissionOutcomeDialogComponent {
  private router = inject(Router);

  public outcome = input<TransmissionOutcome | null>(null);
  public dismiss = output<void>();

  public onDismiss(): void {
    this.dismiss.emit();
  }

  public onGoToArchive(data: TransmissionOutcome): void {
    this.dismiss.emit();
    // Redirect to Archive with tight filters: only this newly created invoice is visible!
    this.router.navigate(['/invoices/archive'], {
      queryParams: {
        id: data.recordId,
        date: data.issueDate,
        type: data.invoiceType,
        highlight: 'true'
      }
    });
  }
}