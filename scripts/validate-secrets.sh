#!/bin/bash
set -e

echo "Validating repository for secrets..."

# Check for common secret patterns
echo "Checking for potential secrets in code..."

# Patterns that might indicate secrets
SECRET_PATTERNS=(
    "password.*=.*['\"][^'\"]*['\"]"
    "secret.*=.*['\"][^'\"]*['\"]"
    "key.*=.*['\"][^'\"]*['\"]"
    "token.*=.*['\"][^'\"]*['\"]"
    "api_key.*=.*['\"][^'\"]*['\"]"
    "private_key.*=.*['\"][^'\"]*['\"]"
)

# Live API key patterns (should never be in code)
LIVE_KEY_PATTERNS=(
    "sk_live_"
    "pk_live_"
    "AKIA[0-9A-Z]{16}"
    "ghp_[0-9a-zA-Z]{36}"
    "gho_[0-9a-zA-Z]{36}"
    "ghu_[0-9a-zA-Z]{36}"
    "ghs_[0-9a-zA-Z]{36}"
    "ghr_[0-9a-zA-Z]{36}"
)

# Directories to exclude
EXCLUDE_DIRS=(
    ".git"
    "node_modules"
    "target"
    "dist"
    ".next"
    ".nuxt"
    "build"
)

# Build exclude pattern
EXCLUDE_PATTERN=""
for dir in "${EXCLUDE_DIRS[@]}"; do
    EXCLUDE_PATTERN="$EXCLUDE_PATTERN -path ./$dir -prune -o"
done

# Check for live API keys (critical)
echo "Checking for live API keys..."
LIVE_KEYS_FOUND=false
for pattern in "${LIVE_KEY_PATTERNS[@]}"; do
    if find . $EXCLUDE_PATTERN -type f -exec grep -l "$pattern" {} \; 2>/dev/null; then
        echo "ERROR: Live API key pattern found: $pattern"
        LIVE_KEYS_FOUND=true
    fi
done

if [ "$LIVE_KEYS_FOUND" = true ]; then
    echo "CRITICAL: Live API keys found in repository!"
    exit 1
fi

# Check for potential secrets (warning)
echo "Checking for potential secrets..."
SECRETS_FOUND=false
for pattern in "${SECRET_PATTERNS[@]}"; do
    if find . $EXCLUDE_PATTERN -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.rs" \) -exec grep -l "$pattern" {} \; 2>/dev/null | grep -v "test\|example\|dummy\|mock"; then
        echo "WARNING: Potential secret pattern found: $pattern"
        SECRETS_FOUND=true
    fi
done

# Check for large files that might contain secrets
echo "Checking for large files..."
find . $EXCLUDE_PATTERN -type f -size +1M -not -name "*.db" -not -name "*.sqlite" -not -name "*.sqlite3" 2>/dev/null | while read file; do
    echo "WARNING: Large file found: $file ($(du -h "$file" | cut -f1))"
done

# Check for .env files in repository
echo "Checking for environment files..."
if find . -name ".env*" -not -path "./.git/*" 2>/dev/null; then
    echo "WARNING: .env files found in repository"
    echo "Make sure they don't contain sensitive data"
fi

# Check for credential files
echo "Checking for credential files..."
CREDENTIAL_FILES=(
    "credentials.json"
    "service-account.json"
    "key.json"
    "*.pem"
    "*.key"
    "*.p12"
    "*.pfx"
)

for pattern in "${CREDENTIAL_FILES[@]}"; do
    if find . $EXCLUDE_PATTERN -name "$pattern" 2>/dev/null; then
        echo "WARNING: Credential file found: $pattern"
        echo "Make sure these don't contain sensitive data"
    fi
done

if [ "$SECRETS_FOUND" = true ]; then
    echo ""
    echo "WARNINGS found. Please review the above files for potential secrets."
    echo "If these are false positives, add them to the exclude patterns."
    exit 1
else
    echo ""
    echo "✅ No secrets found in repository"
fi
