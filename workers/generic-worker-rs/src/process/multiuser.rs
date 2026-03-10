//! Multiuser engine: runs tasks as dedicated OS users.

use super::PlatformData;
use crate::runtime::OsUser;
use anyhow::Result;

/// Create platform data for multiuser mode (user switching).
pub fn new_platform_data(_headless: bool, user: Option<&OsUser>) -> Result<PlatformData> {
    #[cfg(unix)]
    {
        let Some(user) = user else {
            anyhow::bail!("multiuser mode requires an OS user");
        };

        // Look up the user via nix to get uid and primary gid.
        let nix_user = nix::unistd::User::from_name(&user.name)?
            .ok_or_else(|| anyhow::anyhow!("user '{}' not found", user.name))?;

        let uid = nix_user.uid.as_raw();
        let gid = nix_user.gid.as_raw();

        // Look up all supplementary groups for this user via libc::getgrouplist.
        let groups = lookup_supplementary_groups(&user.name, gid)?;

        Ok(PlatformData {
            uid: Some(uid),
            gid: Some(gid),
            groups,
        })
    }

    #[cfg(windows)]
    {
        let Some(user) = user else {
            anyhow::bail!("multiuser mode requires an OS user");
        };

        // Log on the user and get an access token.
        let token = crate::win32::logon_user(&user.name, &user.password)?;

        Ok(PlatformData {
            command_access_token: token,
            hide_cmd_window: _headless,
        })
    }
}

/// Look up all supplementary groups for the given username and primary gid.
#[cfg(unix)]
fn lookup_supplementary_groups(username: &str, primary_gid: u32) -> Result<Vec<u32>> {
    let c_name = std::ffi::CString::new(username)?;
    let mut ngroups: libc::c_int = 64;
    let mut groups: Vec<libc::gid_t> = vec![0; ngroups as usize];

    // getgrouplist may require a larger buffer. Call once to get count, then
    // resize if needed.
    let ret = unsafe {
        libc::getgrouplist(
            c_name.as_ptr(),
            primary_gid as _,
            groups.as_mut_ptr() as *mut _,
            &mut ngroups,
        )
    };

    if ret == -1 {
        // ngroups now contains the required size.
        groups.resize(ngroups.max(0) as usize, 0);
        unsafe {
            libc::getgrouplist(
                c_name.as_ptr(),
                primary_gid as _,
                groups.as_mut_ptr() as *mut _,
                &mut ngroups,
            );
        }
    }

    groups.truncate(ngroups.max(0) as usize);
    Ok(groups.iter().map(|g| *g as u32).collect())
}
