//! Host-level commands (reboot, shutdown, system commands).

use anyhow::Result;
use std::process::Command;

/// Run a command and log its output.
pub fn run(name: &str, args: &[&str]) -> Result<()> {
    tracing::info!("Running: {} {}", name, args.join(" "));
    let output = Command::new(name).args(args).output()?;

    if !output.stdout.is_empty() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        tracing::info!("stdout: {}", stdout.trim());
    }
    if !output.stderr.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("stderr: {}", stderr.trim());
    }

    if !output.status.success() {
        anyhow::bail!(
            "Command '{}' failed with exit code {:?}",
            name,
            output.status.code()
        );
    }

    Ok(())
}

/// Run a command and return its combined stdout/stderr output.
pub fn combined_output(name: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(name).args(args).output()?;
    let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(combined)
}

/// Run a command and return its stdout.
pub fn output(name: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(name).args(args).output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Command '{}' failed: {}", name, stderr.trim());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Trigger an immediate system reboot.
pub fn immediate_reboot() {
    tracing::warn!("Initiating immediate system reboot");

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("shutdown.exe")
            .args(["/r", "/t", "3"])
            .spawn();
    }

    #[cfg(all(unix, feature = "insecure"))]
    {
        let _ = Command::new("sudo")
            .args(["/sbin/shutdown", "-r", "now"])
            .spawn();
    }

    #[cfg(all(unix, feature = "multiuser"))]
    {
        let _ = Command::new("/sbin/shutdown")
            .args(["-r", "now"])
            .spawn();
    }
}

/// Trigger an immediate system shutdown.
pub fn immediate_shutdown(cause: &str) {
    tracing::warn!("Initiating immediate system shutdown: {}", cause);

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("shutdown.exe")
            .args(["/s", "/t", "3"])
            .spawn();
    }

    #[cfg(all(unix, feature = "insecure"))]
    {
        let _ = Command::new("sudo")
            .args(["/sbin/shutdown", "-h", "now"])
            .spawn();
    }

    #[cfg(all(unix, feature = "multiuser"))]
    {
        let _ = Command::new("/sbin/shutdown")
            .args(["-h", "now"])
            .spawn();
    }
}
