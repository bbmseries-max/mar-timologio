import { Component, Input, Output, EventEmitter, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  MARANTH_MASTER_PROVIDER, 
  MasterProviderProfile 
} from '@core/constants/master-provider.constant';
import { CompanySettingsRecord } from '@core/models/database.models';

export interface ContractCustomerData {
  legalName: string;
  afm: string;
  doy?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  activity?: string;
  representativeName?: string;
}

export interface ContractFinancialTerms {
  setupFee: number;
  monthlyFee: number;
  startDate?: string;
  durationMonths?: number;
}

@Component({
  selector: 'maranth-contract-agreement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contract-agreement.component.html',
  styleUrls: ['./contract-agreement.component.css']
})
export class ContractAgreementComponent implements OnInit {
  @Input({ required: true }) customer!: ContractCustomerData;
  @Input() initialTerms: ContractFinancialTerms = {
    setupFee: 0,
    monthlyFee: 29,
    durationMonths: 12,
    startDate: new Date().toLocaleDateString('el-GR')
  };

  @Input() tenantSettings?: CompanySettingsRecord | null;
  @Input() isVendorContract: boolean = true;

  @Output() close = new EventEmitter<void>();

  // Editable reactive state for fees & duration
  public readonly editableTerms = signal<ContractFinancialTerms>({
    setupFee: 0,
    monthlyFee: 29,
    durationMonths: 12,
    startDate: new Date().toLocaleDateString('el-GR')
  });

  ngOnInit(): void {
    if (this.initialTerms) {
      this.editableTerms.set({ ...this.initialTerms });
    }
  }

  public updateSetupFee(val: number): void {
    this.editableTerms.update(prev => ({ ...prev, setupFee: Number(val) || 0 }));
  }

  public updateMonthlyFee(val: number): void {
    this.editableTerms.update(prev => ({ ...prev, monthlyFee: Number(val) || 0 }));
  }

  public updateDuration(val: number): void {
    this.editableTerms.update(prev => ({ ...prev, durationMonths: Number(val) || 12 }));
  }

  public readonly provider = computed<MasterProviderProfile>(() => {
    if (this.isVendorContract || !this.tenantSettings) {
      return MARANTH_MASTER_PROVIDER;
    }

    const s = this.tenantSettings;
    const streetAddr = s.street ? `${s.street} ${s.number || ''}`.trim() : '';

    return {
      legalName: s.legalName,
      brandName: s.tradeName || s.legalName,
      afm: s.afm,
      doy: s.doy,
      gemh: s.gemiNumber || '—',
      address: streetAddr || '—',
      city: s.city || '—',
      postalCode: s.postalCode || '—',
      representative: s.legalName,
      email: s.email || '',
      phone: s.phone || '',
    };
  });

  public printContract(): void {
    const printArea = document.getElementById('contract-printable-area');
    if (!printArea) {
      window.print();
      return;
    }

    const isolatedContainer = document.createElement('div');
    isolatedContainer.id = 'contract-isolated-print-area';
    isolatedContainer.innerHTML = printArea.innerHTML;
    document.body.appendChild(isolatedContainer);

    window.print();

    setTimeout(() => {
      isolatedContainer.remove();
    }, 500);
  }
}