//! LoginInfo represents a logged-in user session on Windows.
//!
//! Ported from Go `process/logininfo_multiuser_windows.go`.
//!
//! On Windows (multiuser), LoginInfo manages:
//! - User primary access token (obtained via LogonUser or interactive session)
//! - User profile (registry hive loaded via LoadUserProfile)
//! - Cleanup on release (unload profile, close handle, logout if needed)
//!
//! On non-Windows platforms, this module provides empty stubs.

#[cfg(target_os = "windows")]
mod platform {
    use anyhow::{bail, Result};
    use std::time::Duration;

    use crate::win32;

    /// LoginInfo represents a logged-in user session.
    pub struct LoginInfo {
        /// User primary access token.
        h_user: isize,
        /// User profile handle (registry hive).
        h_profile: isize,
        /// True if a logout should be performed when the LoginInfo is released.
        logout_when_done: bool,
    }

    /// Invalid handle sentinel value matching Windows INVALID_HANDLE_VALUE.
    const INVALID_HANDLE: isize = -1;

    impl LoginInfo {
        /// Get a LoginInfo for the current interactive console user.
        ///
        /// This retrieves the token of the user logged in at the physical
        /// console. The profile is NOT loaded (no registry hive mount).
        /// The caller should NOT call release() to log out the interactive
        /// user session since we did not create it.
        pub fn interactive(timeout: Duration) -> Result<Self> {
            let h_token = interactive_user_token(timeout)?;
            Ok(LoginInfo {
                h_user: h_token,
                h_profile: 0,
                logout_when_done: false,
            })
        }

        /// Create a new LoginInfo by logging in with username and password.
        ///
        /// This calls LogonUser to create a new logon session, then loads
        /// the user's profile (mounts the registry hive). It is the
        /// caller's responsibility to call release() when done.
        pub fn new(username: &str, password: &str) -> Result<Self> {
            let mut info = LoginInfo {
                h_user: 0,
                h_profile: 0,
                logout_when_done: false,
            };
            info.prepare(username, password)?;
            Ok(info)
        }

        /// Return the user's primary access token.
        pub fn access_token(&self) -> isize {
            self.h_user
        }

        /// Return the linked (elevated) token for UAC elevation.
        ///
        /// On systems with UAC enabled, a standard user token may have a
        /// linked elevated token. This retrieves that token via
        /// GetTokenInformation(TokenLinkedToken).
        pub fn elevated_access_token(&self) -> Result<isize> {
            win32::get_linked_token(self.h_user)
        }

        /// Release resources associated with this login.
        ///
        /// If the login was created via LogonUser (not interactive), this
        /// unloads the user profile and closes the token handle.
        pub fn release(&mut self) -> Result<()> {
            if self.logout_when_done {
                self.logout()?;
            }
            Ok(())
        }

        /// Set the active console session ID on the user token.
        ///
        /// This is used to associate the token with the physical console
        /// session, which is required for processes that need to interact
        /// with the desktop (e.g., GUI applications).
        pub fn set_active_console_session_id(&self) -> Result<()> {
            let session_id = wts_get_active_console_session_id()?;
            tracing::info!("Setting active console session ID to {:#x}", session_id);
            win32::set_token_session_id(self.h_user, session_id)
        }

        /// Log user out, unloading profiles if necessary.
        fn logout(&mut self) -> Result<()> {
            if self.h_profile != 0 && self.h_profile != INVALID_HANDLE {
                // Retry unload indefinitely, matching Go behavior.
                loop {
                    match win32::unload_user_profile(self.h_user, self.h_profile) {
                        Ok(()) => break,
                        Err(e) => {
                            tracing::error!("UnloadUserProfile failed (retrying): {}", e);
                        }
                    }
                }
                self.h_profile = INVALID_HANDLE;
            }

            if self.h_user != 0 && self.h_user != INVALID_HANDLE {
                win32::close_handle(self.h_user);
                self.h_user = INVALID_HANDLE;
            }
            Ok(())
        }

        /// Log in and load user profile.
        fn prepare(&mut self, username: &str, password: &str) -> Result<()> {
            self.h_user = win32::logon_user(username, password)?;
            self.logout_when_done = true;

            match win32::load_user_profile(self.h_user, username) {
                Ok(profile) => {
                    self.h_profile = profile;
                    Ok(())
                }
                Err(e) => {
                    // Clean up the token on failure.
                    win32::close_handle(self.h_user);
                    self.h_user = INVALID_HANDLE;
                    Err(e)
                }
            }
        }
    }

    impl Drop for LoginInfo {
        fn drop(&mut self) {
            if let Err(e) = self.release() {
                tracing::error!("LoginInfo::drop failed during release: {}", e);
            }
        }
    }

    /// Get the interactive user's token.
    ///
    /// This enumerates sessions via WTSEnumerateSessions to find the
    /// active console session, then queries the user token for that
    /// session via WTSQueryUserToken.
    fn interactive_user_token(timeout: Duration) -> Result<isize> {
        use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
        use windows_sys::Win32::Foundation::{BOOL, FALSE, HANDLE};

        type WTSEnumerateSessionsFn = unsafe extern "system" fn(
            isize,   // hServer
            u32,     // Reserved
            u32,     // Version
            *mut *mut WtsSessionInfo, // ppSessionInfo
            *mut u32, // pCount
        ) -> BOOL;

        type WTSFreeMemoryFn = unsafe extern "system" fn(*mut std::ffi::c_void);

        type WTSQueryUserTokenFn = unsafe extern "system" fn(
            u32,          // SessionId
            *mut HANDLE,  // phToken
        ) -> BOOL;

        #[repr(C)]
        struct WtsSessionInfo {
            session_id: u32,
            p_win_station_name: *mut u16,
            state: u32, // WTS_CONNECTSTATE_CLASS
        }

        const WTS_ACTIVE: u32 = 0;
        const WTS_CURRENT_SERVER_HANDLE: isize = 0;

        let wtsapi = win32::to_wide("wtsapi32.dll");
        let lib = unsafe { LoadLibraryW(wtsapi.as_ptr()) };
        if lib == 0 {
            bail!("failed to load wtsapi32.dll");
        }

        let enum_fn = unsafe {
            GetProcAddress(lib, b"WTSEnumerateSessionsW\0".as_ptr())
                .map(|f| std::mem::transmute::<_, WTSEnumerateSessionsFn>(f))
        };
        let free_fn = unsafe {
            GetProcAddress(lib, b"WTSFreeMemory\0".as_ptr())
                .map(|f| std::mem::transmute::<_, WTSFreeMemoryFn>(f))
        };
        let query_fn = unsafe {
            GetProcAddress(lib, b"WTSQueryUserToken\0".as_ptr())
                .map(|f| std::mem::transmute::<_, WTSQueryUserTokenFn>(f))
        };

        let (Some(enumerate), Some(free_mem), Some(query_token)) = (enum_fn, free_fn, query_fn) else {
            bail!("failed to locate WTS functions in wtsapi32.dll");
        };

        let deadline = std::time::Instant::now() + timeout;
        let mut delay = Duration::from_millis(100);
        let max_delay = Duration::from_secs(5);

        loop {
            let mut sessions: *mut WtsSessionInfo = std::ptr::null_mut();
            let mut count: u32 = 0;

            let ok = unsafe {
                enumerate(
                    WTS_CURRENT_SERVER_HANDLE,
                    0,
                    1,
                    &mut sessions,
                    &mut count,
                )
            };

            if ok != FALSE && !sessions.is_null() {
                for i in 0..count as usize {
                    let session = unsafe { &*sessions.add(i) };
                    if session.state == WTS_ACTIVE {
                        let mut token: HANDLE = 0;
                        let tok_ok = unsafe { query_token(session.session_id, &mut token) };
                        unsafe { free_mem(sessions as *mut std::ffi::c_void) };
                        if tok_ok != FALSE {
                            return Ok(token);
                        }
                        break;
                    }
                }
                unsafe { free_mem(sessions as *mut std::ffi::c_void) };
            }

            if std::time::Instant::now() > deadline {
                bail!("timed out waiting for interactive user token after {:?}", timeout);
            }

            tracing::info!(
                "No active interactive session found, retrying in {:?}",
                delay,
            );
            std::thread::sleep(delay);
            delay = std::cmp::min(
                Duration::from_secs_f64(delay.as_secs_f64() * 1.5),
                max_delay,
            );
        }
    }

    /// Get the active console session ID via WTSGetActiveConsoleSessionId.
    fn wts_get_active_console_session_id() -> Result<u32> {
        use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

        type WTSGetActiveConsoleSessionIdFn = unsafe extern "system" fn() -> u32;

        let kernel32 = win32::to_wide("kernel32.dll");
        let lib = unsafe { LoadLibraryW(kernel32.as_ptr()) };
        if lib == 0 {
            bail!("failed to load kernel32.dll");
        }

        let get_fn = unsafe {
            GetProcAddress(lib, b"WTSGetActiveConsoleSessionId\0".as_ptr())
                .map(|f| std::mem::transmute::<_, WTSGetActiveConsoleSessionIdFn>(f))
        };

        let Some(get_session_id) = get_fn else {
            bail!("failed to locate WTSGetActiveConsoleSessionId in kernel32.dll");
        };

        let session_id = unsafe { get_session_id() };
        // 0xFFFFFFFF means no active console session.
        if session_id == 0xFFFFFFFF {
            bail!("no active console session (WTSGetActiveConsoleSessionId returned 0xFFFFFFFF)");
        }
        Ok(session_id)
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use anyhow::{bail, Result};
    use std::time::Duration;

    /// LoginInfo stub for non-Windows platforms.
    ///
    /// On non-Windows systems, user session management is handled differently
    /// (e.g., via PAM on Linux, or not at all for insecure mode). These stubs
    /// exist so that code referencing LoginInfo compiles on all platforms.
    pub struct LoginInfo;

    impl LoginInfo {
        /// Stub: not supported on this platform.
        pub fn interactive(_timeout: Duration) -> Result<Self> {
            bail!("LoginInfo::interactive is only supported on Windows")
        }

        /// Stub: not supported on this platform.
        pub fn new(_username: &str, _password: &str) -> Result<Self> {
            bail!("LoginInfo::new is only supported on Windows")
        }

        /// Stub: returns 0 (no token).
        pub fn access_token(&self) -> isize {
            0
        }

        /// Stub: not supported on this platform.
        pub fn elevated_access_token(&self) -> Result<isize> {
            bail!("LoginInfo::elevated_access_token is only supported on Windows")
        }

        /// Stub: no-op.
        pub fn release(&mut self) -> Result<()> {
            Ok(())
        }

        /// Stub: not supported on this platform.
        pub fn set_active_console_session_id(&self) -> Result<()> {
            bail!("LoginInfo::set_active_console_session_id is only supported on Windows")
        }
    }
}

pub use platform::LoginInfo;
