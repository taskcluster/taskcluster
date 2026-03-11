//! Multiuser task context and ownership utilities.
//!
//! Provides helpers for running tasks as dedicated OS users, including
//! directory/file creation with correct ownership and permission management.

use anyhow::Result;
use std::path::{Path, PathBuf};

use crate::process::PlatformData;
use crate::runtime::OsUser;

/// Per-task context holding the task directory and associated OS user.
#[derive(Debug, Clone)]
pub struct TaskContext {
    /// Root directory for this task's files.
    pub task_dir: PathBuf,
    /// OS user that owns this task.
    pub user: OsUser,
}

impl TaskContext {
    pub fn new(task_dir: PathBuf, user: OsUser) -> Self {
        Self { task_dir, user }
    }
}

/// Recursively change ownership of all files and directories under `dir` to
/// `new_owner`. When `cache` is true the operation is on a cache directory
/// (no behavioural difference on POSIX today, but the flag is carried for
/// parity with the Go implementation).
#[cfg(unix)]
pub fn change_ownership_in_dir(dir: &Path, new_owner: &OsUser, _cache: bool) -> Result<()> {
    let chown_bin = chown_path();
    let owner_spec = chown_owner_spec(&new_owner.name);

    let status = std::process::Command::new(chown_bin)
        .args(["-R", &owner_spec, &dir.display().to_string()])
        .status()?;

    if !status.success() {
        anyhow::bail!(
            "chown -R {} {} failed with exit code {:?}",
            owner_spec,
            dir.display(),
            status.code()
        );
    }
    Ok(())
}

/// Make a file or directory read-writable for `user`. When `recurse` is true,
/// the operation is applied recursively.
#[cfg(unix)]
pub fn make_file_or_dir_read_writable_for_user(
    recurse: bool,
    path: &Path,
    user: &OsUser,
) -> Result<()> {
    // First chown to the user so they own the path.
    let chown_bin = chown_path();
    let owner_spec = chown_owner_spec(&user.name);

    let mut args = vec![owner_spec.as_str()];
    if recurse {
        args.insert(0, "-R");
    }
    args.push(&*path.to_string_lossy());

    // We need to build args as owned strings for the path.
    let path_str = path.display().to_string();
    let mut cmd_args: Vec<&str> = Vec::new();
    if recurse {
        cmd_args.push("-R");
    }
    cmd_args.push(&owner_spec);
    cmd_args.push(&path_str);

    let status = std::process::Command::new(chown_bin)
        .args(&cmd_args)
        .status()?;
    if !status.success() {
        anyhow::bail!(
            "chown {} failed with exit code {:?}",
            cmd_args.join(" "),
            status.code()
        );
    }

    // Then chmod to ensure read-write.
    let chmod_bin = "/bin/chmod";
    let mut chmod_args: Vec<&str> = Vec::new();
    if recurse {
        chmod_args.push("-R");
    }
    chmod_args.push("u+rw");
    chmod_args.push(&path_str);

    let status = std::process::Command::new(chmod_bin)
        .args(&chmod_args)
        .status()?;
    if !status.success() {
        anyhow::bail!(
            "chmod {} failed with exit code {:?}",
            chmod_args.join(" "),
            status.code()
        );
    }
    Ok(())
}

/// Create a directory (and all parents) as the task user.
///
/// In multiuser mode this shells out to the current executable with a
/// `create-dir` subcommand so that the directory is created with the correct
/// ownership from the start. In insecure mode it simply calls `mkdir -p`.
pub fn mkdir_all_task_user(dir: &Path, pd: &PlatformData) -> Result<()> {
    #[cfg(feature = "multiuser")]
    {
        if pd.uid.is_some() {
            // Shell out to self with create-dir subcommand so the directory is
            // created under the target uid/gid.
            let exe = std::env::current_exe()?;
            let mut cmd = std::process::Command::new(&exe);
            cmd.arg("create-dir");
            cmd.arg(dir.display().to_string());

            // Apply uid/gid via pre_exec so the directory is created as the
            // task user.
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                let uid = pd.uid.unwrap();
                let gid = pd.gid.unwrap_or(uid);
                let groups = pd.groups.clone();
                unsafe {
                    cmd.pre_exec(move || {
                        if !groups.is_empty() {
                            let gids: Vec<libc::gid_t> =
                                groups.iter().map(|g| *g as libc::gid_t).collect();
                            if libc::setgroups(gids.len() as libc::c_int, gids.as_ptr()) != 0 {
                                return Err(std::io::Error::last_os_error());
                            }
                        }
                        if libc::setgid(gid as _) != 0 {
                            return Err(std::io::Error::last_os_error());
                        }
                        if libc::setuid(uid as _) != 0 {
                            return Err(std::io::Error::last_os_error());
                        }
                        Ok(())
                    });
                }
            }

            let status = cmd.status()?;
            if !status.success() {
                anyhow::bail!(
                    "create-dir subcommand failed for {} (exit code {:?})",
                    dir.display(),
                    status.code()
                );
            }
            return Ok(());
        }
    }

    // Fallback / insecure mode: just create the directory directly.
    let _ = pd;
    std::fs::create_dir_all(dir)?;
    Ok(())
}

/// Create a file as the task user (ensures it is owned by the correct uid/gid).
pub fn create_file_as_task_user(file: &Path, pd: &PlatformData) -> Result<()> {
    // Ensure parent directory exists.
    if let Some(parent) = file.parent() {
        mkdir_all_task_user(parent, pd)?;
    }

    #[cfg(feature = "multiuser")]
    {
        if let (Some(uid), Some(gid)) = (pd.uid, pd.gid) {
            // Create the file as root, then chown it.
            std::fs::write(file, b"")?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::chown;
                chown(file, Some(uid), Some(gid))?;
            }
            return Ok(());
        }
    }

    let _ = pd;
    std::fs::write(file, b"")?;
    Ok(())
}

/// Read stored user credentials from a JSON file.
///
/// The file is expected to contain `{"name": "...", "password": "..."}`.
pub fn stored_user_credentials(path: &Path) -> Result<OsUser> {
    let content = std::fs::read_to_string(path)?;
    let user: OsUser = serde_json::from_str(&content)?;
    Ok(user)
}

// ---------------------------------------------------------------------------
// Platform-specific helpers
// ---------------------------------------------------------------------------

/// Return the path to the chown binary for the current platform.
#[cfg(unix)]
fn chown_path() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "/bin/chown"
    }
    #[cfg(target_os = "macos")]
    {
        "/usr/sbin/chown"
    }
    #[cfg(target_os = "freebsd")]
    {
        "/usr/sbin/chown"
    }
}

/// Return the owner:group spec for chown on the current platform.
///
/// On macOS the staff group is the default primary group; on Linux and
/// FreeBSD we use user:user.
#[cfg(unix)]
fn chown_owner_spec(username: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        format!("{}:staff", username)
    }
    #[cfg(target_os = "linux")]
    {
        format!("{}:{}", username, username)
    }
    #[cfg(target_os = "freebsd")]
    {
        format!("{}:{}", username, username)
    }
}
