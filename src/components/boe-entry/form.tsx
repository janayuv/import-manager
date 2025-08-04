// src/app/dashboard/boe-entry/components/boe-form.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ItemsTable } from "./items-table";
import { CalculationResults } from "./calculation-results";
import { calculateDuties } from "@/lib/duty-calculator";
import type {
  Shipment,
  BoeItemInput,
  CalculationResult,
  SavedBoe,
  CalculationMethod,
} from "@/types/boe-entry";
import { toast } from "sonner";
import Papa, { type ParseResult } from "papaparse";


const formSchema = z.object({
  supplierName: z.string().min(1, { message: "Please select a supplier." }),
  shipmentId: z.string().min(1, { message: "Please select an invoice." }),
  exchangeRate: z.coerce.number().min(0, { message: "Invalid rate." }),
  freightCost: z.coerce.number().min(0),
  exwCost: z.coerce.number().min(0),
  insuranceRate: z.coerce.number().min(0),
  interest: z.coerce.number().min(0).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface BoeEntryFormProps {
  shipments: Shipment[];
  onSaveOrUpdate: (boeData: SavedBoe) => void;
  initialData: SavedBoe | null;
  onCancelEdit: () => void;
  setEditingBoe: (boe: SavedBoe | null) => void;
}

interface RawOverrideRow {
  partNo: string;
  calculationMethod: string;
  boeBcdRate: string;
  boeSwsRate: string;
  boeIgstRate: string;
}

export function BoeEntryForm({
  shipments,
  onSaveOrUpdate,
  initialData,
  onCancelEdit,
  setEditingBoe,
}: BoeEntryFormProps) {
  const [suppliers, setSuppliers] = React.useState<string[]>([]);
  const [availableInvoices, setAvailableInvoices] = React.useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null);
  const [itemInputs, setItemInputs] = React.useState<BoeItemInput[]>([]);
  const [calculationResult, setCalculationResult] = React.useState<CalculationResult | null>(null);
  const [lastValidFormValues, setLastValidFormValues] = React.useState<FormValues | null>(null);
  const [overrideFile, setOverrideFile] = React.useState<File | null>(null);

  const isEditing = Boolean(initialData);

  // initialize suppliers list
  React.useEffect(() => {
    setSuppliers([...new Set(shipments.map((s) => s.supplierName))]);
  }, [shipments]);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierName: "",
      shipmentId: "",
      exchangeRate: "",
      freightCost: "",
      exwCost: "",
      insuranceRate: 0.015,
      interest: "",
    },
    mode: "onChange",
  });

  // pre-fill when editing
  React.useEffect(() => {
    if (initialData) {
      form.reset(initialData.formValues);
      const invs = shipments.filter((s) => s.supplierName === initialData.formValues.supplierName);
      setAvailableInvoices(invs);
      setSelectedShipment(shipments.find((s) => s.id === initialData.shipmentId) || null);
      setItemInputs(initialData.itemInputs);
      setCalculationResult(initialData.calculationResult);
    } else {
      form.reset();
      setAvailableInvoices([]);
      setSelectedShipment(null);
      setItemInputs([]);
      setCalculationResult(null);
    }
  }, [initialData, shipments, form]);

  const handleSupplierChange = (supplierName: string) => {
    form.setValue("supplierName", supplierName, { shouldValidate: true });
    const invs = shipments.filter((s) => s.supplierName === supplierName);
    setAvailableInvoices(invs);
    form.resetField("shipmentId");
    setSelectedShipment(null);
    setItemInputs([]);
    setCalculationResult(null);
  };

  const handleInvoiceChange = (shipmentId: string) => {
    form.setValue("shipmentId", shipmentId, { shouldValidate: true });
    const shipment = shipments.find((s) => s.id === shipmentId) || null;
    setSelectedShipment(shipment);
    setCalculationResult(null);

    if (shipment) {
      setItemInputs(
        shipment.items.map((item) => ({
          partNo: item.partNo,
          calculationMethod: "Standard",
          boeBcdRate: item.actualBcdRate,
          boeSwsRate: item.actualSwsRate,
          boeIgstRate: item.actualIgstRate,
        }))
      );
    }
  };

  const parseOverrideFile = (file: File): Promise<BoeItemInput[]> =>
  new Promise((resolve, reject) => {
    Papa.parse<RawOverrideRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: ParseResult<RawOverrideRow>) => {
        const required = ["partNo", "calculationMethod", "boeBcdRate", "boeSwsRate", "boeIgstRate"];
        const actual = results.meta.fields ?? [];
        if (!required.every((h) => actual.includes(h))) {
          return reject(new Error("CSV file is missing required headers."));
        }

        try {
          const data: BoeItemInput[] = results.data.map((row) => ({
            partNo: row.partNo,
            calculationMethod: row.calculationMethod as CalculationMethod,
            boeBcdRate: parseFloat(row.boeBcdRate),
            boeSwsRate: parseFloat(row.boeSwsRate),
            boeIgstRate: parseFloat(row.boeIgstRate),
          }));
          resolve(data);
        } catch {
          reject(new Error("Failed to transform CSV rows into BoeItemInput"));
        }
      },
      error: (err: Error) => reject(err),
    });
  });

async function onSubmit(values: FormValues) {
  if (!selectedShipment) {
    toast.error("Please select a shipment before calculating.");
    return;
  }

  let finalInputs = itemInputs;

  if (overrideFile) {
    try {
      // 1. parse all overrides
      const overrides = await parseOverrideFile(overrideFile);

      // 2. build a map of original items (for quick lookup)
      const originalItems = selectedShipment.items.map(item => ({
        partNo: item.partNo,
        calculationMethod: "Standard" as const,
        boeBcdRate: item.actualBcdRate,
        boeSwsRate: item.actualSwsRate,
        boeIgstRate: item.actualIgstRate,
      }));
      const originalIgstMap = new Map<string, number>(
        originalItems.map(o => [o.partNo, o.boeIgstRate])
      );

      // 3. split overrides
      const unmatched = overrides.filter(o => !originalIgstMap.has(o.partNo));
      const candidates = overrides.filter(o => originalIgstMap.has(o.partNo));

      const igstMismatches = candidates.filter(
        o => o.boeIgstRate !== originalIgstMap.get(o.partNo)
      );
      const validOverrides = candidates.filter(
        o => o.boeIgstRate === originalIgstMap.get(o.partNo)
      );

      // 4. warn about dropped rows
      if (unmatched.length) {
        toast.warning(
          `Ignored override for unknown parts: ${unmatched
            .map(o => o.partNo)
            .join(", ")}`
        );
      }
      if (igstMismatches.length) {
        toast.warning(
          `Ignored override for IGST mismatch on parts: ${igstMismatches
            .map(o => o.partNo)
            .join(", ")} (must match invoice IGST)`
        );
      }

      // 5. merge only the valid ones
      finalInputs = originalItems.map(orig => {
        const override = validOverrides.find(o => o.partNo === orig.partNo);
        return override ?? orig;
      });

      setItemInputs(finalInputs);
    } catch (err) {
      toast.error("Import Failed", { description: (err as Error).message });
      return;
    }
  }
  

    setLastValidFormValues(values);
    const results = calculateDuties({
      shipment: selectedShipment,
      formValues: values,
      itemInputs: finalInputs,
    });
    setCalculationResult(results);

    if (overrideFile) {
      setEditingBoe({
        id: `DRAFT-${Date.now()}`,
        shipmentId: selectedShipment.id,
        invoiceNumber: selectedShipment.invoiceNumber,
        supplierName: selectedShipment.supplierName,
        formValues: values,
        itemInputs: finalInputs,
        calculationResult: results,
      });
      toast.info("Import Successful", {
        description: `Verify imported details and click "Update BOE" to save.`,
      });
    }
  }

  const handleSaveOrUpdate = () => {
    if (!calculationResult || !selectedShipment || !lastValidFormValues) {
      toast.error("Cannot save", { description: "Please calculate duties first." });
      return;
    }
    onSaveOrUpdate({
      id: initialData?.id || `BOE-${Date.now()}`,
      shipmentId: selectedShipment.id,
      invoiceNumber: selectedShipment.invoiceNumber,
      supplierName: selectedShipment.supplierName,
      formValues: lastValidFormValues,
      itemInputs,
      calculationResult,
    });
    if (!isEditing) {
      form.reset();
      setSelectedShipment(null);
      setItemInputs([]);
      setCalculationResult(null);
      setAvailableInvoices([]);
      setLastValidFormValues(null);
      setOverrideFile(null);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-6 items-end">
          <FormField name="supplierName" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Supplier</FormLabel>
              <Select onValueChange={handleSupplierChange} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField name="shipmentId" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice / Shipment</FormLabel>
              <Select onValueChange={handleInvoiceChange} value={field.value} disabled={!availableInvoices.length && !isEditing}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select an invoice" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField name="exchangeRate" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Exchange Rate</FormLabel>
              <FormControl><Input
  type="number"
  value={field.value as number || ""}
  onChange={e => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
  onBlur={field.onBlur}
  name={field.name}
  ref={field.ref}
/>
</FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField name="freightCost" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Freight Cost</FormLabel>
              <FormControl><Input
  type="number"
  value={field.value as number || ""}
  onChange={e => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
  onBlur={field.onBlur}
  name={field.name}
  ref={field.ref}
/>
</FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField name="exwCost" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>EXW Cost</FormLabel>
              <FormControl><Input
  type="number"
  value={field.value as number || ""}
  onChange={e => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
  onBlur={field.onBlur}
  name={field.name}
  ref={field.ref}
/>
</FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField name="insuranceRate" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Insurance %</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g., 0.015"
                  value={field.value as number || ""}
                  onChange={e => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 items-end">
          <FormField name="interest" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Interest</FormLabel>
              <FormControl><Input
  type="number"
  value={field.value as number || ""}
  onChange={e => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
  onBlur={field.onBlur}
  name={field.name}
  ref={field.ref}
/>
</FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <div className="md:col-span-2">
            <Label htmlFor="override-file">Duty Override File (Optional)</Label>
            <Input
              id="override-file"
              type="file"
              accept=".csv"
              onChange={(e) => setOverrideFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        {selectedShipment && (
          <div>
            <h3 className="text-lg font-medium mb-4">Invoice Items</h3>
            <ItemsTable
              items={selectedShipment.items}
              itemInputs={itemInputs}
              setItemInputs={setItemInputs}
            />
          </div>
        )}

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={!form.formState.isValid} className="custom-alert-action-orange">
            {overrideFile ? "Import & Calculate" : "Calculate Duties"}
          </Button>
          {calculationResult && (
            <Button type="button" onClick={handleSaveOrUpdate} className="custom-alert-action-ok">
              {isEditing ? "Update BOE" : "Save BOE"}
            </Button>
          )}
          {isEditing && (
            <Button type="button" variant="ghost" onClick={onCancelEdit}>
              Cancel Edit
            </Button>
          )}
        </div>
      </form>

      {calculationResult && <CalculationResults results={calculationResult} />}
    </Form>
  );
}