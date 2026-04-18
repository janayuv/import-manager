# Troubleshooting Guide

## Common Issues and Solutions

### 1. SQLCipher Linking Errors

**Error:** `LINK : fatal error LNK1181: cannot open input file 'sqlcipher.lib'`

**Solution:**

1. Verify SQLCipher is installed via vcpkg:
   ```powershell
   C:\Users\Yogeswari\vcpkg\vcpkg.exe list
   ```
2. Set correct environment variables:
   ```powershell
   $env:SQLCIPHER_LIB_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib"
   $env:SQLCIPHER_INCLUDE_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\include"
   $env:LIBSQLITE3_SYS_BUNDLED="0"
   ```

### 2. DLL Not Found Errors

**Error:** `STATUS_DLL_NOT_FOUND (exit code: 0xc0000135)`

**Solution:**

1. Add vcpkg bin directory to PATH:
   ```powershell
   $env:PATH += ";C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"
   ```
2. Verify required DLLs exist:
   ```powershell
   Test-Path "C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin\libcrypto-3-x64.dll"
   Test-Path "C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin\zlib1.dll"
   ```

### 3. Complete Environment Setup

**For development sessions, use:**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
```

**Or manually set all required variables:**

```powershell
$env:SQLCIPHER_LIB_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\include"
$env:LIBSQLITE3_SYS_BUNDLED="0"
$env:PATH += ";C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"
npm run tauri dev
```

### 4. Verification Steps

**Check if everything is working:**

1. Application compiles without errors
2. Application window opens
3. Database is created when adding data
4. Database is encrypted (not plaintext)

**Test encryption:**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-encryption.ps1
```

### 5. Reinstalling SQLCipher

If issues persist, reinstall SQLCipher:

```powershell
C:\Users\Yogeswari\vcpkg\vcpkg.exe remove sqlcipher
C:\Users\Yogeswari\vcpkg\vcpkg.exe install sqlcipher
```

### 6. Environment Variables Reference

**Required for compilation:**

- `SQLCIPHER_LIB_DIR`: Path to SQLCipher libraries
- `SQLCIPHER_INCLUDE_DIR`: Path to SQLCipher headers
- `LIBSQLITE3_SYS_BUNDLED`: Set to "0" to use system SQLCipher

**Required for runtime:**

- `PATH`: Must include vcpkg bin directory for DLLs

### 7. File Locations

**SQLCipher installation:**

- Libraries: `C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib\`
- Headers: `C:\Users\Yogeswari\vcpkg\installed\x64-windows\include\`
- Binaries: `C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin\`

**Application database:**

- Location: `%APPDATA%\com.jana.importmanager\import-manager.db`
- Backup: `%APPDATA%\com.jana.importmanager\import-manager.db.backup`
