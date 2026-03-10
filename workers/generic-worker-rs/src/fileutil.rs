//! File utility functions.

use anyhow::{Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::Path;

/// Write a value as JSON to a file.
pub fn write_to_file_as_json<T: Serialize>(value: &T, path: &str) -> Result<()> {
    let json = serde_json::to_string_pretty(value)?;
    fs::write(path, json)?;
    Ok(())
}

/// Set restrictive file permissions (Unix only).
pub fn secure_files(paths: &[&str]) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for path in paths {
            if Path::new(path).exists() {
                let perms = fs::Permissions::from_mode(0o600);
                fs::set_permissions(path, perms)?;
            }
        }
    }
    Ok(())
}

/// Ensure a directory exists, creating it if necessary.
pub fn ensure_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

/// Remove a directory and all its contents.
pub fn remove_dir_all_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

/// Calculate the SHA256 hash of a file, returning it as a lowercase hex string.
pub fn calculate_sha256(path: &Path) -> Result<String> {
    let mut file =
        fs::File::open(path).with_context(|| format!("cannot open file {}", path.display()))?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher)
        .with_context(|| format!("cannot read file {} for hashing", path.display()))?;
    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

/// Copy a file from `src` to `dst`, returning the number of bytes copied.
pub fn copy_file(src: &Path, dst: &Path) -> Result<u64> {
    let metadata = fs::metadata(src)
        .with_context(|| format!("cannot stat source file {}", src.display()))?;
    if !metadata.is_file() {
        anyhow::bail!(
            "cannot copy {} to {}: source is not a regular file",
            src.display(),
            dst.display()
        );
    }
    let bytes = fs::copy(src, dst).with_context(|| {
        format!(
            "cannot copy {} to {}",
            src.display(),
            dst.display()
        )
    })?;
    Ok(bytes)
}

/// Supported archive formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    TarGz,
    TarBz2,
    TarXz,
    TarZst,
    TarLz4,
    Zip,
}

impl ArchiveFormat {
    /// Parse a format string into an ArchiveFormat.
    pub fn from_str(s: &str) -> Result<Self> {
        match s {
            "tar.gz" => Ok(Self::TarGz),
            "tar.bz2" => Ok(Self::TarBz2),
            "tar.xz" => Ok(Self::TarXz),
            "tar.zst" => Ok(Self::TarZst),
            "tar.lz4" => Ok(Self::TarLz4),
            "zip" => Ok(Self::Zip),
            other => anyhow::bail!("unsupported archive format: {}", other),
        }
    }
}

/// Supported single-file decompression formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecompressFormat {
    Gz,
    Bz2,
    Xz,
    Zst,
    Lz4,
}

impl DecompressFormat {
    /// Parse a format string into a DecompressFormat.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "gz" => Some(Self::Gz),
            "bz2" => Some(Self::Bz2),
            "xz" => Some(Self::Xz),
            "zst" => Some(Self::Zst),
            "lz4" => Some(Self::Lz4),
            _ => None,
        }
    }
}

/// Extract an archive file into a destination directory.
///
/// Supports tar.gz, tar.bz2, tar.xz, tar.zst, tar.lz4, and zip formats.
pub fn unarchive(source: &Path, destination: &Path, format: ArchiveFormat) -> Result<()> {
    match format {
        ArchiveFormat::TarGz => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let gz = flate2::read::GzDecoder::new(file);
            let mut archive = tar::Archive::new(gz);
            archive
                .unpack(destination)
                .with_context(|| format!("cannot extract tar.gz archive {}", source.display()))?;
        }
        ArchiveFormat::TarBz2 => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let bz = bzip2::read::BzDecoder::new(file);
            let mut archive = tar::Archive::new(bz);
            archive
                .unpack(destination)
                .with_context(|| format!("cannot extract tar.bz2 archive {}", source.display()))?;
        }
        ArchiveFormat::TarXz => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let xz = xz2::read::XzDecoder::new(file);
            let mut archive = tar::Archive::new(xz);
            archive
                .unpack(destination)
                .with_context(|| format!("cannot extract tar.xz archive {}", source.display()))?;
        }
        ArchiveFormat::TarZst => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let zst = zstd::stream::read::Decoder::new(file)
                .with_context(|| "cannot create zstd decoder")?;
            let mut archive = tar::Archive::new(zst);
            archive
                .unpack(destination)
                .with_context(|| format!("cannot extract tar.zst archive {}", source.display()))?;
        }
        ArchiveFormat::TarLz4 => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let lz = lz4::Decoder::new(file)
                .with_context(|| "cannot create lz4 decoder")?;
            let mut archive = tar::Archive::new(lz);
            archive
                .unpack(destination)
                .with_context(|| format!("cannot extract tar.lz4 archive {}", source.display()))?;
        }
        ArchiveFormat::Zip => {
            let file = fs::File::open(source)
                .with_context(|| format!("cannot open archive {}", source.display()))?;
            let mut archive = zip::ZipArchive::new(file)
                .with_context(|| format!("cannot read zip archive {}", source.display()))?;
            archive
                .extract(destination)
                .with_context(|| format!("cannot extract zip archive {}", source.display()))?;
        }
    }
    Ok(())
}

/// Decompress a single compressed file to a destination path.
///
/// Supports gz, bz2, xz, zst, and lz4 formats.
pub fn decompress_file(source: &Path, destination: &Path, format: DecompressFormat) -> Result<()> {
    let input = fs::File::open(source)
        .with_context(|| format!("cannot open compressed file {}", source.display()))?;
    let mut output = fs::File::create(destination)
        .with_context(|| format!("cannot create output file {}", destination.display()))?;

    match format {
        DecompressFormat::Gz => {
            let mut decoder = flate2::read::GzDecoder::new(input);
            io::copy(&mut decoder, &mut output)?;
        }
        DecompressFormat::Bz2 => {
            let mut decoder = bzip2::read::BzDecoder::new(input);
            io::copy(&mut decoder, &mut output)?;
        }
        DecompressFormat::Xz => {
            let mut decoder = xz2::read::XzDecoder::new(input);
            io::copy(&mut decoder, &mut output)?;
        }
        DecompressFormat::Zst => {
            let mut decoder =
                zstd::stream::read::Decoder::new(input).with_context(|| "cannot create zstd decoder")?;
            io::copy(&mut decoder, &mut output)?;
        }
        DecompressFormat::Lz4 => {
            let mut decoder =
                lz4::Decoder::new(input).with_context(|| "cannot create lz4 decoder")?;
            io::copy(&mut decoder, &mut output)?;
        }
    }
    Ok(())
}

/// Encode bytes as lowercase hexadecimal.
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// Use our own hex encoding to avoid adding a hex crate dependency.
// The sha2 crate returns GenericArray which we convert via our hex_encode above.
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        super::hex_encode(bytes.as_ref())
    }
}
