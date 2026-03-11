//! Windows API wrappers using the windows-sys crate.
//!
//! This module provides safe(r) Rust wrappers around Win32 APIs needed for
//! multiuser task execution, profile management, token manipulation, and
//! window station / desktop ACL management.

#![cfg(target_os = "windows")]

use anyhow::{bail, Context, Result};
use std::ffi::OsStr;
use std::mem;
use std::os::windows::ffi::OsStrExt;
use std::ptr;

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, FALSE, HANDLE, INVALID_HANDLE_VALUE, LUID, TRUE,
};
use windows_sys::Win32::Security::Authorization::{
    SetSecurityInfo, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
};
use windows_sys::Win32::Security::{
    AdjustTokenPrivileges, DuplicateTokenEx, GetTokenInformation, LogonUserW,
    LookupPrivilegeValueW, SetTokenInformation, SecurityImpersonation, TokenLinkedToken,
    TokenPrimary, TokenSessionId, LOGON32_LOGON_INTERACTIVE, LOGON32_PROVIDER_DEFAULT,
    LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_ALL_ACCESS,
    TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_LINKED_TOKEN, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE,
    KEY_WOW64_64KEY, KEY_WRITE, REG_DWORD, REG_OPTION_NON_VOLATILE, REG_SZ,
};
use windows_sys::Win32::System::Threading::{
    CREATE_NEW_CONSOLE, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW,
    CREATE_BREAKAWAY_FROM_JOB,
};

// ---- Constants ----

/// Process creation flag: create a new console window.
pub const CREATION_FLAG_NEW_CONSOLE: u32 = CREATE_NEW_CONSOLE;
/// Process creation flag: create a new process group.
pub const CREATION_FLAG_NEW_PROCESS_GROUP: u32 = CREATE_NEW_PROCESS_GROUP;
/// Process creation flag: do not create a window.
pub const CREATION_FLAG_NO_WINDOW: u32 = CREATE_NO_WINDOW;
/// Process creation flag: break away from job object (pre-Windows 8).
pub const CREATION_FLAG_BREAKAWAY_FROM_JOB: u32 = CREATE_BREAKAWAY_FROM_JOB;

/// NSSM service name used for the generic worker.
pub const DEFAULT_SERVICE_NAME: &str = "Generic Worker";

// ---- UTF-16 helpers ----

/// Convert a Rust string to a null-terminated UTF-16 vector.
pub fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Convert a null-terminated UTF-16 slice to a Rust String.
pub fn from_wide(s: &[u16]) -> String {
    let len = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf16_lossy(&s[..len])
}

// ---- Environment block helpers ----

/// Merge a set of environment variable overrides into the environment block
/// obtained for a given user token. If `token` is 0 / null, the current
/// process environment is used as the base.
///
/// Returns a list of "KEY=VALUE" strings suitable for passing to
/// `std::process::Command::envs`.
pub fn create_environment(
    env_overrides: &[(String, String)],
    token: isize,
) -> Result<Vec<(String, String)>> {
    // Build the base environment from the token (or current process).
    let base = if token != 0 {
        get_user_environment_block(token)?
    } else {
        std::env::vars().collect::<Vec<_>>()
    };

    // Index overrides by uppercase key for case-insensitive merge.
    let mut merged: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (k, v) in &base {
        merged.insert(k.to_uppercase(), format!("{}={}", k, v));
    }
    for (k, v) in env_overrides {
        merged.insert(k.to_uppercase(), format!("{}={}", k, v));
    }

    Ok(merged
        .into_values()
        .map(|entry| {
            let mut parts = entry.splitn(2, '=');
            let key = parts.next().unwrap_or("").to_string();
            let value = parts.next().unwrap_or("").to_string();
            (key, value)
        })
        .collect())
}

/// Obtain the default environment block for a user token via
/// CreateEnvironmentBlock / DestroyEnvironmentBlock.
fn get_user_environment_block(token: isize) -> Result<Vec<(String, String)>> {
    // userenv.dll functions are not in windows-sys 0.52, so we load them
    // dynamically.
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type CreateEnvironmentBlockFn =
        unsafe extern "system" fn(*mut *mut u16, isize, BOOL) -> BOOL;
    type DestroyEnvironmentBlockFn = unsafe extern "system" fn(*mut u16) -> BOOL;

    let dll_name = to_wide("userenv.dll");
    let lib = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if lib == 0 {
        bail!("failed to load userenv.dll");
    }

    let create_fn = unsafe {
        GetProcAddress(lib, b"CreateEnvironmentBlock\0".as_ptr())
            .map(|f| mem::transmute::<_, CreateEnvironmentBlockFn>(f))
    };
    let destroy_fn = unsafe {
        GetProcAddress(lib, b"DestroyEnvironmentBlock\0".as_ptr())
            .map(|f| mem::transmute::<_, DestroyEnvironmentBlockFn>(f))
    };

    let (Some(create_env), Some(destroy_env)) = (create_fn, destroy_fn) else {
        bail!("failed to locate CreateEnvironmentBlock/DestroyEnvironmentBlock in userenv.dll");
    };

    let mut env_block: *mut u16 = ptr::null_mut();
    let ok = unsafe { create_env(&mut env_block, token, FALSE) };
    if ok == FALSE || env_block.is_null() {
        bail!(
            "CreateEnvironmentBlock failed (error {})",
            unsafe { GetLastError() }
        );
    }

    // Parse the double-null-terminated UTF-16 block.
    let mut result = Vec::new();
    let mut offset = 0usize;
    loop {
        let c = unsafe { *env_block.add(offset) };
        if c == 0 {
            break; // empty string = end of block
        }
        // Find end of this string.
        let start = offset;
        while unsafe { *env_block.add(offset) } != 0 {
            offset += 1;
        }
        let slice = unsafe { std::slice::from_raw_parts(env_block.add(start), offset - start) };
        let entry = String::from_utf16_lossy(slice);
        if let Some((k, v)) = entry.split_once('=') {
            result.push((k.to_string(), v.to_string()));
        }
        offset += 1; // skip null terminator
    }

    unsafe {
        destroy_env(env_block);
    }

    Ok(result)
}

// ---- Token management ----

/// Log on a user via LogonUserW and return the token handle.
pub fn logon_user(username: &str, password: &str) -> Result<isize> {
    let user = to_wide(username);
    let domain = to_wide(".");
    let pass = to_wide(password);
    let mut token: HANDLE = 0;

    let ok = unsafe {
        LogonUserW(
            user.as_ptr(),
            domain.as_ptr(),
            pass.as_ptr(),
            LOGON32_LOGON_INTERACTIVE,
            LOGON32_PROVIDER_DEFAULT,
            &mut token,
        )
    };
    if ok == FALSE {
        bail!(
            "LogonUserW failed for user '{}' (error {})",
            username,
            unsafe { GetLastError() }
        );
    }
    Ok(token)
}

/// Duplicate a token for use as a primary token (e.g. for CreateProcessAsUser).
pub fn duplicate_token_as_primary(token: isize) -> Result<isize> {
    let mut new_token: HANDLE = 0;
    let ok = unsafe {
        DuplicateTokenEx(
            token,
            TOKEN_ALL_ACCESS,
            ptr::null(),
            SecurityImpersonation,
            TokenPrimary,
            &mut new_token,
        )
    };
    if ok == FALSE {
        bail!(
            "DuplicateTokenEx failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(new_token)
}

/// Retrieve the linked (elevated) token for a user token via
/// GetTokenInformation(TokenLinkedToken). This is the mechanism used to obtain
/// an admin-level token when UAC is enabled.
pub fn get_linked_token(token: isize) -> Result<isize> {
    let mut linked = TOKEN_LINKED_TOKEN { LinkedToken: 0 };
    let mut return_len: u32 = 0;
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenLinkedToken,
            &mut linked as *mut _ as *mut _,
            mem::size_of::<TOKEN_LINKED_TOKEN>() as u32,
            &mut return_len,
        )
    };
    if ok == FALSE {
        bail!(
            "GetTokenInformation(TokenLinkedToken) failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(linked.LinkedToken)
}

/// Get the session ID associated with a token.
pub fn get_token_session_id(token: isize) -> Result<u32> {
    let mut session_id: u32 = 0;
    let mut return_len: u32 = 0;
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenSessionId,
            &mut session_id as *mut _ as *mut _,
            mem::size_of::<u32>() as u32,
            &mut return_len,
        )
    };
    if ok == FALSE {
        bail!(
            "GetTokenInformation(TokenSessionId) failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(session_id)
}

/// Set the session ID on a token (requires SeTcbPrivilege).
pub fn set_token_session_id(token: isize, session_id: u32) -> Result<()> {
    let mut sid = session_id;
    let ok = unsafe {
        SetTokenInformation(
            token,
            TokenSessionId,
            &mut sid as *mut _ as *mut _,
            mem::size_of::<u32>() as u32,
        )
    };
    if ok == FALSE {
        bail!(
            "SetTokenInformation(TokenSessionId) failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(())
}

/// Close a Win32 handle.
pub fn close_handle(handle: isize) {
    if handle != 0 && handle != INVALID_HANDLE_VALUE {
        unsafe {
            CloseHandle(handle);
        }
    }
}

// ---- Profile management ----

/// Create a user profile via the CreateProfile API in userenv.dll.
/// This should be called before LoadUserProfile to prevent Windows from
/// creating a temporary profile.
pub fn create_profile(sid: &str, username: &str) -> Result<String> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type CreateProfileFn =
        unsafe extern "system" fn(*const u16, *const u16, *mut u16, u32) -> i32;

    let dll_name = to_wide("userenv.dll");
    let lib = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if lib == 0 {
        bail!("failed to load userenv.dll");
    }

    let create_fn = unsafe {
        GetProcAddress(lib, b"CreateProfile\0".as_ptr())
            .map(|f| mem::transmute::<_, CreateProfileFn>(f))
    };
    let Some(create_profile_fn) = create_fn else {
        bail!("failed to locate CreateProfile in userenv.dll");
    };

    let sid_wide = to_wide(sid);
    let name_wide = to_wide(username);
    let mut path_buf = vec![0u16; 260]; // MAX_PATH

    let hr = unsafe {
        create_profile_fn(
            sid_wide.as_ptr(),
            name_wide.as_ptr(),
            path_buf.as_mut_ptr(),
            path_buf.len() as u32,
        )
    };

    // S_OK = 0, HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS) = 0x800700B7
    if hr < 0 && hr as u32 != 0x800700B7 {
        bail!("CreateProfile failed for user '{}' (HRESULT 0x{:08X})", username, hr as u32);
    }

    Ok(from_wide(&path_buf))
}

/// Delete a user profile by SID string.
pub fn delete_profile(sid: &str) -> Result<()> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type DeleteProfileFn =
        unsafe extern "system" fn(*const u16, *const u16, *const u16) -> BOOL;

    let dll_name = to_wide("userenv.dll");
    let lib = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if lib == 0 {
        bail!("failed to load userenv.dll");
    }

    let delete_fn = unsafe {
        GetProcAddress(lib, b"DeleteProfileW\0".as_ptr())
            .map(|f| mem::transmute::<_, DeleteProfileFn>(f))
    };
    let Some(delete_profile_fn) = delete_fn else {
        bail!("failed to locate DeleteProfileW in userenv.dll");
    };

    let sid_wide = to_wide(sid);
    let ok = unsafe { delete_profile_fn(sid_wide.as_ptr(), ptr::null(), ptr::null()) };
    if ok == FALSE {
        bail!(
            "DeleteProfileW failed for SID '{}' (error {})",
            sid,
            unsafe { GetLastError() }
        );
    }
    Ok(())
}

/// Load a user profile (mount the registry hive) and return the profile handle.
pub fn load_user_profile(token: isize, username: &str) -> Result<isize> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    /// PROFILEINFOW structure for LoadUserProfileW.
    #[repr(C)]
    struct ProfileInfoW {
        size: u32,
        flags: u32,
        user_name: *mut u16,
        profile_path: *mut u16,
        default_path: *mut u16,
        server_name: *mut u16,
        policy_path: *mut u16,
        profile: HANDLE,
    }

    type LoadUserProfileFn = unsafe extern "system" fn(HANDLE, *mut ProfileInfoW) -> BOOL;

    const PI_NOUI: u32 = 1;

    let dll_name = to_wide("userenv.dll");
    let lib = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if lib == 0 {
        bail!("failed to load userenv.dll");
    }
    let load_fn = unsafe {
        GetProcAddress(lib, b"LoadUserProfileW\0".as_ptr())
            .map(|f| mem::transmute::<_, LoadUserProfileFn>(f))
    };
    let Some(load_profile_fn) = load_fn else {
        bail!("failed to locate LoadUserProfileW in userenv.dll");
    };

    let mut name_wide = to_wide(username);
    let mut info = ProfileInfoW {
        size: mem::size_of::<ProfileInfoW>() as u32,
        flags: PI_NOUI,
        user_name: name_wide.as_mut_ptr(),
        profile_path: ptr::null_mut(),
        default_path: ptr::null_mut(),
        server_name: ptr::null_mut(),
        policy_path: ptr::null_mut(),
        profile: 0,
    };

    // Retry with back-off for ERROR_NOT_READY (21).
    let max_retries = 25;
    let mut delay = std::time::Duration::from_millis(50);
    let max_delay = std::time::Duration::from_secs(5);

    for attempt in 0..max_retries {
        let ok = unsafe { load_profile_fn(token, &mut info) };
        if ok != FALSE {
            return Ok(info.profile);
        }
        let err = unsafe { GetLastError() };
        if err == 21 && attempt < max_retries - 1 {
            // ERROR_NOT_READY
            tracing::warn!(
                "LoadUserProfile failed with ERROR_NOT_READY (attempt {}/{}), retrying in {:?}",
                attempt + 1,
                max_retries,
                delay,
            );
            std::thread::sleep(delay);
            delay = std::cmp::min(
                std::time::Duration::from_secs_f64(delay.as_secs_f64() * 1.5),
                max_delay,
            );
        } else {
            bail!(
                "LoadUserProfileW failed for user '{}' (error {})",
                username,
                err,
            );
        }
    }
    bail!("LoadUserProfileW failed after {} retries", max_retries)
}

/// Unload a previously loaded user profile.
pub fn unload_user_profile(token: isize, profile: isize) -> Result<()> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type UnloadUserProfileFn = unsafe extern "system" fn(HANDLE, HANDLE) -> BOOL;

    let dll_name = to_wide("userenv.dll");
    let lib = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if lib == 0 {
        bail!("failed to load userenv.dll");
    }
    let unload_fn = unsafe {
        GetProcAddress(lib, b"UnloadUserProfile\0".as_ptr())
            .map(|f| mem::transmute::<_, UnloadUserProfileFn>(f))
    };
    let Some(unload_profile_fn) = unload_fn else {
        bail!("failed to locate UnloadUserProfile in userenv.dll");
    };

    let ok = unsafe { unload_profile_fn(token, profile) };
    if ok == FALSE {
        bail!(
            "UnloadUserProfile failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(())
}

// ---- Window station and desktop ACL management ----

/// Grant a SID full access to the current process's window station.
pub fn add_ace_to_window_station(sid_string: &str) -> Result<()> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    // We need user32 for GetProcessWindowStation and GetThreadDesktop,
    // and advapi32 for ACL manipulation. Use windows-sys where available.
    type GetProcessWindowStationFn = unsafe extern "system" fn() -> HANDLE;
    type SetUserObjectSecurityFn =
        unsafe extern "system" fn(HANDLE, *const u32, *const u8) -> BOOL;

    // Convert SID string to binary SID via ConvertStringSidToSidW.
    let sid_handle = string_to_sid(sid_string)?;

    let user32 = to_wide("user32.dll");
    let lib = unsafe { LoadLibraryW(user32.as_ptr()) };
    if lib == 0 {
        bail!("failed to load user32.dll");
    }

    let get_ws_fn = unsafe {
        GetProcAddress(lib, b"GetProcessWindowStation\0".as_ptr())
            .map(|f| mem::transmute::<_, GetProcessWindowStationFn>(f))
    };
    let Some(get_winsta) = get_ws_fn else {
        bail!("failed to locate GetProcessWindowStation");
    };

    let winsta = unsafe { get_winsta() };
    if winsta == 0 {
        bail!(
            "GetProcessWindowStation failed (error {})",
            unsafe { GetLastError() }
        );
    }

    // Build a security descriptor with a DACL granting WINSTA_ALL_ACCESS.
    set_object_dacl_for_sid(winsta, sid_handle, 0x37F | 0x00020000)?; // WINSTA_ALL | READ_CONTROL

    Ok(())
}

/// Grant a SID full access to the current thread's desktop.
pub fn add_ace_to_desktop(sid_string: &str) -> Result<()> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type GetCurrentThreadIdFn = unsafe extern "system" fn() -> u32;
    type GetThreadDesktopFn = unsafe extern "system" fn(u32) -> HANDLE;

    let sid_handle = string_to_sid(sid_string)?;

    let user32 = to_wide("user32.dll");
    let lib = unsafe { LoadLibraryW(user32.as_ptr()) };
    if lib == 0 {
        bail!("failed to load user32.dll");
    }

    let get_tid_fn = unsafe {
        GetProcAddress(
            unsafe { LoadLibraryW(to_wide("kernel32.dll").as_ptr()) },
            b"GetCurrentThreadId\0".as_ptr(),
        )
        .map(|f| mem::transmute::<_, GetCurrentThreadIdFn>(f))
    };
    let get_desk_fn = unsafe {
        GetProcAddress(lib, b"GetThreadDesktop\0".as_ptr())
            .map(|f| mem::transmute::<_, GetThreadDesktopFn>(f))
    };

    let (Some(get_tid), Some(get_desktop)) = (get_tid_fn, get_desk_fn) else {
        bail!("failed to locate GetCurrentThreadId/GetThreadDesktop");
    };

    let tid = unsafe { get_tid() };
    let desktop = unsafe { get_desktop(tid) };
    if desktop == 0 {
        bail!(
            "GetThreadDesktop failed (error {})",
            unsafe { GetLastError() }
        );
    }

    // DESKTOP_ALL access mask
    let desktop_all: u32 = 0x4 | 0x2 | 0x40 | 0x8 | 0x20 | 0x10 | 0x1 | 0x100 | 0x80 | 0x00020000;
    set_object_dacl_for_sid(desktop, sid_handle, desktop_all)?;

    Ok(())
}

/// Convert a SID string (e.g. "S-1-1-0") to a binary SID allocation.
/// Returns a pointer that must be freed with LocalFree.
fn string_to_sid(sid_string: &str) -> Result<*mut u8> {
    use windows_sys::Win32::Security::Authorization::ConvertStringSidToSidW;
    use windows_sys::Win32::System::Memory::LocalFree;

    let sid_wide = to_wide(sid_string);
    let mut sid_ptr: *mut std::ffi::c_void = ptr::null_mut();
    let ok = unsafe { ConvertStringSidToSidW(sid_wide.as_ptr(), &mut sid_ptr) };
    if ok == FALSE {
        bail!(
            "ConvertStringSidToSidW failed for '{}' (error {})",
            sid_string,
            unsafe { GetLastError() }
        );
    }
    Ok(sid_ptr as *mut u8)
}

/// Set a DACL on a user object granting the given SID the specified access mask.
/// This is a simplified version that creates a new DACL with a single ACE.
fn set_object_dacl_for_sid(handle: HANDLE, sid: *mut u8, access_mask: u32) -> Result<()> {
    use windows_sys::Win32::Security::Authorization::{
        SetEntriesInAclW, EXPLICIT_ACCESS_W, SET_ACCESS, TRUSTEE_IS_SID, TRUSTEE_W,
        NO_INHERITANCE, SUB_CONTAINERS_AND_OBJECTS_INHERIT, TRUSTEE_IS_USER,
    };
    use windows_sys::Win32::Security::ACL as WIN_ACL;

    let mut ea = EXPLICIT_ACCESS_W {
        grfAccessPermissions: access_mask,
        grfAccessMode: SET_ACCESS,
        grfInheritance: NO_INHERITANCE,
        Trustee: unsafe { mem::zeroed::<TRUSTEE_W>() },
    };
    ea.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    ea.Trustee.TrusteeType = TRUSTEE_IS_USER;
    ea.Trustee.ptstrName = sid as *mut u16;

    let mut new_dacl: *mut WIN_ACL = ptr::null_mut();
    let err = unsafe { SetEntriesInAclW(1, &ea, ptr::null_mut(), &mut new_dacl) };
    if err != 0 {
        bail!("SetEntriesInAclW failed (error {})", err);
    }

    // Apply via SetUserObjectSecurity-equivalent through advapi32.
    // We use SetSecurityInfo for kernel objects.
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    type SetUserObjectSecurityFn =
        unsafe extern "system" fn(HANDLE, *const u32, *const u8) -> BOOL;

    let user32 = to_wide("user32.dll");
    let lib = unsafe { LoadLibraryW(user32.as_ptr()) };
    if lib == 0 {
        bail!("failed to load user32.dll");
    }

    let set_fn = unsafe {
        GetProcAddress(lib, b"SetUserObjectSecurity\0".as_ptr())
            .map(|f| mem::transmute::<_, SetUserObjectSecurityFn>(f))
    };

    if let Some(set_user_obj_sec) = set_fn {
        // Build a security descriptor with the new DACL.
        let sd = build_security_descriptor_with_dacl(new_dacl as *const u8)?;
        let si: u32 = 0x00000004; // DACL_SECURITY_INFORMATION
        let ok = unsafe { set_user_obj_sec(handle, &si, sd.as_ptr()) };
        if ok == FALSE {
            bail!(
                "SetUserObjectSecurity failed (error {})",
                unsafe { GetLastError() }
            );
        }
    } else {
        bail!("SetUserObjectSecurity not found in user32.dll");
    }

    Ok(())
}

/// Build a SECURITY_DESCRIPTOR byte buffer with the given DACL set.
fn build_security_descriptor_with_dacl(dacl: *const u8) -> Result<Vec<u8>> {
    use windows_sys::Win32::Security::{
        InitializeSecurityDescriptor, SetSecurityDescriptorDacl, SECURITY_DESCRIPTOR,
        SECURITY_DESCRIPTOR_REVISION,
    };

    let mut sd = vec![0u8; mem::size_of::<SECURITY_DESCRIPTOR>() + 256];
    let ok = unsafe {
        InitializeSecurityDescriptor(sd.as_mut_ptr() as *mut _, SECURITY_DESCRIPTOR_REVISION)
    };
    if ok == FALSE {
        bail!(
            "InitializeSecurityDescriptor failed (error {})",
            unsafe { GetLastError() }
        );
    }
    let ok = unsafe {
        SetSecurityDescriptorDacl(sd.as_mut_ptr() as *mut _, TRUE, dacl as *const _, FALSE)
    };
    if ok == FALSE {
        bail!(
            "SetSecurityDescriptorDacl failed (error {})",
            unsafe { GetLastError() }
        );
    }
    Ok(sd)
}

// ---- Service management helpers ----

/// Install the generic worker as a Windows service using NSSM.
/// This mirrors the Go implementation's `deployService` function.
pub fn install_nssm_service(
    config_path: &str,
    nssm_path: &str,
    service_name: &str,
) -> Result<()> {
    let exe = std::env::current_exe()?;
    let exe_str = exe.display().to_string();
    let dir = exe
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| ".".to_string());

    // Create the run-generic-worker.bat script
    let bat_path = exe
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("run-generic-worker.bat");
    let bat_contents = format!(
        ":: Run generic-worker\r\n\
         \r\n\
         :: step inside folder containing this script\r\n\
         pushd %~dp0\r\n\
         \r\n\
         .\\generic-worker.exe run --config {} > .\\generic-worker.log 2>&1\r\n",
        config_path,
    );
    std::fs::write(&bat_path, bat_contents)?;
    let bat_str = bat_path.display().to_string();

    // Install and configure via NSSM
    let nssm_commands: Vec<Vec<&str>> = vec![
        vec![nssm_path, "install", service_name, &bat_str],
        vec![nssm_path, "set", service_name, "AppDirectory", &dir],
        vec![nssm_path, "set", service_name, "DisplayName", service_name],
        vec![
            nssm_path,
            "set",
            service_name,
            "Description",
            "A taskcluster worker that runs on all mainstream platforms",
        ],
        vec![nssm_path, "set", service_name, "Start", "SERVICE_AUTO_START"],
        vec![
            nssm_path,
            "set",
            service_name,
            "Type",
            "SERVICE_WIN32_OWN_PROCESS",
        ],
        vec![
            nssm_path,
            "set",
            service_name,
            "AppPriority",
            "NORMAL_PRIORITY_CLASS",
        ],
        vec![nssm_path, "set", service_name, "AppNoConsole", "1"],
        vec![nssm_path, "set", service_name, "AppAffinity", "All"],
        vec![nssm_path, "set", service_name, "AppStopMethodSkip", "0"],
        vec![
            nssm_path,
            "set",
            service_name,
            "AppStopMethodConsole",
            "1500",
        ],
        vec![
            nssm_path,
            "set",
            service_name,
            "AppStopMethodWindow",
            "1500",
        ],
        vec![
            nssm_path,
            "set",
            service_name,
            "AppStopMethodThreads",
            "1500",
        ],
        vec![nssm_path, "set", service_name, "AppThrottle", "1500"],
        vec![
            nssm_path,
            "set",
            service_name,
            "AppExit",
            "Default",
            "Exit",
        ],
        vec![nssm_path, "set", service_name, "AppRestartDelay", "0"],
        vec![nssm_path, "set", service_name, "AppRotateFiles", "1"],
        vec![nssm_path, "set", service_name, "AppRotateOnline", "1"],
        vec![nssm_path, "set", service_name, "AppRotateSeconds", "3600"],
        vec![nssm_path, "set", service_name, "AppRotateBytes", "0"],
    ];

    for cmd in &nssm_commands {
        crate::host::run(cmd[0], &cmd[1..])?;
    }

    Ok(())
}

// ---- Registry helpers for auto-login ----

/// Configure Windows auto-login for the given user by setting the
/// Winlogon registry keys.
pub fn set_auto_login(username: &str, password: &str) -> Result<()> {
    let subkey = to_wide(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon");
    let mut hkey: HKEY = 0;
    let mut disposition: u32 = 0;
    let err = unsafe {
        RegCreateKeyExW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            0,
            ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE | KEY_WOW64_64KEY,
            ptr::null(),
            &mut hkey,
            &mut disposition,
        )
    };
    if err != 0 {
        bail!("RegCreateKeyExW failed for Winlogon key (error {})", err);
    }

    // Helper to set a string value.
    let set_string = |name: &str, value: &str| -> Result<()> {
        let name_wide = to_wide(name);
        let value_wide = to_wide(value);
        let byte_len = (value_wide.len() * 2) as u32;
        let err = unsafe {
            RegSetValueExW(
                hkey,
                name_wide.as_ptr(),
                0,
                REG_SZ,
                value_wide.as_ptr() as *const u8,
                byte_len,
            )
        };
        if err != 0 {
            bail!("RegSetValueExW failed for '{}' (error {})", name, err);
        }
        Ok(())
    };

    // Helper to set a DWORD value.
    let set_dword = |name: &str, value: u32| -> Result<()> {
        let name_wide = to_wide(name);
        let err = unsafe {
            RegSetValueExW(
                hkey,
                name_wide.as_ptr(),
                0,
                REG_DWORD,
                &value as *const u32 as *const u8,
                4,
            )
        };
        if err != 0 {
            bail!("RegSetValueExW failed for '{}' (error {})", name, err);
        }
        Ok(())
    };

    set_dword("AutoAdminLogon", 1)?;
    set_string("DefaultUserName", username)?;
    set_string("DefaultPassword", password)?;

    unsafe {
        RegCloseKey(hkey);
    }

    Ok(())
}

/// Wait for the Windows User Profile Service (ProfSvc) to reach the
/// "running" state. On first boot after sysprep the service may not yet
/// be fully initialized when the worker starts.
pub fn wait_for_profile_service(timeout: std::time::Duration) -> Result<()> {
    use windows_sys::Win32::System::Services::{
        OpenSCManagerW, OpenServiceW, QueryServiceStatus, CloseServiceHandle,
        SC_MANAGER_CONNECT, SERVICE_QUERY_STATUS, SERVICE_STATUS, SERVICE_RUNNING,
    };

    let sc_manager = unsafe {
        OpenSCManagerW(ptr::null(), ptr::null(), SC_MANAGER_CONNECT)
    };
    if sc_manager == 0 {
        bail!(
            "OpenSCManagerW failed (error {})",
            unsafe { GetLastError() }
        );
    }

    let svc_name = to_wide("ProfSvc");
    let service = unsafe { OpenServiceW(sc_manager, svc_name.as_ptr(), SERVICE_QUERY_STATUS) };
    if service == 0 {
        unsafe { CloseServiceHandle(sc_manager) };
        bail!(
            "OpenServiceW(ProfSvc) failed (error {})",
            unsafe { GetLastError() }
        );
    }

    let deadline = std::time::Instant::now() + timeout;
    let mut delay = std::time::Duration::from_millis(100);

    loop {
        let mut status: SERVICE_STATUS = unsafe { mem::zeroed() };
        let ok = unsafe { QueryServiceStatus(service, &mut status) };
        if ok == FALSE {
            unsafe {
                CloseServiceHandle(service);
                CloseServiceHandle(sc_manager);
            }
            bail!(
                "QueryServiceStatus(ProfSvc) failed (error {})",
                unsafe { GetLastError() }
            );
        }
        if status.dwCurrentState == SERVICE_RUNNING {
            tracing::info!("User Profile Service (ProfSvc) is running");
            unsafe {
                CloseServiceHandle(service);
                CloseServiceHandle(sc_manager);
            }
            return Ok(());
        }
        if std::time::Instant::now() > deadline {
            unsafe {
                CloseServiceHandle(service);
                CloseServiceHandle(sc_manager);
            }
            bail!(
                "User Profile Service (ProfSvc) not running after {:?} (state: {})",
                timeout,
                status.dwCurrentState,
            );
        }
        tracing::info!(
            "Waiting for ProfSvc to start (state: {}), retrying in {:?}",
            status.dwCurrentState,
            delay,
        );
        std::thread::sleep(delay);
        delay = std::cmp::min(delay * 2, std::time::Duration::from_secs(2));
    }
}
