use std::process::Command;

fn main() {
    // Hash corto de git para `app_version` del modo estudio. Si no hay git
    // (tarball, build reproducible) queda vacío y solo se registra la semver.
    let hash = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    println!("cargo:rustc-env=ANNOTIX_GIT_HASH={}", hash);
    println!("cargo:rerun-if-changed=../.git/HEAD");

    tauri_build::build()
}
