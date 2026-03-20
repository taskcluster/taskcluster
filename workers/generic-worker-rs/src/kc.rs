//! macOS keychain password encoding/decoding for auto-login.
//!
//! This module provides functions for encoding/decoding macOS user passwords
//! for use in the `/etc/kcpassword` file. This is essentially a Rust port of
//! <http://www.brock-family.org/gavin/perl/kcpassword.html> and the Go
//! implementation in `kc/kc.go`.

#[cfg(target_os = "macos")]
use anyhow::{Context, Result};
#[cfg(target_os = "macos")]
use serde_json;
#[cfg(target_os = "macos")]
use std::collections::HashMap;

/// The XOR key used for encoding/decoding kcpassword entries.
#[cfg(target_os = "macos")]
pub const MAGIC_KEY: &[u8] = &[0x7D, 0x89, 0x52, 0x23, 0xD2, 0xBC, 0xDD, 0xEA, 0xA3, 0xB9, 0x1F];

/// XOR-encode a password for `/etc/kcpassword`.
///
/// The password is padded with null bytes so that `(len(password) + 1)` is
/// aligned to `(len(MAGIC_KEY) + 1)`, then each byte is XORed with the
/// corresponding byte of `MAGIC_KEY` (cycling).
#[cfg(target_os = "macos")]
pub fn encode(password: &[u8]) -> Vec<u8> {
    let key_len = MAGIC_KEY.len();
    let overflow = (password.len() + 1) % (key_len + 1);
    let padding_length = if overflow > 0 {
        1 + key_len + 1 - overflow
    } else {
        1
    };

    let mut data = Vec::with_capacity(password.len() + padding_length);
    data.extend_from_slice(password);
    data.resize(password.len() + padding_length, 0);

    for j in 0..data.len() {
        data[j] ^= MAGIC_KEY[j % key_len];
    }
    data
}

/// XOR-decode an encoded password from `/etc/kcpassword`.
///
/// Decodes by XORing with `MAGIC_KEY` and stops at the first null byte.
#[cfg(target_os = "macos")]
pub fn decode(encoded: &[u8]) -> Vec<u8> {
    let key_len = MAGIC_KEY.len();
    let mut data = Vec::with_capacity(encoded.len());

    for j in 0..encoded.len() {
        let b = encoded[j] ^ MAGIC_KEY[j % key_len];
        if b == 0 {
            return data;
        }
        data.push(b);
    }
    data
}

/// Set automatic login for the given user with the given password.
///
/// This writes the loginwindow preferences and encodes the password
/// into `/etc/kcpassword`.
#[cfg(target_os = "macos")]
pub fn set_auto_login(user: &str, password: &[u8]) -> Result<()> {
    crate::host::run(
        "defaults",
        &[
            "write",
            "/Library/Preferences/com.apple.loginwindow",
            "autoLoginUser",
            "-string",
            user,
        ],
    )
    .context("error setting autoLoginUser")?;

    crate::host::run(
        "defaults",
        &[
            "write",
            "/Library/Preferences/com.apple.loginwindow",
            "autoLoginUserScreenLocked",
            "-bool",
            "false",
        ],
    )
    .context("error setting autoLoginUserScreenLocked")?;

    let encoded_password = encode(password);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write("/etc/kcpassword", &encoded_password)?;
        std::fs::set_permissions("/etc/kcpassword", std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

/// Read back the auto-login user and their encoded password.
///
/// Returns `(username, decoded_password)`.
#[cfg(target_os = "macos")]
pub fn auto_login_user() -> Result<(String, Vec<u8>)> {
    let user = auto_login_username()?;
    let password = auto_login_password()?;
    Ok((user, password))
}

/// Read the auto-login username from loginwindow preferences.
#[cfg(target_os = "macos")]
pub fn auto_login_username() -> Result<String> {
    let output = crate::host::output(
        "defaults",
        &[
            "read",
            "/Library/Preferences/com.apple.loginwindow",
            "autoLoginUser",
        ],
    )
    .context("error reading autoLoginUser")?;
    Ok(output.trim().to_string())
}

/// Read and decode the auto-login password from `/etc/kcpassword`.
#[cfg(target_os = "macos")]
pub fn auto_login_password() -> Result<Vec<u8>> {
    let encoded_password = std::fs::read("/etc/kcpassword")?;
    Ok(decode(&encoded_password))
}

/// Read the loginwindow plist as a JSON map.
#[cfg(target_os = "macos")]
pub fn login_window_plist() -> Result<HashMap<String, serde_json::Value>> {
    let output = crate::host::output(
        "/usr/bin/plutil",
        &[
            "-convert",
            "json",
            "/Library/Preferences/com.apple.loginwindow.plist",
            "-o",
            "-",
        ],
    )?;
    let data: HashMap<String, serde_json::Value> = serde_json::from_str(&output)?;
    Ok(data)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let password = b"mysecretpassword";
        let encoded = encode(password);
        let decoded = decode(&encoded);
        assert_eq!(decoded, password);
    }

    #[test]
    fn test_encode_decode_short() {
        let password = b"abc";
        let encoded = encode(password);
        let decoded = decode(&encoded);
        assert_eq!(decoded, password);
    }

    #[test]
    fn test_encode_decode_empty() {
        let password = b"";
        let encoded = encode(password);
        let decoded = decode(&encoded);
        assert_eq!(decoded, password);
    }
}
