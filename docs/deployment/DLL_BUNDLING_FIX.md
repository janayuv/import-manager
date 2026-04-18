# SQLCipher DLL Bundling Fix

## Problem

The application was failing to start with the error:

```
The code execution cannot proceed because libcrypto-3-x64.dll was not found.
```

This occurred because SQLCipher depends on OpenSSL libraries that weren't being bundled with the application.

## Solution

### 1. Updated Build Script (`src-tauri/build.rs`)

The build script now copies all required DLLs:

- `sqlcipher.dll` - SQLCipher library
- `libcrypto-3-x64.dll` - OpenSSL crypto library
- `libssl-3-x64.dll` - OpenSSL SSL library
- `zlib1.dll` - Compression library

### 2. New DLL Copy Script (`scripts/copy-sqlcipher-dlls.ps1`)

A PowerShell script that copies all required DLLs from vcpkg to the project directory before building.

### 3. New Build Command

Added `build:tauri` script that runs the DLL copy script before building:

```bash
npm run build:tauri
```

## Usage

### For Development

```bash
npm run tauri dev
```

### For Production Build

```bash
npm run build:tauri
```

This will:

1. Copy all required SQLCipher DLLs from vcpkg
2. Build the frontend
3. Build the Tauri application with bundled DLLs

### Manual DLL Copy (if needed)

```bash
powershell -ExecutionPolicy Bypass -File scripts\copy-sqlcipher-dlls.ps1
```

## Verification

After building, check that these DLLs are present in the output directory:

- `sqlcipher.dll`
- `libcrypto-3-x64.dll`
- `libssl-3-x64.dll`
- `zlib1.dll`

## Testing Results

✅ **Build Test Successful**

- All 4 required DLLs copied successfully
- Application built without errors
- DLLs properly bundled with executable
- Installer created successfully

**Build Output:**

```
Copying SQLCipher DLLs for bundling
=====================================
Copying DLLs from: C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin
To: D:\Import-Manager\src-tauri

OK - Copied sqlcipher.dll
OK - Copied libcrypto-3-x64.dll
OK - Copied libssl-3-x64.dll
OK - Copied zlib1.dll

Summary:
  Copied: 4 DLLs
  Missing: 0 DLLs

SUCCESS - All DLLs copied successfully! Ready for building.
```

## Troubleshooting

If DLLs are missing:

1. Ensure SQLCipher is installed via vcpkg:

   ```bash
   C:\Users\Yogeswari\vcpkg\vcpkg.exe install sqlcipher
   ```

2. Verify vcpkg path in scripts:
   - Default: `C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin`
   - Update path in scripts if different

3. Run the DLL copy script manually to see detailed output

## Files Modified

- `src-tauri/build.rs` - Updated to copy all required DLLs
- `scripts/copy-sqlcipher-dlls.ps1` - New script for DLL copying
- `package.json` - Added `build:tauri` script

## Next Steps

1. Test the built application on a clean system to verify DLL bundling works
2. Distribute the installer: `src-tauri/target/release/bundle/nsis/import-manager_0.1.2_x64-setup.exe`
