export type Supplier = {
  id: string; // "Sup-001"
  supplierName: string;
  shortName?: string; // Optional
  country: string;
  email: string;
  phone?: string; // Optional
  beneficiaryName?: string; // Optional
  bankName?: string; // Optional
  branch?: string; // Optional
  bankAddress?: string; // Optional
  accountNo?: string; // Optional
  iban?: string; // Optional
  swiftCode?: string; // Optional
  isActive: boolean;
};