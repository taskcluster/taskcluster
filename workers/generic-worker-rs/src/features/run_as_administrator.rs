//! Run As Administrator feature (Windows only).
//!
//! When enabled, this feature elevates the task process token to an
//! administrator-level token via the UAC linked token mechanism
//! (GetLinkedToken). The task must have the scope
//! `generic-worker:run-as-administrator:{provisionerId}/{workerType}`.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct RunAsAdministratorFeature;

impl RunAsAdministratorFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for RunAsAdministratorFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_run_as_administrator
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.run_as_administrator.unwrap_or(false)
    }

    fn new_task_feature(&self, _task: &TaskRun, config: &Config) -> Box<dyn TaskFeature> {
        Box::new(RunAsAdministratorTaskFeature {
            provisioner_id: config.provisioner_id.clone(),
            worker_type: config.worker_type.clone(),
        })
    }

    fn rejects_when_disabled(&self) -> bool {
        true
    }

    fn name(&self) -> &'static str {
        "RunAsAdministrator"
    }
}

struct RunAsAdministratorTaskFeature {
    provisioner_id: String,
    worker_type: String,
}

impl TaskFeature for RunAsAdministratorTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec![format!(
            "generic-worker:run-as-administrator:{}/{}",
            self.provisioner_id, self.worker_type,
        )]]
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        #[cfg(target_os = "windows")]
        {
            self.start_windows()
        }
        #[cfg(not(target_os = "windows"))]
        {
            Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                "runAsAdministrator is only supported on Windows"
            )))
        }
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {}
}

#[cfg(target_os = "windows")]
impl RunAsAdministratorTaskFeature {
    fn start_windows(&mut self) -> Option<CommandExecutionError> {
        // Check if UAC is enabled by reading the registry.
        if !uac_enabled() {
            return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                "UAC is disabled on this worker type ({}/{}) - runAsAdministrator is not allowed",
                self.provisioner_id,
                self.worker_type,
            )));
        }

        // The actual token elevation is performed by the command executor
        // when it sees that runAsAdministrator is requested. At that point
        // it calls win32::get_linked_token on the command's access token
        // and replaces it with the elevated one.
        //
        // This feature's Start() validates preconditions (UAC enabled,
        // scopes present). The heavy lifting happens in the process layer
        // where the PlatformData.command_access_token is swapped.

        None
    }
}

/// Check whether UAC is enabled on this machine by reading the EnableLUA
/// registry value.
#[cfg(target_os = "windows")]
fn uac_enabled() -> bool {
    use windows_sys::Win32::System::Registry::{
        RegOpenKeyExW, RegQueryValueExW, RegCloseKey, HKEY_LOCAL_MACHINE, KEY_QUERY_VALUE,
        KEY_WOW64_64KEY, REG_DWORD,
    };
    use std::ptr;

    let subkey = crate::win32::to_wide(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System",
    );
    let mut hkey: windows_sys::Win32::System::Registry::HKEY = 0;
    let err = unsafe {
        RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            0,
            KEY_QUERY_VALUE | KEY_WOW64_64KEY,
            &mut hkey,
        )
    };
    if err != 0 {
        return false;
    }

    let value_name = crate::win32::to_wide("EnableLUA");
    let mut value_type: u32 = 0;
    let mut data: u32 = 0;
    let mut data_size: u32 = std::mem::size_of::<u32>() as u32;
    let err = unsafe {
        RegQueryValueExW(
            hkey,
            value_name.as_ptr(),
            ptr::null_mut(),
            &mut value_type,
            &mut data as *mut u32 as *mut u8,
            &mut data_size,
        )
    };
    unsafe { RegCloseKey(hkey) };
    if err != 0 || value_type != REG_DWORD {
        return false;
    }
    data == 1
}
