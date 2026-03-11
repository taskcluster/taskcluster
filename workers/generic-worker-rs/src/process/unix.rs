//! Unix-specific process platform data.

use tokio::process::Command as TokioCommand;

/// Platform-specific data for process execution on Unix.
#[derive(Debug, Clone, Default)]
pub struct PlatformData {
    /// UID to run the process as (multiuser mode).
    pub uid: Option<u32>,
    /// GID to run the process as (multiuser mode).
    pub gid: Option<u32>,
    /// Supplementary groups (multiuser mode).
    pub groups: Vec<u32>,
}

impl PlatformData {
    /// Apply platform-specific settings to a command.
    ///
    /// In multiuser mode, this sets uid, gid, and supplementary groups via a
    /// pre_exec callback that calls setgroups/setgid/setuid in the correct
    /// order (groups first, then gid, then uid -- because once we drop root
    /// by calling setuid we can no longer change groups).
    pub fn apply(&self, cmd: &mut TokioCommand) {
        #[cfg(feature = "multiuser")]
        {
            if let (Some(uid), Some(gid)) = (self.uid, self.gid) {
                let groups = self.groups.clone();
                // Safety: pre_exec runs after fork but before exec in the
                // child process. The calls here are all async-signal-safe.
                unsafe {
                    use std::os::unix::process::CommandExt;
                    cmd.pre_exec(move || {
                        // Set supplementary groups first (requires root).
                        if !groups.is_empty() {
                            let gids: Vec<libc::gid_t> =
                                groups.iter().map(|g| *g as libc::gid_t).collect();
                            if libc::setgroups(gids.len() as libc::c_int, gids.as_ptr()) != 0 {
                                return Err(std::io::Error::last_os_error());
                            }
                        }
                        // Set primary group.
                        if libc::setgid(gid as _) != 0 {
                            return Err(std::io::Error::last_os_error());
                        }
                        // Drop to target user last.
                        if libc::setuid(uid as _) != 0 {
                            return Err(std::io::Error::last_os_error());
                        }
                        Ok(())
                    });
                }
            }
        }

        #[cfg(not(feature = "multiuser"))]
        {
            let _ = cmd;
        }
    }

    /// Release any resources held by this platform data.
    pub fn release(&self) -> anyhow::Result<()> {
        Ok(())
    }
}
