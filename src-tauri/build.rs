use std::env;
use std::path::Path;

fn main() {
    tauri_build::build();
    
    // Copy SQLCipher and OpenSSL DLLs to output directory
    let out_dir = env::var("OUT_DIR").unwrap();
    let target_dir = Path::new(&out_dir).parent().unwrap().parent().unwrap().parent().unwrap();
    
    // List of required DLLs for SQLCipher
    let required_dlls = [
        "sqlcipher.dll",
        "libcrypto-3-x64.dll",
        "libssl-3-x64.dll",
        "zlib1.dll"
    ];
    
    // Try to copy from vcpkg installation directory
    let vcpkg_bin_dir = "C:\\Users\\Yogeswari\\vcpkg\\installed\\x64-windows\\bin";
    
    for dll in &required_dlls {
        let source_path = Path::new(vcpkg_bin_dir).join(dll);
        let target_path = target_dir.join(dll);
        
        // Try vcpkg path first
        if source_path.exists() {
            if let Err(e) = std::fs::copy(&source_path, &target_path) {
                eprintln!("Failed to copy {} from vcpkg: {}", dll, e);
            } else {
                println!("✓ Copied {} from vcpkg", dll);
            }
        } else {
            // Fallback to current directory
            if Path::new(dll).exists() {
                if let Err(e) = std::fs::copy(dll, &target_path) {
                    eprintln!("Failed to copy {} from current directory: {}", dll, e);
                } else {
                    println!("✓ Copied {} from current directory", dll);
                }
            } else {
                eprintln!("⚠ {} not found in vcpkg or current directory", dll);
            }
        }
    }
}