CREATE TABLE IF NOT EXISTS shipment_import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    inserted_rows INTEGER NOT NULL,
    skipped_rows INTEGER NOT NULL,
    error_rows INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
