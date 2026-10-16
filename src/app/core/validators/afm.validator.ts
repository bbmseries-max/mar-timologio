import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidGreekAfm } from '../utils/fiscal-engine';

export function greekAfmValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (!raw) {
      return null;
    }
    // Clean spaces and check
    const clean = String(raw).trim().replace(/\D/g, '');
    if (clean.length === 0) return null;

    return isValidGreekAfm(clean) ? null : { invalidGreekAfm: true };
  };
}

export { isValidGreekAfm };