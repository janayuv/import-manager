# Installer Issues Fix

## Problems Identified

### 1. SQLCipher DLL Not Found

```
The code execution cannot proceed because sqlcipher.dll was not found.
```

### 2. Data Directory Creation Error

```
We couldn't create the data directory
Microsoft Edge can't read and write to its data directory:
C:\Users\ITadmin\AppData\Local\com.jana.importmanager\EBWebView
```

## Root Causes

1. **DLL Bundling Issue**: SQLCipher and OpenSSL DLLs weren't being properly bundled with the installer
2. **WebView2 Runtime**: Missing or inaccessible WebView2 runtime causing data directory issues
3. **Permission Issues**: App data directory permissions not properly set

## Solutions Implemented

### 1. Enhanced DLL Bundling

**Updated Tauri Configuration** (`src-tauri/tauri.conf.json`):

```json
"bundle": {
  "active": true,
  "targets": "all",
  "resources": [
    "sqlcipher.dll",
    "libcrypto-3-x64.dll",
    "libssl-3-x64.dll",
    "zlib1.dll"
  ]
}
```

**Updated Build Script** (`src-tauri/build.rs`):

- Copies all required DLLs from vcpkg to target directory
- Includes fallback to current directory
- Provides detailed logging

### 2. Comprehensive Fix Script

**New Script** (`scripts/fix-installer-issues.ps1`):

- Copies SQLCipher DLLs
- Checks WebView2 runtime installation
- Sets up app data directories with proper permissions
- Verifies all components are ready

### 3. Updated Build Process

**New Build Command** (`package.json`):

```json
"build:tauri": "powershell -ExecutionPolicy Bypass -File scripts\\fix-installer-issues.ps1 && npm run tauri build"
```

## Usage

### For Production Build

```bash
npm run build:tauri
```

This will:

1. Copy all required SQLCipher DLLs
2. Check WebView2 runtime status
3. Set up app data directories with proper permissions
4. Build the application with bundled resources
5. Create installers (MSI and NSIS)

### Manual Fix (if needed)

```bash
powershell -ExecutionPolicy Bypass -File scripts\fix-installer-issues.ps1
```

## WebView2 Runtime Requirements

The application requires Microsoft Edge WebView2 Runtime. If not installed:

1. **Download**: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
2. **Install**: Run the installer as administrator
3. **Verify**: The fix script will check for WebView2 installation

## App Data Directory Structure

The application creates these directories:

```
%LOCALAPPDATA%\com.jana.importmanager\
├── import-manager.db
├── import-manager.db.backup
└── EBWebView\
    └── (WebView2 data files)
```

## Testing Results

✅ **Build Test Successful**

- All 4 required DLLs copied and bundled
- Application built without errors
- Installers created successfully
- App data directories set up with proper permissions

**Build Output:**

```
Fixing installer issues...
==========================
Step 1: Copying SQLCipher DLLs...
OK - Copied sqlcipher.dll
OK - Copied libcrypto-3-x64.dll
OK - Copied libssl-3-x64.dll
OK - Copied zlib1.dll

Step 2: Checking WebView2 runtime...
WARNING - WebView2 runtime not found

Step 3: Setting up app data directory...
OK - Set proper permissions on app data directory

Step 4: Verifying DLLs...
OK - All DLLs found

SUCCESS - Installer issues fixed!
```

## Troubleshooting

### If DLLs are still missing:

1. Ensure SQLCipher is installed via vcpkg
2. Run the fix script manually to see detailed output
3. Check vcpkg path in scripts

### If data directory issues persist:

1. Install WebView2 runtime
2. Run installer as administrator
3. Check Windows permissions on app data directory

### If WebView2 issues occur:

1. Download and install WebView2 runtime
2. Ensure user has write permissions to `%LOCALAPPDATA%`
3. Try running the application as administrator once to set up directories

## Files Modified

- `src-tauri/tauri.conf.json` - Added resource bundling
- `src-tauri/build.rs` - Enhanced DLL copying
- `scripts/fix-installer-issues.ps1` - New comprehensive fix script
- `package.json` - Updated build command

## Next Steps

1. Test the new installer on a clean system
2. Verify WebView2 runtime installation
3. Distribute the updated installer: `src-tauri/target/release/bundle/nsis/import-manager_0.1.2_x64-setup.exe`
