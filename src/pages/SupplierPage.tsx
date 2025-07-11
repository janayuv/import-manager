import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Supplier } from "@/types/supplier";
import { SupplierTable } from "@/components/suppliers/SupplierTable";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { SupplierView } from "@/components/suppliers/SupplierView";
import { SupplierEdit } from "@/components/suppliers/SupplierEdit";
import { SupplierActions } from "@/components/suppliers/SupplierActions";
import { ImportExport } from "@/components/suppliers/ImportExport";
import { toast } from "sonner";

type Mode = "list" | "create" | "view" | "edit";

export default function SupplierPage() {
  const [data, setData] = useState<Supplier[]>([]);
  const [mode, setMode] = useState<Mode>("list");
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suppliers");
      const arr: Supplier[] = await res.json();
      setData(arr);
    } catch {
      toast.error("Failed to fetch suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreate = () => {
    setSelected(null);
    setMode("create");
  };

  const handleRowClick = (supplier: Supplier) => {
    setSelected(supplier);
    setMode("view");
  };

  const sanitizeForm = (form: Omit<Supplier, "id">): any => {
    return Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value === "" ? undefined : value])
    );
  };

  const handleToggleActive = async (supplier: Supplier) => {
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !supplier.isActive }),
      });

      if (!res.ok) throw new Error();
      toast.success(
        `Supplier ${!supplier.isActive ? "enabled" : "disabled"} successfully`
      );
      fetchAll();
      setMode("list");
    } catch {
      toast.error("Failed to update supplier status");
    }
  };

  const handleSaveNew = async (form: Omit<Supplier, "id">) => {
    try {
      const existing = await (await fetch("/api/suppliers")).json() as Supplier[];
      const lastNum = existing
        .map((s) => parseInt(s.id.replace("sup-", ""), 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => b - a)[0] || 0;
      const newId = `sup-${String(lastNum + 1).padStart(3, "0")}`;

      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId, ...form }),
      });

      if (!res.ok) throw new Error();
      toast.success("Supplier created successfully");
      fetchAll();
      setMode("list");
    } catch {
      toast.error("Failed to save supplier");
    }
  };

const handleSaveEdit = async (form: Omit<Supplier, "id">) => {
  if (!selected) return;

  const cleaned = sanitizeForm(form);

  try {
    const res = await fetch(`/api/suppliers/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cleaned,
        isActive: cleaned.isActive ?? true,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      toast.error(`Failed to update supplier: ${errorText}`);
      return;
    }

    toast.success("Supplier updated successfully");
    fetchAll();
    setMode("list");
  } catch {
    toast.error("Failed to update supplier");
  }
};

  const handleImport = async (list: Supplier[]) => {
    let successCount = 0;
    for (const sup of list) {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uuidv4(), ...sup }),
      });
      if (res.ok) successCount++;
    }

    toast.success(`Imported ${successCount} supplier(s)`);
    fetchAll();
  };

  return (
    <div className="p-6 space-y-6">
      {mode === "list" && (
        <>
          <div className="flex justify-between items-center">
            <SupplierActions onAdd={handleCreate} />
            <ImportExport data={data} onImport={handleImport} />
          </div>
          <SupplierTable
            data={data}
            onRowClick={handleRowClick}
            isLoading={loading}
          />
        </>
      )}

      {mode === "create" && (
        <SupplierForm
          onCancel={() => setMode("list")}
          onSubmit={handleSaveNew}
        />
      )}

      {mode === "view" && selected && (
        <SupplierView
          supplier={selected}
          isOpen={true}
          onClose={() => setMode("list")}
          onEdit={() => setMode("edit")}
          onToggleStatus={handleToggleActive}
        />
      )}

      {mode === "edit" && selected && (
        <SupplierEdit
          initial={selected}
          onSave={handleSaveEdit}
          onCancel={() => setMode("list")}
        />
      )}
    </div>
  );
}
