use std::env;
use std::path::Path;

/// Bcrypt hash of the E2E/dev default password (`inzi@123$%`). Used when
/// `IMPORT_MANAGER_ADMIN_PASSWORD_HASH` is unset (non-Playwright builds) so local
/// `cargo run` / Vitest still work; release installers should set the env explicitly.
fn dev_admin_password_hash() -> &'static str {
    "$2b$12$GiJ5u10SABuUkJh9yI4x7unxEXasQ.j9KXMcZG/NoZWQGGJ6OPLLq"
}

fn main() {
    let git_hash = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=IMPORT_MANAGER_GIT_HASH={git_hash}");
    println!("cargo:rerun-if-changed=.git/HEAD");

    let build_date = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    println!("cargo:rustc-env=IMPORT_MANAGER_BUILD_DATE={build_date}");

    let playwright = env::var("VITE_PLAYWRIGHT").unwrap_or_default() == "1";
    println!("cargo:rerun-if-env-changed=VITE_PLAYWRIGHT");
    println!("cargo:rerun-if-env-changed=PROFILE");
    let profile = env::var("PROFILE").unwrap_or_default();

    let admin_user = env::var("IMPORT_MANAGER_ADMIN_USERNAME").unwrap_or_else(|_| "Jana".to_string());
    println!("cargo:rerun-if-env-changed=IMPORT_MANAGER_ADMIN_USERNAME");
    println!("cargo:rustc-env=IMPORT_MANAGER_ADMIN_USERNAME={admin_user}");

    let admin_hash = env::var("IMPORT_MANAGER_ADMIN_PASSWORD_HASH").unwrap_or_default();
    println!("cargo:rerun-if-env-changed=IMPORT_MANAGER_ADMIN_PASSWORD_HASH");

    let effective_hash = if playwright {
        dev_admin_password_hash().to_string()
    } else if !admin_hash.is_empty() {
        admin_hash
    } else if profile != "release" {
        dev_admin_password_hash().to_string()
    } else {
        String::new()
    };
    println!("cargo:rustc-env=IMPORT_MANAGER_ADMIN_PASSWORD_HASH={effective_hash}");

    if playwright {
        println!("cargo:rustc-env=IMPORT_MANAGER_PLAYWRIGHT_BUILD=1");
    } else {
        println!("cargo:rustc-env=IMPORT_MANAGER_PLAYWRIGHT_BUILD=0");
    }

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
