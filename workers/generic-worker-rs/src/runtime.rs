//! Runtime utilities: OS user management, Ed25519 key creation, and platform helpers.

use anyhow::Result;
use rand::Rng;

/// An OS user for task execution.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OsUser {
    pub name: String,
    pub password: String,
}

impl OsUser {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            password: generate_password(),
        }
    }

    /// Get the user's UID (Unix only).
    #[cfg(unix)]
    pub fn uid(&self) -> Result<String> {
        let user = nix::unistd::User::from_name(&self.name)?
            .ok_or_else(|| anyhow::anyhow!("user '{}' not found", self.name))?;
        Ok(user.uid.to_string())
    }

    /// Get the user's GID (Unix only).
    #[cfg(unix)]
    pub fn gid(&self) -> Result<String> {
        let user = nix::unistd::User::from_name(&self.name)?
            .ok_or_else(|| anyhow::anyhow!("user '{}' not found", self.name))?;
        Ok(user.gid.to_string())
    }

    /// Get supplementary group IDs (Unix only).
    #[cfg(unix)]
    pub fn supplementary_groups(&self) -> Result<Vec<u32>> {
        let user = nix::unistd::User::from_name(&self.name)?
            .ok_or_else(|| anyhow::anyhow!("user '{}' not found", self.name))?;
        // Get supplementary groups via libc
        let gid = user.gid.as_raw() as i32;
        let c_name = std::ffi::CString::new(self.name.as_str())?;
        let mut ngroups: libc::c_int = 64;
        let mut groups: Vec<i32> = vec![0; ngroups as usize];
        unsafe {
            libc::getgrouplist(c_name.as_ptr(), gid, groups.as_mut_ptr(), &mut ngroups);
        }
        groups.truncate(ngroups.max(0) as usize);
        Ok(groups.iter().map(|g| *g as u32).collect())
    }

    #[cfg(windows)]
    pub fn uid(&self) -> Result<String> {
        // Windows doesn't use UIDs
        Ok("0".to_string())
    }

    #[cfg(windows)]
    pub fn gid(&self) -> Result<String> {
        Ok("0".to_string())
    }

    #[cfg(windows)]
    pub fn supplementary_groups(&self) -> Result<Vec<u32>> {
        Ok(Vec::new())
    }

    /// Create the OS user account.
    pub fn create(&self, ok_if_exists: bool) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            self.create_darwin(ok_if_exists)
        }
        #[cfg(target_os = "linux")]
        {
            self.create_linux(ok_if_exists)
        }
        #[cfg(target_os = "freebsd")]
        {
            self.create_freebsd(ok_if_exists)
        }
        #[cfg(target_os = "windows")]
        {
            self.create_windows(ok_if_exists)
        }
    }

    #[cfg(target_os = "macos")]
    fn create_darwin(&self, ok_if_exists: bool) -> Result<()> {
        use crate::host;

        // Check if user already exists
        if let Ok(_) = host::output("dscl", &[".", "-read", &format!("/Users/{}", self.name)]) {
            if ok_if_exists {
                return Ok(());
            }
            anyhow::bail!("user '{}' already exists", self.name);
        }

        // Find next available UID
        let uid = find_next_uid_darwin()?;

        // Create user via dscl
        host::run("dscl", &[".", "-create", &format!("/Users/{}", self.name)])?;
        host::run(
            "dscl",
            &[
                ".",
                "-create",
                &format!("/Users/{}", self.name),
                "UniqueID",
                &uid.to_string(),
            ],
        )?;
        host::run(
            "dscl",
            &[
                ".",
                "-create",
                &format!("/Users/{}", self.name),
                "PrimaryGroupID",
                "20",
            ],
        )?;
        host::run(
            "dscl",
            &[
                ".",
                "-create",
                &format!("/Users/{}", self.name),
                "UserShell",
                "/bin/bash",
            ],
        )?;
        host::run(
            "dscl",
            &[
                ".",
                "-create",
                &format!("/Users/{}", self.name),
                "NFSHomeDirectory",
                &format!("/Users/{}", self.name),
            ],
        )?;

        // Set password
        host::run(
            "dscl",
            &[
                ".",
                "-passwd",
                &format!("/Users/{}", self.name),
                &self.password,
            ],
        )?;

        // Create home directory
        host::run("createhomedir", &["-c", "-u", &self.name])?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    fn create_linux(&self, ok_if_exists: bool) -> Result<()> {
        use crate::host;

        let result = host::run(
            "useradd",
            &["-m", "-s", "/bin/bash", &self.name],
        );

        match result {
            Ok(()) => {}
            Err(e) => {
                if ok_if_exists && e.to_string().contains("already exists") {
                    return Ok(());
                }
                return Err(e);
            }
        }

        // Set password
        let passwd_input = format!("{}:{}", self.name, self.password);
        let mut child = std::process::Command::new("chpasswd")
            .stdin(std::process::Stdio::piped())
            .spawn()?;
        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin.write_all(passwd_input.as_bytes())?;
        }
        child.wait()?;

        Ok(())
    }

    #[cfg(target_os = "freebsd")]
    fn create_freebsd(&self, ok_if_exists: bool) -> Result<()> {
        use crate::host;

        let result = host::run(
            "pw",
            &[
                "user",
                "add",
                &self.name,
                "-m",
                "-s",
                "/bin/sh",
                "-h",
                "0",
            ],
        );

        match result {
            Ok(()) => Ok(()),
            Err(e) => {
                if ok_if_exists {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn create_windows(&self, ok_if_exists: bool) -> Result<()> {
        use crate::host;

        let result = host::run(
            "powershell",
            &[
                "-Command",
                &format!(
                    "New-LocalUser -Name '{}' -Password (ConvertTo-SecureString '{}' -AsPlainText -Force) -FullName '{}' -Description 'Generic Worker Task User'",
                    self.name, self.password, self.name
                ),
            ],
        );

        match result {
            Ok(()) => {
                // Add to Remote Desktop Users group
                let _ = host::run(
                    "powershell",
                    &[
                        "-Command",
                        &format!(
                            "Add-LocalGroupMember -Group 'Remote Desktop Users' -Member '{}'",
                            self.name
                        ),
                    ],
                );
                Ok(())
            }
            Err(e) => {
                if ok_if_exists {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }
}

/// Delete an OS user account.
pub fn delete_user(username: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        crate::host::run("dscl", &[".", "-delete", &format!("/Users/{}", username)])?;
    }
    #[cfg(target_os = "linux")]
    {
        crate::host::run("userdel", &["-f", "-r", username])?;
    }
    #[cfg(target_os = "freebsd")]
    {
        crate::host::run("pw", &["user", "del", username, "-r"])?;
    }
    #[cfg(target_os = "windows")]
    {
        crate::host::run(
            "powershell",
            &[
                "-Command",
                &format!("Remove-LocalUser -Name '{}'", username),
            ],
        )?;
    }
    Ok(())
}

/// Generate a random password for task users.
pub fn generate_password() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    let prefix = "gw!_"; // Ensure complexity requirements
    let suffix: String = (0..24)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();
    format!("{prefix}{suffix}")
}

/// Create an Ed25519 signing keypair and write the private key to a file.
/// The key is stored as base64-encoded seed (matching Go's format).
/// The public key is printed to stdout.
pub fn create_ed25519_keypair(path: &str) -> Result<()> {
    use base64::Engine;
    use ed25519_dalek::SigningKey;
    use rand::rngs::OsRng;

    let signing_key = SigningKey::generate(&mut OsRng);
    let seed = signing_key.to_bytes();
    let public_key = signing_key.verifying_key().to_bytes();

    // Write base64-encoded seed to file (matching Go's format)
    let encoded = base64::engine::general_purpose::STANDARD.encode(seed);
    std::fs::write(path, &encoded)?;

    // Print base64-encoded public key to stdout
    let pub_encoded = base64::engine::general_purpose::STANDARD.encode(public_key);
    println!("{}", pub_encoded);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

/// Install the worker as a system service (Windows only).
///
/// Uses NSSM (the Non-Sucking Service Manager) to install the generic worker
/// as a Windows service running under LocalSystem. This mirrors the Go
/// implementation's `deployService` function, configuring logging, rotation,
/// priority, and auto-start.
#[cfg(target_os = "windows")]
pub fn install_service(config_path: &str, nssm_path: Option<&str>) -> Result<()> {
    let nssm = nssm_path.unwrap_or("nssm.exe");
    crate::win32::install_nssm_service(
        config_path,
        nssm,
        crate::win32::DEFAULT_SERVICE_NAME,
    )
}

#[cfg(not(target_os = "windows"))]
pub fn install_service(_config_path: &str, _nssm_path: Option<&str>) -> Result<()> {
    anyhow::bail!("service installation is only supported on Windows")
}

/// Create the Windows user profile for the given OS user.
///
/// This calls the CreateProfile Win32 API before LoadUserProfile to prevent
/// Windows from creating a temporary profile. Should be called after the user
/// account has been created but before any process is run as that user.
#[cfg(target_os = "windows")]
impl OsUser {
    pub fn create_user_profile(&self) -> Result<()> {
        // Look up the user's SID via PowerShell.
        let sid = crate::host::output(
            "powershell",
            &[
                "-Command",
                &format!(
                    "(New-Object System.Security.Principal.NTAccount('{}')).Translate([System.Security.Principal.SecurityIdentifier]).Value",
                    self.name
                ),
            ],
        )?;
        let sid = sid.trim();
        tracing::info!("Creating profile for user {} (SID: {})", self.name, sid);
        let path = crate::win32::create_profile(sid, &self.name)?;
        tracing::info!("Created user profile at: {}", path);
        Ok(())
    }
}

/// Configure Windows auto-login for the given user. Sets the Winlogon
/// registry keys so that the user is automatically logged in at boot.
/// This is needed for non-headless (interactive desktop) task execution.
#[cfg(target_os = "windows")]
pub fn set_auto_login(user: &OsUser) -> Result<()> {
    crate::win32::set_auto_login(&user.name, &user.password)
}

/// Wait for the Windows User Profile Service (ProfSvc) to reach the running
/// state. On first boot after sysprep, ProfSvc may not be fully initialized
/// when the worker starts, causing LoadUserProfile to fail with
/// ERROR_NOT_READY.
#[cfg(target_os = "windows")]
pub fn wait_for_profile_service(timeout: std::time::Duration) -> Result<()> {
    crate::win32::wait_for_profile_service(timeout)
}

/// Get the parent directory for user home directories.
pub fn user_home_directories_parent() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "/Users"
    }
    #[cfg(target_os = "linux")]
    {
        "/home"
    }
    #[cfg(target_os = "freebsd")]
    {
        "/home"
    }
    #[cfg(target_os = "windows")]
    {
        // TODO: Read from registry
        "C:\\Users"
    }
}

#[cfg(target_os = "macos")]
fn find_next_uid_darwin() -> Result<u32> {
    let output = crate::host::output("dscl", &[".", "-list", "/Users", "UniqueID"])?;
    let mut max_uid: u32 = 500;
    for line in output.lines() {
        if let Some(uid_str) = line.split_whitespace().last() {
            if let Ok(uid) = uid_str.parse::<u32>() {
                if uid >= 500 && uid > max_uid {
                    max_uid = uid;
                }
            }
        }
    }
    Ok(max_uid + 1)
}
