use std::env;
use std::path::Path;

fn main() {
    tauri_build::build();

    // Only copy DLLs if we're not in CI environment
    if env::var("CI").is_ok() {
        println!("Skipping DLL copy in CI environment");
        return;
    }

    // Copy SQLCipher and OpenSSL DLLs to output directory
    let out_dir = env::var("OUT_DIR").unwrap();
    let target_dir = Path::new(&out_dir)
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap();

    // List of required DLLs for SQLCipher
    let required_dlls = [
        "sqlcipher.dll",
        "libcrypto-3-x64.dll",
        "libssl-3-x64.dll",
        "zlib1.dll",
    ];

    // Try multiple possible vcpkg installation directories
    let possible_vcpkg_dirs = [
        "C:\\Users\\Yogeswari\\vcpkg\\installed\\x64-windows\\bin",
        "C:\\vcpkg\\installed\\x64-windows\\bin",
        "C:\\Users\\runneradmin\\vcpkg\\installed\\x64-windows\\bin",
    ];

    for dll in &required_dlls {
        let mut copied = false;

        // Try vcpkg paths first
        for vcpkg_dir in &possible_vcpkg_dirs {
            let source_path = Path::new(vcpkg_dir).join(dll);
            let target_path = target_dir.join(dll);

            if source_path.exists() {
                if let Err(e) = std::fs::copy(&source_path, &target_path) {
                    eprintln!("Failed to copy {dll} from {vcpkg_dir}: {e}");
                } else {
                    println!("✓ Copied {dll} from {vcpkg_dir}");
                    copied = true;
                    break;
                }
            }
        }

        // Fallback to current directory if not found in vcpkg
        if !copied {
            if Path::new(dll).exists() {
                let target_path = target_dir.join(dll);
                if let Err(e) = std::fs::copy(dll, &target_path) {
                    eprintln!("Failed to copy {dll} from current directory: {e}");
                } else {
                    println!("✓ Copied {dll} from current directory");
                }
            } else {
                eprintln!("⚠ {dll} not found in any vcpkg directory or current directory");
            }
        }
    }
}
