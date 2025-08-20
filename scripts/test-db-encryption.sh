#!/bin/bash
set -e

echo "Testing database encryption migration..."

# Create test directory
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Build the application
echo "Building application..."
cd src-tauri
cargo build --release

# Create a sample plaintext database
echo "Creating sample plaintext database..."
cat > "$TEST_DIR/sample_data.sql" << 'EOF'
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    email TEXT NOT NULL
);

INSERT INTO suppliers (id, supplier_name, email) VALUES 
('test-1', 'Test Supplier 1', 'test1@example.com'),
('test-2', 'Test Supplier 2', 'test2@example.com');

CREATE TABLE shipments (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL
);

INSERT INTO shipments (id, supplier_id, invoice_number) VALUES 
('ship-1', 'test-1', 'INV-001'),
('ship-2', 'test-2', 'INV-002');
EOF

# Create plaintext database
sqlite3 "$TEST_DIR/plaintext.db" < "$TEST_DIR/sample_data.sql"

echo "Sample database created with:"
sqlite3 "$TEST_DIR/plaintext.db" "SELECT COUNT(*) as supplier_count FROM suppliers;"
sqlite3 "$TEST_DIR/plaintext.db" "SELECT COUNT(*) as shipment_count FROM shipments;"

# Test encryption (this would be done by the app)
echo ""
echo "To test encryption migration:"
echo "1. Copy $TEST_DIR/plaintext.db to your app data directory"
echo "2. Run the application - it should detect and migrate the database"
echo "3. Verify the migrated database requires a key to open"

# Cleanup
echo ""
echo "Test completed. To clean up:"
echo "rm -rf $TEST_DIR"
