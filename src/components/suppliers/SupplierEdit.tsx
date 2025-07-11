// components/SupplierEdit.tsx
import { SupplierForm } from "./SupplierForm";
import type { Supplier } from "@/types/supplier";

interface SupplierEditProps {
  initial: Supplier;
  onSave: (data: Omit<Supplier, "id">) => Promise<void>;
  onCancel: () => void;
}

export function SupplierEdit({ initial, onSave, onCancel }: SupplierEditProps) {
  const handleSubmit = async (data: Omit<Supplier, "id">) => {
    await onSave(data);
  };

  return (
    <SupplierForm
      initialData={initial}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
