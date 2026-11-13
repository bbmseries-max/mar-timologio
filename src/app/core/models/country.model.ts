export interface CountryOption {
  code: string;
  label: string;
  isEu: boolean;
}

export const MYDATA_COUNTRIES: CountryOption[] = [
  // EU Member States (Valid for 1.1 GR & 1.2 Intra-Community Deliveries)
  { code: 'GR', label: 'GR - Ελλάδα', isEu: true },
  { code: 'CY', label: 'CY - Κύπρος', isEu: true },
  { code: 'DE', label: 'DE - Γερμανία', isEu: true },
  { code: 'IT', label: 'IT - Ιταλία', isEu: true },
  { code: 'FR', label: 'FR - Γαλλία', isEu: true },
  { code: 'BG', label: 'BG - Βουλγαρία', isEu: true },
  { code: 'RO', label: 'RO - Ρουμανία', isEu: true },
  { code: 'NL', label: 'NL - Ολλανδία', isEu: true },
  { code: 'BE', label: 'BE - Βέλγιο', isEu: true },
  { code: 'ES', label: 'ES - Ισπανία', isEu: true },
  { code: 'AT', label: 'AT - Αυστρία', isEu: true },
  { code: 'PL', label: 'PL - Πολωνία', isEu: true },
  { code: 'SE', label: 'SE - Σουηδία', isEu: true },
  { code: 'DK', label: 'DK - Δανία', isEu: true },
  { code: 'FI', label: 'FI - Φινλανδία', isEu: true },
  { code: 'IE', label: 'IE - Ιρλανδία', isEu: true },
  { code: 'PT', label: 'PT - Πορτογαλία', isEu: true },
  { code: 'CZ', label: 'CZ - Τσεχία', isEu: true },
  { code: 'HU', label: 'HU - Ουγγαρία', isEu: true },
  { code: 'SK', label: 'SK - Σλοβακία', isEu: true },
  { code: 'SI', label: 'SI - Σλοβενία', isEu: true },
  { code: 'HR', label: 'HR - Κροατία', isEu: true },
  { code: 'LT', label: 'LT - Λιθουανία', isEu: true },
  { code: 'LV', label: 'LV - Λετονία', isEu: true },
  { code: 'EE', label: 'EE - Εσθονία', isEu: true },
  { code: 'LU', label: 'LU - Λουξεμβούργο', isEu: true },
  { code: 'MT', label: 'MT - Μάλτα', isEu: true },

  // Common Non-EU / Third Countries (Valid for 1.3 Exports)
  { code: 'GB', label: 'GB - Ηνωμένο Βασίλειο (UK)', isEu: false },
  { code: 'CH', label: 'CH - Ελβετία', isEu: false },
  { code: 'US', label: 'US - Η.Π.Α.', isEu: false },
  { code: 'AL', label: 'AL - Αλβανία', isEu: false },
  { code: 'MK', label: 'MK - Βόρεια Μακεδονία', isEu: false },
  { code: 'RS', label: 'RS - Σερβία', isEu: false },
  { code: 'TR', label: 'TR - Τουρκία', isEu: false },
  { code: 'NO', label: 'NO - Νορβηγία', isEu: false },
  { code: 'AE', label: 'AE - Ηνωμένα Αραβικά Εμιράτα', isEu: false },
  { code: 'CA', label: 'CA - Καναδάς', isEu: false },
  { code: 'AU', label: 'AU - Αυστραλία', isEu: false },
  { code: 'CN', label: 'CN - Κίνα', isEu: false },
];

export const EU_COUNTRIES: CountryOption[] = MYDATA_COUNTRIES.filter((c) => c.isEu);
export const NON_EU_COUNTRIES: CountryOption[] = MYDATA_COUNTRIES.filter((c) => !c.isEu);

export function isKnownMyDataCountry(code?: string): boolean {
  const clean = (code || '').trim().toUpperCase();
  return MYDATA_COUNTRIES.some((c) => c.code === clean);
}