//! Garbage collection for disk space management.
//!
//! Evicts cached resources (sorted by rating, lowest first) until enough
//! free disk space is available. Optionally runs Docker cleanup when D2G
//! is enabled.

use anyhow::{Context, Result};
use std::path::Path;

use crate::config::Config;
use crate::host;

/// A resource is something that can be evicted to free disk space.
/// Rating provides an indication of how "valuable" a resource is.
/// A higher rating means the resource should be preserved in favour
/// of a resource with a lower rating.
pub trait Resource: Send {
    /// The value of this resource - higher means more valuable and
    /// should be evicted later.
    fn rating(&self) -> f64;

    /// Evict (delete) this resource to free disk space.
    fn evict(&self) -> Result<()>;
}

/// A sorted collection of evictable resources.
pub struct Resources {
    items: Vec<Box<dyn Resource>>,
}

impl Resources {
    /// Create a new Resources collection and sort items by rating (lowest first).
    pub fn new(mut items: Vec<Box<dyn Resource>>) -> Self {
        items.sort_by(|a, b| {
            a.rating()
                .partial_cmp(&b.rating())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Self { items }
    }

    /// Whether there are no remaining resources to evict.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Evict the lowest-rated resource, removing it from the collection.
    pub fn evict_next(&mut self) -> Result<()> {
        if self.items.is_empty() {
            anyhow::bail!("no resources left to evict");
        }
        let resource = self.items.remove(0);
        resource.evict()
    }
}

/// Run garbage collection, evicting resources until the required disk space
/// is free. If D2G is enabled and space is still insufficient, Docker
/// cleanup commands are run first.
pub fn run_garbage_collection(
    mut resources: Resources,
    task_dir: &Path,
    config: &Config,
) -> Result<()> {
    let required_free_space = required_space_bytes(config);

    let mut current_free_space = free_disk_space_bytes(task_dir)
        .with_context(|| format!("could not calculate free disk space in {}", task_dir.display()))?;

    // If D2G is enabled, try Docker volume prune first
    if current_free_space < required_free_space && config.d2g_enabled() {
        if let Err(e) = host::run("docker", &["volume", "prune", "--all", "--force"]) {
            tracing::warn!("docker volume prune failed: {}", e);
        }

        current_free_space = free_disk_space_bytes(task_dir)
            .with_context(|| format!("could not calculate free disk space in {}", task_dir.display()))?;
    }

    // If still not enough, try Docker system prune
    if current_free_space < required_free_space && config.d2g_enabled() {
        if let Err(e) = host::run("docker", &["system", "prune", "--all", "--force"]) {
            tracing::warn!("docker system prune failed: {}", e);
        }

        // Also remove the d2g image cache file
        let _ = std::fs::remove_file("d2g-image-cache.json");

        current_free_space = free_disk_space_bytes(task_dir)
            .with_context(|| format!("could not calculate free disk space in {}", task_dir.display()))?;
    }

    // Evict resources one at a time until we have enough space
    while current_free_space < required_free_space {
        if resources.is_empty() {
            break;
        }

        resources.evict_next()?;

        current_free_space = free_disk_space_bytes(task_dir)
            .with_context(|| format!("could not calculate free disk space in {}", task_dir.display()))?;
    }

    if current_free_space < required_free_space {
        anyhow::bail!(
            "not able to free up enough disk space - require {} bytes, but only have {} bytes - and nothing left to delete",
            required_free_space,
            current_free_space
        );
    }

    Ok(())
}

/// Calculate the required free space in bytes from the config value in megabytes.
fn required_space_bytes(config: &Config) -> u64 {
    config.required_disk_space_megabytes * 1024 * 1024
}

/// Get the free disk space in bytes for the filesystem containing the given path.
#[cfg(unix)]
fn free_disk_space_bytes(path: &Path) -> Result<u64> {
    use std::ffi::CString;
    use std::mem::MaybeUninit;

    let path_str = path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("path is not valid UTF-8"))?;
    let c_path = CString::new(path_str)?;

    let mut stat = MaybeUninit::<libc::statvfs>::uninit();

    // SAFETY: statvfs is a standard POSIX call; c_path is a valid
    // null-terminated string and stat is properly aligned.
    let ret = unsafe { libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) };

    if ret != 0 {
        anyhow::bail!(
            "statvfs failed for {}: {}",
            path.display(),
            std::io::Error::last_os_error()
        );
    }

    // SAFETY: statvfs succeeded, so stat is now initialized.
    let stat = unsafe { stat.assume_init() };

    // Available blocks * fragment size = available space in bytes
    let available = stat.f_bavail as u64 * stat.f_frsize as u64;
    tracing::info!("Disk available: {} bytes", available);
    Ok(available)
}

/// Get the free disk space in bytes (Windows implementation).
///
/// Uses GetDiskFreeSpaceExW via raw FFI to avoid requiring additional
/// windows-sys Cargo features.
#[cfg(windows)]
fn free_disk_space_bytes(path: &Path) -> Result<u64> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    let path_str = path.as_os_str();
    let wide: Vec<u16> = path_str.encode_wide().chain(std::iter::once(0)).collect();

    let mut free_bytes_available: u64 = 0;

    // SAFETY: GetDiskFreeSpaceExW is a standard Windows API call.
    // wide is a valid null-terminated wide string, and free_bytes_available
    // is a properly aligned u64.
    let ret = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_bytes_available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };

    if ret == 0 {
        anyhow::bail!(
            "GetDiskFreeSpaceExW failed for {}: {}",
            path.display(),
            std::io::Error::last_os_error()
        );
    }

    tracing::info!("Disk available: {} bytes", free_bytes_available);
    Ok(free_bytes_available)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TestResource {
        rating: f64,
        evicted: std::sync::Arc<std::sync::atomic::AtomicBool>,
    }

    impl Resource for TestResource {
        fn rating(&self) -> f64 {
            self.rating
        }

        fn evict(&self) -> Result<()> {
            self.evicted
                .store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }
    }

    #[test]
    fn test_resources_sorted_by_rating() {
        let evicted_a = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let evicted_b = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

        let items: Vec<Box<dyn Resource>> = vec![
            Box::new(TestResource {
                rating: 10.0,
                evicted: evicted_b.clone(),
            }),
            Box::new(TestResource {
                rating: 1.0,
                evicted: evicted_a.clone(),
            }),
        ];

        let mut resources = Resources::new(items);
        assert!(!resources.is_empty());

        // Evicting next should evict the lowest-rated (1.0) first
        resources.evict_next().unwrap();
        assert!(evicted_a.load(std::sync::atomic::Ordering::SeqCst));
        assert!(!evicted_b.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn test_free_disk_space() {
        // Just verify it returns a non-zero value for the current directory
        let path = PathBuf::from(".");
        let space = free_disk_space_bytes(&path).unwrap();
        assert!(space > 0, "free disk space should be > 0");
    }
}
