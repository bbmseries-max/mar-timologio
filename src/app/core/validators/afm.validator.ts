import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidGreekAfm } from '../utils/fiscal-engine';

/**
 * Angular Reactive Form ValidatorFn for Greek Tax Identification Numbers (Α.Φ.Μ.)
 * Delegates to the Modulo-11 calculation in the fiscal engine.
 */
export function greekAfmValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (!val) {
      return null; // Let Validators.required handle empty values
    }
    return isValidGreekAfm(val) ? null : { invalidGreekAfm: true };
  };
}

// Re-export so consumers can import both from this path if preferred
export { isValidGreekAfm };