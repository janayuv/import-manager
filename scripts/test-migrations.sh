#!/bin/bash
set -e

echo "Testing database migrations..."

# Create test directory
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Build the application
echo "Building application..."
cd src-tauri
cargo build --release

# Test migration functionality
echo "Testing migration runner..."
cargo test migrations::tests::test_migration_status

# Create a new migration file
echo "Creating test migration..."
cat > "migrations/V2__add_test_column.sql" << 'EOF'
-- V2__add_test_column.sql
-- Add a test column to suppliers table

ALTER TABLE suppliers ADD COLUMN test_column TEXT DEFAULT 'test_value';
EOF

echo "Test migration created. To test:"
echo "1. Run the application - it should apply the new migration"
echo "2. Check that the test_column was added to suppliers table"
echo "3. Verify migration status in refinery_schema_history table"

# Cleanup
echo ""
echo "To clean up test migration:"
echo "rm src-tauri/migrations/V2__add_test_column.sql"

echo ""
echo "Test completed. To clean up:"
echo "rm -rf $TEST_DIR"
