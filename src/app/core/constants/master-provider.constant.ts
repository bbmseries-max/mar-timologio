// src/app/core/constants/master-provider.constant.ts

export interface MasterProviderProfile {
  legalName: string;
  brandName: string;
  afm: string;
  doy: string;
  gemh: string;
  address: string;
  city: string;
  postalCode: string;
  representative: string;
  email: string;
  phone: string;
}

export const MARANTH_MASTER_PROVIDER: MasterProviderProfile = {
  legalName: 'MARANTH ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ',
  brandName: 'Maranth Invoice Pro',
  afm: '067424104', // Replace with your IKE AFM
  doy: 'ΨΥΧΙΚΟΥ', // Replace with your IKE DOY
  gemh: '67452303000', // Replace with your IKE GEMI
  address: 'ΒΑΡΔΟΥΝΙΩΤΗ 11', // Replace with your headquarters street & number
  city: 'Αθήνα',
  postalCode: '11522',
  representative: 'Διαχειριστής Ι.Κ.Ε.', // Legal representative full name
  email: 'info@maranth.gr',
  phone: '21064699275',
};