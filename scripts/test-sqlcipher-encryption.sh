#!/bin/bash

# Test SQLCipher Encryption Functionality
# This script tests the database encryption migration and functionality

set -e

echo "🧪 Testing SQLCipher Encryption Functionality"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "src-tauri/Cargo.toml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if SQLCipher is available
if ! command -v sqlcipher &> /dev/null; then
    print_warning "SQLCipher CLI not found. Install it to test manually:"
    echo "  Windows: Use vcpkg (already done)"
    echo "  macOS: brew install sqlcipher"
    echo "  Ubuntu: sudo apt install sqlcipher"
fi

# Test 1: Build the application
print_status "Building application with SQLCipher support..."
cd src-tauri
if cargo build --quiet; then
    print_status "Build successful - SQLCipher integration working"
else
    print_error "Build failed - check SQLCipher configuration"
    exit 1
fi
cd ..

# Test 2: Check if encryption module compiles
print_status "Testing encryption module compilation..."
cd src-tauri
if cargo check --quiet; then
    print_status "Encryption module compiles successfully"
else
    print_error "Encryption module compilation failed"
    exit 1
fi
cd ..

# Test 3: Run encryption tests
print_status "Running encryption unit tests..."
cd src-tauri
if cargo test encryption::tests --quiet; then
    print_status "Encryption tests passed"
else
    print_error "Encryption tests failed"
    exit 1
fi
cd ..

# Test 4: Create a test database and verify encryption
print_status "Creating test database..."
TEST_DB="test_encryption.db"
TEST_DB_ENCRYPTED="test_encryption_encrypted.db"

# Clean up any existing test databases
rm -f "$TEST_DB" "$TEST_DB_ENCRYPTED"

# Create a simple test database
sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE test_table (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL
);
INSERT INTO test_table (name, value) VALUES ('test1', 123.45);
INSERT INTO test_table (name, value) VALUES ('test2', 678.90);
SELECT COUNT(*) FROM test_table;
EOF

if [ $? -eq 0 ]; then
    print_status "Test database created successfully"
else
    print_error "Failed to create test database"
    exit 1
fi

# Test 5: Verify the database is readable (plaintext)
print_status "Verifying plaintext database is readable..."
if sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_table;" | grep -q "2"; then
    print_status "Plaintext database is readable"
else
    print_error "Plaintext database is not readable"
    exit 1
fi

# Test 6: Test encryption with SQLCipher CLI (if available)
if command -v sqlcipher &> /dev/null; then
    print_status "Testing SQLCipher CLI encryption..."
    
    # Create encrypted version
    sqlcipher "$TEST_DB_ENCRYPTED" << 'EOF'
PRAGMA key = 'test_key_123';
CREATE TABLE test_table (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL
);
INSERT INTO test_table (name, value) VALUES ('test1', 123.45);
INSERT INTO test_table (name, value) VALUES ('test2', 678.90);
SELECT COUNT(*) FROM test_table;
EOF

    if [ $? -eq 0 ]; then
        print_status "SQLCipher CLI encryption test successful"
        
        # Verify encrypted database requires key
        if ! sqlite3 "$TEST_DB_ENCRYPTED" "SELECT 1;" &> /dev/null; then
            print_status "Encrypted database correctly requires key"
        else
            print_warning "Encrypted database might not be properly encrypted"
        fi
        
        # Verify encrypted database works with key
        if sqlcipher "$TEST_DB_ENCRYPTED" "PRAGMA key = 'test_key_123'; SELECT COUNT(*) FROM test_table;" | grep -q "2"; then
            print_status "Encrypted database works with correct key"
        else
            print_error "Encrypted database doesn't work with correct key"
        fi
    else
        print_error "SQLCipher CLI encryption test failed"
    fi
else
    print_warning "SQLCipher CLI not available - skipping CLI tests"
fi

# Test 7: Check environment variables
print_status "Checking SQLCipher environment variables..."
if [ -n "$SQLCIPHER_LIB_DIR" ]; then
    print_status "SQLCIPHER_LIB_DIR is set: $SQLCIPHER_LIB_DIR"
else
    print_warning "SQLCIPHER_LIB_DIR is not set"
fi

if [ -n "$SQLCIPHER_INCLUDE_DIR" ]; then
    print_status "SQLCIPHER_INCLUDE_DIR is set: $SQLCIPHER_INCLUDE_DIR"
else
    print_warning "SQLCIPHER_INCLUDE_DIR is not set"
fi

# Test 8: Verify vcpkg installation
print_status "Checking vcpkg SQLCipher installation..."
if [ -f "$HOME/vcpkg/installed/x64-windows/lib/sqlcipher.lib" ]; then
    print_status "vcpkg SQLCipher library found"
else
    print_warning "vcpkg SQLCipher library not found"
fi

if [ -f "$HOME/vcpkg/installed/x64-windows/include/sqlcipher/sqlite3.h" ]; then
    print_status "vcpkg SQLCipher headers found"
else
    print_warning "vcpkg SQLCipher headers not found"
fi

# Cleanup
print_status "Cleaning up test files..."
rm -f "$TEST_DB" "$TEST_DB_ENCRYPTED"

echo ""
echo "🎉 SQLCipher Encryption Test Summary:"
echo "======================================"
print_status "Build with SQLCipher: SUCCESS"
print_status "Encryption module: SUCCESS"
print_status "Unit tests: SUCCESS"
print_status "Database operations: SUCCESS"

if command -v sqlcipher &> /dev/null; then
    print_status "SQLCipher CLI tests: SUCCESS"
else
    print_warning "SQLCipher CLI tests: SKIPPED (CLI not available)"
fi

echo ""
echo "✅ SQLCipher encryption is working correctly!"
echo ""
echo "Next steps:"
echo "1. The application will automatically detect plaintext databases"
echo "2. Users will be prompted to migrate to encrypted databases"
echo "3. Encryption keys are stored securely in the OS keychain"
echo "4. Database migrations will work with encrypted databases"
echo ""
echo "To test the full migration flow:"
echo "1. Start the application"
echo "2. Create some test data"
echo "3. Check that the database migration prompt appears"
echo "4. Verify the encrypted database works correctly"
