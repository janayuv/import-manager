// components/SupplierActions.tsx
import { Button } from "@/components/ui/button";

interface SupplierActionsProps {
  onAdd: () => void;
}

export function SupplierActions({ onAdd }: SupplierActionsProps) {
  return (
  <div className="flex justify-end mb-4">
    <Button 
      onClick={onAdd} 
      style={{ backgroundColor: '#009485' }}
    >
      Add Supplier
    </Button>
  </div>
  );
}
