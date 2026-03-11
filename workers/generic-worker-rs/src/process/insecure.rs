//! Insecure engine: runs tasks as the current user.

use super::PlatformData;
use crate::runtime::OsUser;
use anyhow::Result;

/// Create platform data for insecure mode (no user switching).
pub fn new_platform_data(_headless: bool, _user: Option<&OsUser>) -> Result<PlatformData> {
    Ok(PlatformData::default())
}
