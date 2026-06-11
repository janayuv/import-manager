use std::env;

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

    if playwright {
        println!("cargo:rustc-env=IMPORT_MANAGER_PLAYWRIGHT_BUILD=1");
    } else {
        println!("cargo:rustc-env=IMPORT_MANAGER_PLAYWRIGHT_BUILD=0");
    }

    tauri_build::build();
}
