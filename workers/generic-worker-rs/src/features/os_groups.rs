//! OS groups feature - manages OS group membership for the task user.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct OsGroupsFeature;

impl OsGroupsFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for OsGroupsFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_os_groups
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        !task.payload.os_groups.is_empty()
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(OsGroupsTaskFeature {
            groups: task.payload.os_groups.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "OSGroups"
    }
}

struct OsGroupsTaskFeature {
    groups: Vec<String>,
}

impl TaskFeature for OsGroupsTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        self.groups
            .iter()
            .map(|g| vec![format!("generic-worker:os-group:{}", g)])
            .collect()
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        // In insecure mode, validate that the current user is actually a member
        // of all requested groups. If not, report malformed-payload.
        for group in &self.groups {
            if !is_current_user_in_group(group) {
                return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                    "task requires OS group '{}' but the current user is not a member of it",
                    group
                )));
            }
            tracing::info!("Verified current user is in OS group: {}", group);
        }
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // In insecure mode, nothing to clean up since we don't modify group membership.
    }
}

/// Check if the current user is a member of the given OS group.
#[cfg(unix)]
fn is_current_user_in_group(group_name: &str) -> bool {
    use std::ffi::CString;

    let c_group = match CString::new(group_name) {
        Ok(s) => s,
        Err(_) => return false,
    };

    unsafe {
        let grp = libc::getgrnam(c_group.as_ptr());
        if grp.is_null() {
            return false;
        }

        let gid = (*grp).gr_gid;
        let current_gid = libc::getgid();

        // Check if the group is the user's primary group.
        if gid == current_gid {
            return true;
        }

        // Check supplementary groups.
        let ngroups: libc::c_int = 64;
        let mut groups = vec![0 as libc::gid_t; ngroups as usize];
        let ret = libc::getgroups(ngroups, groups.as_mut_ptr());
        if ret < 0 {
            return false;
        }
        groups.truncate(ret as usize);
        groups.contains(&gid)
    }
}

#[cfg(not(unix))]
fn is_current_user_in_group(_group_name: &str) -> bool {
    // On non-Unix platforms, always return false for unknown groups.
    false
}
