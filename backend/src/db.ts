import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.resolve(__dirname, "../data/dev.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS Supplier (
    id TEXT PRIMARY KEY,
    supplierName TEXT NOT NULL,
    shortName TEXT NOT NULL,
    country TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    beneficiaryName TEXT NOT NULL,
    bankName TEXT NOT NULL,
    branch TEXT NOT NULL,
    bankAddress TEXT,
    accountNo TEXT,
    iban TEXT,
    swiftCode TEXT NOT NULL,
    isActive BOOLEAN DEFAULT 1 -- ✅ added
  );
`);

export default db;
