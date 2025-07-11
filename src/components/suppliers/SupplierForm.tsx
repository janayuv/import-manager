// src/components/SupplierForm.tsx
import { useState, useEffect } from "react";
import { z } from "zod";
import type { Supplier } from "@/types/supplier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

const schema = z.object({
  supplierName: z.string().min(1),
  shortName: z.string().min(1),
  country: z.string().min(1),
  beneficiaryName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),

  bankName: z.string().min(1),
  branch: z.string().min(1),
  swiftCode: z.string().min(1),
  accountNo: z.string().optional(),
  iban: z.string().optional(),
  bankAddress: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface SupplierFormProps {
  initialData?: Supplier;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
}

export function SupplierForm({
  initialData,
  onSubmit,
  onCancel,
}: SupplierFormProps) {
  const [form, setForm] = useState<FormData>({
    supplierName: "",
    shortName: "",
    country: "",
    beneficiaryName: "",
    email: undefined,
    phone: undefined,
    bankName: "",
    branch: "",
    swiftCode: "",
    accountNo: undefined,
    iban: undefined,
    bankAddress: undefined,
    ...initialData,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setForm((f) => ({ ...f, ...initialData }));
    }
  }, [initialData]);

  const handleChange =
    (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value || undefined }));
    };

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) errs[err.path[0] as string] = err.message;
      });
      setErrors(errs);
      return;
    }
    await onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Supplier Information */}
      <Card>
        <CardHeader>
        <CardTitle style={{ fontWeight: 'bold', color: '#fc74dc' }}>Supplier Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[#2ba69a]">
            {(
              [
                ["supplierName", "Supplier Name"],
                ["shortName", "Short Name"],
                ["country", "Country"],
                ["beneficiaryName", "Beneficiary Name"],
                ["email", "Email"],
                ["phone", "Phone"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-y-3">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={(form[key as keyof FormData] as string) || ""}
                  onChange={handleChange(key as keyof FormData)}
                  required={["supplierName", "shortName", "country", "beneficiaryName"].includes(
                    key
                  )}
                />
                {errors[key] && <p className="text-red-600 text-sm">{errors[key]}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Separator */}
      <Separator />

      {/* Bank Information */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontWeight: 'bold', color: '#fc74dc' }}>
            Bank Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[#2ba69a]">
            {(
              [
                ["bankName", "Bank Name"],
                ["branch", "Branch"],
                ["swiftCode", "SWIFT Code"],
                ["accountNo", "Account No"],
                ["iban", "IBAN"],
                ["bankAddress", "Bank Address"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-y-3">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={(form[key as keyof FormData] as string) || ""}
                  onChange={handleChange(key as keyof FormData)}
                  required={["bankName", "branch", "swiftCode"].includes(key)}
                />
                {errors[key] && <p className="text-red-600 text-sm">{errors[key]}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex space-x-2">
        <Button type="submit">Save</Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
