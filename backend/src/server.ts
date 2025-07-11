import express from "express";
import cors from "cors";
import { z } from "zod";
import db from "./db";
import { Supplier } from "./types";

const app = express();
app.use(cors(), express.json());

// Clean empty strings to undefined
function cleanInput<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === "" ? undefined : v])
  ) as T;
}

// Zod schema
const supplierSchema = z
  .object({
    id: z.string(),
    supplierName: z.string(),
    shortName: z.string(),
    country: z.string(),
    beneficiaryName: z.string(),
    bankName: z.string(),
    branch: z.string(),
    swiftCode: z.string(),
    accountNo: z.string().optional(),
    iban: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    bankAddress: z.string().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.accountNo && !data.iban) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either accountNo or iban must be provided",
        path: ["accountNo"],
      });
    }
  });

// Create supplier
app.post("/api/suppliers", (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const s = parsed.data;

  // Ensure all fields are defined
  const full: Supplier = {
    id: s.id,
    supplierName: s.supplierName,
    shortName: s.shortName,
    country: s.country,
    email: s.email,
    phone: s.phone,
    beneficiaryName: s.beneficiaryName,
    bankName: s.bankName,
    branch: s.branch,
    bankAddress: s.bankAddress,
    accountNo: s.accountNo,
    iban: s.iban,
    swiftCode: s.swiftCode,
    isActive: s.isActive ? 1 : 0, // ✅ convert to SQLite-compatible value
  };

  const stmt = db.prepare(`
    INSERT INTO Supplier (
      id, supplierName, shortName, country, email, phone,
      beneficiaryName, bankName, branch, bankAddress,
      accountNo, iban, swiftCode, isActive
    ) VALUES (
      @id, @supplierName, @shortName, @country, @email, @phone,
      @beneficiaryName, @bankName, @branch, @bankAddress,
      @accountNo, @iban, @swiftCode, @isActive
    )
  `);

  stmt.run(full);
  res.status(201).json(full);
});

// Get all suppliers
app.get("/api/suppliers", (_req, res) => {
  const all = db.prepare("SELECT * FROM Supplier").all() as Supplier[];
  res.json(all);
});

// Get supplier by ID
app.get("/api/suppliers/:id", (req, res) => {
  const supplier = db
    .prepare("SELECT * FROM Supplier WHERE id = ?")
    .get(req.params.id) as Supplier;

  if (!supplier) return res.status(404).json({ error: "Not found" });
  res.json(supplier);
});

// Update supplier
app.put("/api/suppliers/:id", (req, res) => {
  const body = cleanInput(req.body);
  const parsed = supplierSchema.partial().safeParse(body);

  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const fields = Object.keys(parsed.data)
    .map((k) => `${k} = @${k}`)
    .join(", ");

  const stmt = db.prepare(`
    UPDATE Supplier SET ${fields} WHERE id = @id
  `);

  stmt.run({
    ...parsed.data,
    id: req.params.id,
    isActive:
      typeof parsed.data.isActive === "boolean"
        ? parsed.data.isActive ? 1 : 0
        : undefined,
  });

  const updated = db
    .prepare("SELECT * FROM Supplier WHERE id = ?")
    .get(req.params.id) as Supplier;

  res.json(updated);
});

// Delete supplier (if still needed, otherwise remove)
app.delete("/api/suppliers/:id", (req, res) => {
  db.prepare("DELETE FROM Supplier WHERE id = ?").run(req.params.id);
  res.status(204).send();
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
});
