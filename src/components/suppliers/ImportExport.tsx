// components/ImportExport.tsx
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import type { Supplier } from "@/types/supplier";

interface ImportExportProps {
  data: Supplier[];
  onImport: (suppliers: Supplier[]) => void;
}

export function ImportExport({ data, onImport }: ImportExportProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppliers_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = () => fileInput.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Supplier>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length) onImport(results.data);
      },
      error: (err) => {
        console.error("CSV parse error:", err);
      }
    });
  };

  return (
  <div className="flex space-x-2">
    <input
      type="file"
      accept=".csv"
      ref={fileInput}
      className="hidden"
      onChange={onFileChange}
    />
    <Button 
      onClick={handleFile} 
      style={{ backgroundColor: '#009485', color: 'white' }}
    >
      Import CSV
    </Button>
    <Button 
      onClick={handleExport} 
      style={{ backgroundColor: '#009485', color: 'white' }}
    >
      Export CSV
    </Button>
  </div>
  );
}
